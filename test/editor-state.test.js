import test from 'node:test';
import assert from 'node:assert/strict';
import { restorePosition, moveRackTile } from '../dist/editor-state.js';

const circle = { color: 0, shape: 0 }, square = { color: 0, shape: 1 };
test('unfinished positions survive reload even with invalid lines or excess copies', () => {
  const saved = { board: [{ ...circle, x: 0, y: 0 }, { color: 4, shape: 1, x: 1, y: 0 }], rack: [circle, circle, circle], bagEmpty: true };
  assert.deepEqual(restorePosition(saved), saved);
  assert.deepEqual(restorePosition({ board: [{ ...circle, x: 5, y: 5 }, { ...square, x: 0, y: 0 }], rack: [] })?.rack, []);
});
test('malformed saved data is rejected without rendering it', () => {
  for (const saved of [null, {}, { board: [], rack: Array(7).fill(circle) },
    { board: [{ ...circle, x: 0.5, y: 0 }], rack: [] },
    { board: [], rack: [{ color: -1, shape: 0 }] },
    { board: Array(2).fill({ ...circle, x: 0, y: 0 }), rack: [] }]) assert.equal(restorePosition(saved), null);
});
test('rack moves preserve duplicates, order, and the original snapshot', () => {
  const duplicate = { ...circle }, rack = [circle, square, duplicate];
  const moved = moveRackTile(rack, 0, 2);
  assert.deepEqual(moved, [square, duplicate, circle]);
  assert.equal(moved[2], circle);
  assert.deepEqual(rack, [circle, square, duplicate]);
  assert.deepEqual(moveRackTile(moved, 2, 0), rack);
  assert.deepEqual(moveRackTile(rack, 0, 5), moved);
});
test('invalid or unchanged rack destinations leave the rack untouched', () => {
  const rack = [circle, square];
  for (const [from, to] of [[0, 0], [1, 5], [0, -1], [0, 6], [2, 0], [-1, 0], [0.5, 1]]) assert.equal(moveRackTile(rack, from, to), rack);
});
