
// ==UserScript==
// @name        miro shortcut script
// @namespace   Violentmonkey Scripts
// @description Adds shortcuts for color selection.
// @match       https://miro.com/*
// @version     1.0.1
// @author      Dirk Heinke
// @grant       GM_addStyle
// @grant       GM_getValue
// @grant       GM_setValue
// ==/UserScript==

(function () {
'use strict';

/*! @violentmonkey/shortcut v1.2.6 | ISC License */
function _extends() {
  _extends = Object.assign || function (target) {
    for (var i = 1; i < arguments.length; i++) {
      var source = arguments[i];

      for (var key in source) {
        if (Object.prototype.hasOwnProperty.call(source, key)) {
          target[key] = source[key];
        }
      }
    }

    return target;
  };

  return _extends.apply(this, arguments);
}

const isMacintosh = navigator.userAgent.includes('Macintosh');
const modifiers = {
  c: 'c',
  s: 's',
  a: 'a',
  m: 'm',
  ctrl: 'c',
  control: 'c',
  // macOS
  shift: 's',
  alt: 'a',
  meta: 'm',
  ctrlcmd: isMacintosh ? 'm' : 'c'
};
const aliases = {
  arrowup: 'up',
  arrowdown: 'down',
  arrowleft: 'left',
  arrowright: 'right',
  enter: 'cr',
  escape: 'esc',
  ' ': 'space'
};
function reprKey(base, mod, caseSensitive = false) {
  const {
    c,
    s,
    a,
    m
  } = mod;
  if (!caseSensitive || base.length > 1) base = base.toLowerCase();
  base = aliases[base] || base;
  return [m && 'm', c && 'c', s && 's', a && 'a', base].filter(Boolean).join('-');
}
function normalizeKey(shortcut, caseSensitive = false) {
  const parts = shortcut.split('-');
  const base = parts.pop();
  const modifierState = {};

  for (const part of parts) {
    const key = modifiers[part.toLowerCase()];
    if (!key) throw new Error(`Unknown modifier key: ${part}`);
    modifierState[key] = true;
  }

  return reprKey(base, modifierState, caseSensitive);
}
function normalizeSequence(sequence, caseSensitive) {
  return sequence.split(' ').map(key => normalizeKey(key, caseSensitive));
}
function parseCondition(condition) {
  return condition.split('&&').map(key => {
    key = key.trim();
    if (!key) return;

    if (key[0] === '!') {
      return {
        not: true,
        field: key.slice(1).trim()
      };
    }

    return {
      not: false,
      field: key
    };
  }).filter(Boolean);
}

class KeyNode {
  constructor() {
    this.children = new Map();
    this.shortcuts = new Set();
  }

  add(sequence, shortcut) {
    let node = this;

    for (const key of sequence) {
      let child = node.children.get(key);

      if (!child) {
        child = new KeyNode();
        node.children.set(key, child);
      }

      node = child;
    }

    node.shortcuts.add(shortcut);
  }

  get(sequence) {
    let node = this;

    for (const key of sequence) {
      node = node.children.get(key);
      if (!node) return null;
    }

    return node;
  }

  remove(sequence, shortcut) {
    let node = this;
    const ancestors = [node];

    for (const key of sequence) {
      node = node.children.get(key);
      if (!node) return;
      ancestors.push(node);
    }

    if (shortcut) node.shortcuts.delete(shortcut);else node.shortcuts.clear();
    let i = ancestors.length - 1;

    while (i > 1) {
      node = ancestors[i];
      if (node.shortcuts.size || node.children.size) break;
      const last = ancestors[i - 1];
      last.children.delete(sequence[i - 1]);
      i -= 1;
    }
  }

}

class KeyboardService {
  constructor() {
    this._context = {};
    this._conditionData = {};
    this._dataCI = [];
    this._dataCS = [];
    this._rootCI = new KeyNode();
    this._rootCS = new KeyNode();
    this.options = {
      sequenceTimeout: 500
    };

    this._reset = () => {
      this._curCI = null;
      this._curCS = null;

      this._resetTimer();
    };

    this.handleKey = e => {
      // Chrome sends a trusted keydown event with no key when choosing from autofill
      if (!e.key || e.key.length > 1 && modifiers[e.key.toLowerCase()]) return;

      this._resetTimer();

      const keyCS = reprKey(e.key, {
        c: e.ctrlKey,
        a: e.altKey,
        m: e.metaKey
      }, true);
      const keyCI = reprKey(e.key, {
        c: e.ctrlKey,
        s: e.shiftKey,
        a: e.altKey,
        m: e.metaKey
      });

      if (this.handleKeyOnce(keyCS, keyCI, false)) {
        e.preventDefault();

        this._reset();
      }

      this._timer = setTimeout(this._reset, this.options.sequenceTimeout);
    };
  }

  _resetTimer() {
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
  }

  _addCondition(condition) {
    let cache = this._conditionData[condition];

    if (!cache) {
      const value = parseCondition(condition);
      cache = {
        count: 0,
        value,
        result: this._evalCondition(value)
      };
      this._conditionData[condition] = cache;
    }

    cache.count += 1;
  }

  _removeCondition(condition) {
    const cache = this._conditionData[condition];

    if (cache) {
      cache.count -= 1;

      if (!cache.count) {
        delete this._conditionData[condition];
      }
    }
  }

  _evalCondition(conditions) {
    return conditions.every(cond => {
      let value = this._context[cond.field];
      if (cond.not) value = !value;
      return value;
    });
  }

  _checkShortcut(item) {
    const cache = item.condition && this._conditionData[item.condition];
    const enabled = !cache || cache.result;

    if (item.enabled !== enabled) {
      item.enabled = enabled;

      this._enableShortcut(item);
    }
  }

  _enableShortcut(item) {
    const root = item.caseSensitive ? this._rootCS : this._rootCI;

    if (item.enabled) {
      root.add(item.sequence, item);
    } else {
      root.remove(item.sequence, item);
    }
  }

  enable() {
    this.disable();
    document.addEventListener('keydown', this.handleKey);
  }

  disable() {
    document.removeEventListener('keydown', this.handleKey);
  }

  register(key, callback, options) {
    const {
      caseSensitive,
      condition
    } = _extends({
      caseSensitive: false
    }, options);

    const sequence = normalizeSequence(key, caseSensitive);
    const data = caseSensitive ? this._dataCS : this._dataCI;
    const item = {
      sequence,
      condition,
      callback,
      enabled: false,
      caseSensitive
    };
    if (condition) this._addCondition(condition);

    this._checkShortcut(item);

    data.push(item);
    return () => {
      const index = data.indexOf(item);

      if (index >= 0) {
        data.splice(index, 1);
        if (condition) this._removeCondition(condition);
        item.enabled = false;

        this._enableShortcut(item);
      }
    };
  }

  setContext(key, value) {
    this._context[key] = value;

    for (const cache of Object.values(this._conditionData)) {
      cache.result = this._evalCondition(cache.value);
    }

    for (const data of [this._dataCS, this._dataCI]) {
      for (const item of data) {
        this._checkShortcut(item);
      }
    }
  }

  handleKeyOnce(keyCS, keyCI, fromRoot) {
    var _curCS, _curCI;

    let curCS = this._curCS;
    let curCI = this._curCI;

    if (fromRoot || !curCS && !curCI) {
      // set fromRoot to true to avoid another retry
      fromRoot = true;
      curCS = this._rootCS;
      curCI = this._rootCI;
    }

    if (curCS) curCS = curCS.get([keyCS]);
    if (curCI) curCI = curCI.get([keyCI]);
    const shortcuts = [...(curCI ? curCI.shortcuts : []), ...(curCS ? curCS.shortcuts : [])].reverse();
    this._curCS = curCS;
    this._curCI = curCI;

    if (!fromRoot && !shortcuts.length && !((_curCS = curCS) != null && _curCS.children.size) && !((_curCI = curCI) != null && _curCI.children.size)) {
      // Nothing is matched with the last key, rematch from root
      return this.handleKeyOnce(keyCS, keyCI, true);
    }

    for (const shortcut of shortcuts) {
      try {
        shortcut.callback();
      } catch (_unused) {// ignore
      }

      return true;
    }
  }

}
let service;

function getService() {
  if (!service) {
    service = new KeyboardService();
    service.enable();
  }

  return service;
}

const register = (...args) => getService().register(...args);

/*! @violentmonkey/dom v2.1.3 | ISC License */

var _VM;
Object.assign(typeof VM !== 'undefined' && ((_VM = VM) == null ? void 0 : _VM.versions) || {}, {
  dom: '2.1.3'
});
/**
 * Observe an existing `node` until `callback` returns `true`.
 * The returned function can be called explicitly to disconnect the observer.
 *
 * ```js
 * VM.observe(document.body, () => {
 *   const node = document.querySelector('.profile');
 *   if (node) {
 *     console.log('It\'s there!');
 *     return true;
 *   }
 * });
 * ```
 */

function observe(node, callback, options) {
  const observer = new MutationObserver((mutations, ob) => {
    const result = callback(mutations, ob);
    if (result) disconnect();
  });
  observer.observe(node, Object.assign({
    childList: true,
    subtree: true
  }, options));

  const disconnect = () => observer.disconnect();

  return disconnect;
}

console.log('MSS - Starting miro shortcut script');
const defaultShortcuts = [['c-a-s-q', 'selectColor', 0], ['c-a-s-w', 'selectColor', 1], ['c-a-s-e', 'selectColor', 2], ['c-a-s-r', 'selectColor', 3], ['c-a-s-a', 'selectColor', 4], ['c-a-s-s', 'selectColor', 5], ['c-a-s-d', 'selectColor', 6], ['c-a-s-f', 'selectColor', 7], ['c-a-s-y', 'selectColor', 16], ['c-a-s-x', 'selectColor', 17], ['c-a-s-c', 'selectColor', 18], ['c-a-s-v', 'selectColor', 19], ['c-a-s-t', 'selectPen', 0], ['c-a-s-g', 'selectPen', 1], ['c-a-s-b', 'selectPen', 2]];
const shortcuts = GM_getValue('shortcuts_v1', defaultShortcuts);
GM_setValue('shortcuts_vDEFAULT', defaultShortcuts);
shortcuts.forEach(sc => {
  register(sc[0], async () => {
    console.log('MSS - Shortcut', sc[0]);
    switch (sc[1]) {
      case 'selectColor':
        await selectColor(sc[2]);
        return;
      case 'selectPen':
        await selectPen(sc[2]);
    }
  });
});
async function selectColor(index) {
  console.debug('Select color', index);
  await openPenMenu();
  console.debug('Pen menu opened');
  await openSelectedPenColor();
  console.debug('First color opened');
  await selectNthColorInPalette(index);
  console.debug('Color selected');
}
async function selectPen(index) {
  await openPenMenu();
  const pen = document.querySelectorAll(`[data-testid=draw-toolbar-preset-${index}]`)[0];
  if (!pen.classList.contains('toolbar-draw-panel__color-button--selected')) {
    pen.click();
  }
}
async function openPenMenu() {
  const drawingToolbar = document.querySelector('draw-toolbar-panel:not(.ng-hide)');
  if (!drawingToolbar) {
    const penButton = document.querySelectorAll('[data-testid=CreationBarButton--PEN]')[0];
    await Promise.all([waitForElement('draw-toolbar-panel:not(.ng-hide)'), penButton.click()]);
  }
}
async function openSelectedPenColor() {
  const colorPalette = document.querySelector('color-palette');
  if (!colorPalette) {
    const selectedPen = document.querySelectorAll('.toolbar-draw-panel__color-button--selected')[0];
    await Promise.all([waitForElement('color-palette'), selectedPen.click()]);
  }
}
function selectNthColorInPalette(colorIndex) {
  const colorButtons = document.querySelectorAll('[data-testid=colorPalette] button:not([aria-label="Add a custom color"])');
  const nthColor = colorButtons[colorIndex];
  const firstColor = colorButtons[0];
  if (nthColor) {
    nthColor.click();
  } else {
    firstColor.click();
    alert(`Color with index ${colorIndex} is not defined.`);
  }
}
function waitForElement(selector) {
  return new Promise(resolve => {
    observe(document.body, () => {
      const element = document.querySelector(selector);
      if (element) {
        resolve();
        return true;
      }
    });
  });
}

})();
