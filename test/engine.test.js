import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze, validLine, validatePosition, scoreMove } from '../dist/engine.js';

const t = (x, y, color, shape) => ({ x, y, color, shape });
const r = (color, shape) => ({ color, shape });
const signature = placements => placements.map(p => `${p.x},${p.y}:${p.color},${p.shape}`).sort().join('|');

test('lines require one shared attribute, unique tiles, and at most six', () => {
  assert.ok(validLine([r(0, 0), r(0, 1), r(0, 2)]));
  assert.ok(validLine([r(0, 0), r(1, 0)]));
  assert.equal(validLine([r(0, 0), r(0, 0)]), false);
  assert.equal(validLine([r(0, 0), r(0, 1), r(1, 1)]), false);
  assert.equal(validLine(Array.from({ length: 7 }, (_, i) => r(0, i))), false);
});

test('position validation catches disconnected tiles, illegal lines, and fourth copies', () => {
  assert.match(validatePosition([t(0, 0, 0, 0), t(1, 1, 0, 1)], [])[0], /connected/);
  assert.match(validatePosition([t(0, 0, 0, 0), t(1, 0, 1, 1)], [])[0], /Invalid/);
  assert.match(validatePosition([t(0, 0, 0, 0)], [r(0, 0), r(0, 0), r(0, 0)])[0], /only three/);
  assert.ok(validatePosition([t(0, 0, 0, 0), t(0, 0, 1, 0)], []).some(e => /same square/.test(e)));
});

test('opening uses the largest matching set and never repeats identical rack tiles', () => {
  const result = analyze([], [r(0, 0), r(0, 1), r(0, 1), r(0, 2), r(1, 4)]);
  assert.equal(result.bestScore, 3);
  assert.equal(result.totalMoves, 6);
  assert.ok(result.moves.every(m => m.placements.length === 3));
  assert.equal(analyze([], [r(2, 3)]).bestScore, 1);
  const six = analyze([], Array.from({ length: 6 }, (_, shape) => r(0, shape)));
  assert.equal(six.bestScore, 12);
  assert.equal(six.totalMoves, 720);
});

test('crossing lines score once each, including two Qwirkles and the end bonus', () => {
  const board = [];
  for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) if (x !== 5 || y !== 5) board.push(t(x, y, y, x));
  const result = analyze(board, [r(5, 5)], { bagEmpty: true });
  assert.deepEqual(result.errors, []);
  assert.equal(result.bestScore, 30);
  assert.equal(result.moves[0].lines.length, 2);
  assert.equal(result.moves[0].endBonus, 6);
  assert.deepEqual(result.moves[0].placements, [t(5, 5, 5, 5)]);
  assert.equal(analyze(board, [r(5, 5)]).bestScore, 24);
});

test('multi-tile move scores the main line once and every perpendicular line', () => {
  const board = [t(0, 0, 0, 0), t(1, 0, 0, 1), t(0, 1, 1, 0), t(1, 1, 1, 1)];
  const placements = [t(2, 0, 0, 2), t(2, 1, 1, 2)];
  const score = scoreMove(board, placements, 2);
  assert.equal(score.score, 8);
  assert.equal(score.lines.length, 3);
  assert.ok(analyze(board, [r(0, 2), r(1, 2)], { limit: 10000 }).moves.some(m => signature(m.placements) === signature(placements)));
});

test('search includes extensions on both sides of an existing tile', () => {
  const result = analyze([t(0, 0, 0, 1)], [r(0, 0), r(0, 2)], { limit: 10000 });
  const move = result.moves.find(m => signature(m.placements) === signature([t(-1, 0, 0, 0), t(1, 0, 0, 2)]));
  assert.ok(move);
  assert.equal(move.score, 3);
});

test('search includes filling a gap and extending the same line', () => {
  const board = [t(0, 0, 0, 0), t(2, 0, 0, 2), t(0, 1, 1, 0), t(1, 1, 1, 1), t(2, 1, 1, 2)];
  const result = analyze(board, [r(0, 1), r(0, 3)], { limit: 10000 });
  assert.deepEqual(result.errors, []);
  const move = result.moves.find(m => signature(m.placements) === signature([t(1, 0, 0, 1), t(3, 0, 0, 3)]));
  assert.ok(move);
  assert.equal(move.score, 6);
});

test('no move, empty rack, and invalid input are distinct outcomes', () => {
  const result = analyze([t(0, 0, 0, 0)], [r(1, 1)]);
  assert.deepEqual(result.errors, []);
  assert.equal(result.totalMoves, 0);
  assert.match(analyze([], []).errors[0], /rack/);
  assert.ok(analyze([t(0, 0, 0, 0), t(1, 0, 0, 0)], [r(0, 1)]).errors.length);
});

// Independent reference: enumerate arbitrary subsets of empty coordinates and
// rack assignments, then validate and score the complete resulting geometry.
// It does not use the production candidate generator, line validator, or scorer.
function reference(board, rack) {
  const old = new Map(board.map(p => [`${p.x},${p.y}`, p]));
  const out = new Map(), cells = [], n = rack.length;
  const xs = board.map(p => p.x), ys = board.map(p => p.y);
  for (let y = Math.min(...ys) - n; y <= Math.max(...ys) + n; y++) for (let x = Math.min(...xs) - n; x <= Math.max(...xs) + n; x++) if (!old.has(`${x},${y}`)) cells.push({ x, y });
  const legalLine = line => line.length <= 6 && new Set(line.map(p => `${p.color},${p.shape}`)).size === line.length &&
    (new Set(line.map(p => p.color)).size === 1 || new Set(line.map(p => p.shape)).size === 1);
  function check(placed) {
    const sameX = placed.every(p => p.x === placed[0].x), sameY = placed.every(p => p.y === placed[0].y);
    if (!sameX && !sameY) return;
    if (!legalLine(placed)) return;
    const all = [...board, ...placed], map = new Map(all.map(p => [`${p.x},${p.y}`, p]));
    if (placed.length > 1) {
      const axis = sameY ? 'x' : 'y', fixed = sameY ? 'y' : 'x';
      for (let i = Math.min(...placed.map(p => p[axis])); i <= Math.max(...placed.map(p => p[axis])); i++) {
        const p = { [axis]: i, [fixed]: placed[0][fixed] };
        if (!map.has(`${p.x},${p.y}`)) return;
      }
    }
    if (!placed.some(p => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => old.has(`${p.x + dx},${p.y + dy}`)))) return;
    let score = 0;
    for (const axis of ['x', 'y']) {
      const fixed = axis === 'x' ? 'y' : 'x', groups = new Map();
      for (const p of all) { if (!groups.has(p[fixed])) groups.set(p[fixed], []); groups.get(p[fixed]).push(p); }
      for (const group of groups.values()) {
        group.sort((a, b) => a[axis] - b[axis]);
        const runs = []; let run = [];
        for (const p of group) { if (run.length && p[axis] !== run.at(-1)[axis] + 1) { runs.push(run); run = []; } run.push(p); }
        runs.push(run);
        for (const line of runs) {
          if (!legalLine(line)) return;
          if (line.length > 1 && line.some(p => placed.includes(p))) score += line.length + (line.length === 6 ? 6 : 0);
        }
      }
    }
    out.set(signature(placed), score);
  }
  function enumerate(placed, start, used) {
    if (placed.length) check(placed);
    if (placed.length === n) return;
    for (let i = start; i < cells.length; i++) for (let j = 0; j < n; j++) {
      if (used & (1 << j)) continue;
      enumerate([...placed, { ...cells[i], ...rack[j] }], i + 1, used | (1 << j));
    }
  }
  enumerate([], 0, 0);
  return out;
}

test('all moves and scores match independent brute force across seeded positions', () => {
  let seed = 123456;
  const random = n => { seed = (1664525 * seed + 1013904223) >>> 0; return seed % n; };
  const boards = [
    [t(0, 0, 0, 0)],
    [t(0, 0, 0, 0), t(1, 0, 0, 1)],
    [t(0, 0, 0, 0), t(1, 0, 0, 1), t(0, 1, 1, 0)],
    [t(0, 0, 0, 0), t(1, 0, 0, 1), t(0, 1, 1, 0), t(1, 1, 1, 1)],
  ];
  for (let i = 0; i < 28; i++) {
    const board = boards[i % boards.length], rack = [r(random(3), random(3)), r(random(3), random(3))];
    const expected = reference(board, rack), actual = analyze(board, rack, { limit: 100000 });
    assert.deepEqual(actual.errors, []);
    assert.equal(actual.totalMoves, expected.size, `Case ${i}: all moves`);
    assert.deepEqual(new Map(actual.moves.map(m => [signature(m.placements), m.score])), expected, `Case ${i}: placements and scores`);
  }
});

test('three-tile exhaustive comparison covers rack permutations and partial plays', () => {
  const board = [t(0, 0, 0, 0)], rack = [r(0, 1), r(0, 2), r(1, 1)];
  const expected = reference(board, rack), actual = analyze(board, rack, { limit: 100000 });
  assert.equal(actual.totalMoves, expected.size);
  assert.deepEqual(new Map(actual.moves.map(m => [signature(m.placements), m.score])), expected);
});
