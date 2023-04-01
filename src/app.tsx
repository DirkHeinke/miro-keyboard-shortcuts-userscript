import { register } from '@violentmonkey/shortcut';
import { observe } from '@violentmonkey/dom';

type functionNames = 'selectColor' | 'selectPen';

console.log('MSS - Starting miro shortcut script');

const defaultShortcuts: [string, functionNames, any][] = [
  ['c-a-s-q', 'selectColor', 0],
  ['c-a-s-w', 'selectColor', 1],
  ['c-a-s-e', 'selectColor', 2],
  ['c-a-s-r', 'selectColor', 3],
  ['c-a-s-a', 'selectColor', 4],
  ['c-a-s-s', 'selectColor', 5],
  ['c-a-s-d', 'selectColor', 6],
  ['c-a-s-f', 'selectColor', 7],
  ['c-a-s-y', 'selectColor', 16],
  ['c-a-s-x', 'selectColor', 17],
  ['c-a-s-c', 'selectColor', 18],
  ['c-a-s-v', 'selectColor', 19],
  ['c-a-s-t', 'selectPen', 0],
  ['c-a-s-g', 'selectPen', 1],
  ['c-a-s-b', 'selectPen', 2],
];

const shortcuts = GM_getValue('shortcuts_v1', defaultShortcuts);

shortcuts.forEach((sc) => {
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

async function selectColor(index: number) {
  console.debug('Select color', index);
  await openPenMenu();
  console.debug('Pen menu opened');
  await openSelectedPenColor();
  console.debug('First color opened');
  await selectNthColorInPalette(index);
  console.debug('Color selected');
}

async function selectPen(index: 0 | 1 | 2) {
  await openPenMenu();

  const pen = document.querySelectorAll(
    `[data-testid=draw-toolbar-preset-${index}]`
  )[0] as HTMLElement;

  if (!pen.classList.contains('toolbar-draw-panel__color-button--selected')) {
    pen.click();
  }
}

async function openPenMenu() {
  const drawingToolbar = document.querySelector(
    'draw-toolbar-panel:not(.ng-hide)'
  );
  if (!drawingToolbar) {
    const penButton = document.querySelectorAll(
      '[data-testid=CreationBarButton--PEN]'
    )[0] as HTMLElement;

    await Promise.all([
      waitForElement('draw-toolbar-panel:not(.ng-hide)'),
      penButton.click(),
    ]);
  }
}

async function openSelectedPenColor() {
  const colorPalette = document.querySelector('color-palette');
  if (!colorPalette) {
    const selectedPen = document.querySelectorAll(
      '.toolbar-draw-panel__color-button--selected'
    )[0] as HTMLElement;

    await Promise.all([waitForElement('color-palette'), selectedPen.click()]);
  }
}

function selectNthColorInPalette(colorIndex: number) {
  const colorButtons = document.querySelectorAll(
    '[data-testid=colorPalette] button:not([aria-label="Add a custom color"])'
  );
  const nthColor = colorButtons[colorIndex] as HTMLElement;
  const firstColor = colorButtons[0] as HTMLElement;
  if (nthColor) {
    nthColor.click();
  } else {
    firstColor.click();
    alert(`Color with index ${colorIndex} is not defined.`);
  }
}

function waitForElement(selector: string): Promise<void> {
  return new Promise((resolve) => {
    observe(document.body, () => {
      const element = document.querySelector(selector);

      if (element) {
        resolve();
        return true;
      }
    });
  });
}
