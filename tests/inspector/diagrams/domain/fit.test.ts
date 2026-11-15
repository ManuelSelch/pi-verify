import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fitDiagram } from '../../../../src/inspector/diagrams/domain/fit.js';

test('fits a wide diagram to the available screen width', () => {
  assert.deepEqual(fitDiagram({ width: 2000, height: 300 }, { width: 700, height: 800 }, 1000), { width: 700, height: 105 });
});

test('fits a tall diagram to the available screen height', () => {
  assert.deepEqual(fitDiagram({ width: 400, height: 2000 }, { width: 1700, height: 900 }, 1000), { width: 180, height: 900 });
});

test('caps card and presentation chart widths without distorting the aspect ratio', () => {
  assert.deepEqual(fitDiagram({ width: 700, height: 160 }, { width: 1800, height: 900 }, 560), { width: 560, height: 128 });
  assert.deepEqual(fitDiagram({ width: 700, height: 160 }, { width: 1800, height: 900 }, 1000), { width: 1000, height: 160 * 1000 / 700 });
});

test('handles temporarily hidden or invalid-size diagrams without overflowing', () => {
  assert.deepEqual(fitDiagram({ width: 700, height: 160 }, { width: 0, height: 0 }, 560), { width: 0, height: 0 });
  assert.deepEqual(fitDiagram({ width: NaN, height: 160 }, { width: 700, height: 800 }, 560), { width: 0, height: 0 });
});
