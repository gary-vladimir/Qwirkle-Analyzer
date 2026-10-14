export const COLORS = ['Red', 'Orange', 'Yellow', 'Green', 'Blue', 'Purple'];
export const SHAPES = ['Circle', 'Square', 'Diamond', 'Clover', 'Four-point star', 'Starburst'];
export const key = (x, y) => `${x},${y}`;
export const tileName = t => `${COLORS[t.color]} ${SHAPES[t.shape].toLowerCase()}`;
const type = t => t.color * 6 + t.shape;
const directions = [[1, 0], [0, 1]];
const neighbors = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const tileOK = t => t && Number.isInteger(t.color) && t.color >= 0 && t.color < 6 && Number.isInteger(t.shape) && t.shape >= 0 && t.shape < 6;

export function validLine(tiles) {
  return tiles.length <= 6 && new Set(tiles.map(type)).size === tiles.length &&
    (tiles.every(t => t.color === tiles[0].color) || tiles.every(t => t.shape === tiles[0].shape));
}

export function lineAt(board, x, y, dx, dy) {
  while (board.has(key(x - dx, y - dy))) { x -= dx; y -= dy; }
  const tiles = [];
  while (board.has(key(x, y))) { tiles.push(board.get(key(x, y))); x += dx; y += dy; }
  return tiles;
}

export function validatePosition(tiles, rack) {
  const errors = [];
  if (!Array.isArray(tiles) || !Array.isArray(rack)) return ['The board and rack must be lists of tiles.'];
  if (rack.length > 6) errors.push('Your rack can hold at most six tiles.');
  if (tiles.length + rack.length > 108) errors.push('There are only 108 tiles in a Qwirkle set.');
  if (tiles.some(t => !tileOK(t) || !Number.isSafeInteger(t.x) || !Number.isSafeInteger(t.y) || Math.abs(t.x) > 10000 || Math.abs(t.y) > 10000) || rack.some(t => !tileOK(t))) return ['A tile has an invalid color, shape, or coordinate.'];
  const board = new Map(tiles.map(t => [key(t.x, t.y), t]));
  if (board.size !== tiles.length) errors.push('Two board tiles occupy the same square.');
  const counts = new Map();
  for (const t of [...tiles, ...rack]) counts.set(type(t), (counts.get(type(t)) || 0) + 1);
  for (const [id, count] of counts) if (count > 3) errors.push(`${tileName({ color: Math.floor(id / 6), shape: id % 6 })}: ${count} copies entered; the set has only three.`);
  for (const t of tiles) for (const [dx, dy] of directions) {
    if (board.has(key(t.x - dx, t.y - dy))) continue;
    const line = lineAt(board, t.x, t.y, dx, dy);
    if (!validLine(line)) errors.push(`Invalid ${dx ? 'horizontal' : 'vertical'} line at (${t.x}, ${t.y}): use one color or one shape, no duplicates, and at most six tiles.`);
  }
  if (tiles.length) {
    const seen = new Set([key(tiles[0].x, tiles[0].y)]), queue = [tiles[0]];
    for (let i = 0; i < queue.length; i++) for (const [dx, dy] of neighbors) {
      const k = key(queue[i].x + dx, queue[i].y + dy);
      if (board.has(k) && !seen.has(k)) { seen.add(k); queue.push(board.get(k)); }
    }
    if (seen.size !== board.size) errors.push('The board must be connected edge to edge. Diagonal contact does not count.');
  }
  return errors;
}

export function scoreMove(tiles, placements, rackSize, bagEmpty = false) {
  const board = new Map([...tiles, ...placements].map(t => [key(t.x, t.y), t]));
  const lines = [], seen = new Set();
  for (const t of placements) for (const [dx, dy] of directions) {
    const line = lineAt(board, t.x, t.y, dx, dy);
    if (line.length < 2) continue;
    const id = `${dx}:${key(line[0].x, line[0].y)}`;
    if (seen.has(id)) continue;
    seen.add(id);
    lines.push({ axis: dx ? 'Horizontal' : 'Vertical', start: { x: line[0].x, y: line[0].y }, length: line.length, points: line.length + (line.length === 6 ? 6 : 0) });
  }
  if (!lines.length && placements.length) lines.push({ axis: 'Opening tile', start: { x: placements[0].x, y: placements[0].y }, length: 1, points: 1 });
  const endBonus = bagEmpty && placements.length === rackSize && rackSize > 0 ? 6 : 0;
  return { score: lines.reduce((sum, l) => sum + l.points, endBonus), lines, endBonus };
}

export function openingSize(rack) {
  let max = 0;
  for (const field of ['color', 'shape']) for (let value = 0; value < 6; value++) {
    max = Math.max(max, new Set(rack.filter(t => t[field] === value).map(type)).size);
  }
  return max;
}

// Every legal move occupies a single, uninterrupted final line of at most six
// tiles. That line contains a new tile adjacent to the old board. Enumerate
// every such segment, then every distinct rack assignment to its empty cells.
// Perpendicular lines are independent because all new tiles share one axis.
export function analyze(tiles, rack, { bagEmpty = false, limit = 100 } = {}) {
  const errors = validatePosition(tiles, rack);
  if (errors.length) return { errors, moves: [], totalMoves: 0, bestCount: 0 };
  if (!rack.length) return { errors: ['Add at least one tile to your rack.'], moves: [], totalMoves: 0, bestCount: 0 };
  const board = new Map(tiles.map(t => [key(t.x, t.y), t]));
  const uniqueRack = [...new Map(rack.map(t => [type(t), t])).values()];
  const segments = new Map(), frontier = new Map();
  if (!board.size) {
    // Translation and rotation do not change an opening. Normalize to row 0.
    const length = openingSize(rack);
    segments.set('opening', { x: 0, y: 0, dx: 1, dy: 0, length });
  } else {
    for (const t of tiles) for (const [dx, dy] of neighbors) {
      const x = t.x + dx, y = t.y + dy;
      if (!board.has(key(x, y))) frontier.set(key(x, y), { x, y });
    }
    for (const a of frontier.values()) for (const [dx, dy] of directions) {
      for (let offset = 0; offset < 6; offset++) for (let length = offset + 1; length <= 6; length++) {
        const x = a.x - offset * dx, y = a.y - offset * dy;
        if (board.has(key(x - dx, y - dy)) || board.has(key(x + length * dx, y + length * dy))) continue;
        segments.set(`${x},${y},${dx},${length}`, { x, y, dx, dy, length });
      }
    }
  }
  let totalMoves = 0, bestScore = -1, bestCount = 0;
  const moves = [], seenSingles = new Set();
  for (const s of segments.values()) {
    const existing = [], holes = [];
    for (let i = 0; i < s.length; i++) {
      const x = s.x + i * s.dx, y = s.y + i * s.dy, old = board.get(key(x, y));
      if (old) existing.push(old); else holes.push({ x, y });
    }
    if (!holes.length || holes.length > uniqueRack.length || !validLine(existing)) continue;
    const options = holes.map(p => uniqueRack.filter(t => {
      // Read the perpendicular line with this prospective tile in its center.
      const cross = [t];
      for (const sign of [-1, 1]) {
        let x = p.x + s.dy * sign, y = p.y + s.dx * sign;
        while (board.has(key(x, y))) { cross.push(board.get(key(x, y))); x += s.dy * sign; y += s.dx * sign; }
      }
      return validLine(cross);
    }));
    if (options.some(o => !o.length)) continue;
    const placed = [], main = [...existing];
    function search(index) {
      if (index === holes.length) {
        if (placed.length === 1) {
          const id = `${key(placed[0].x, placed[0].y)}:${type(placed[0])}`;
          if (seenSingles.has(id)) return;
          seenSingles.add(id);
        }
        totalMoves++;
        const scored = scoreMove(tiles, placed, rack.length, bagEmpty);
        if (scored.score > bestScore) { bestScore = scored.score; bestCount = 1; }
        else if (scored.score === bestScore) bestCount++;
        const move = { placements: placed.map(t => ({ ...t })), ...scored };
        moves.push(move);
        // Keep exact totals and the best display candidates without storing all.
        if (moves.length > limit * 2) { moves.sort(compareMoves); moves.length = limit; }
        return;
      }
      for (const t of options[index]) {
        main.push(t);
        if (validLine(main)) { placed.push({ ...holes[index], color: t.color, shape: t.shape }); search(index + 1); placed.pop(); }
        main.pop();
      }
    }
    search(0);
  }
  moves.sort(compareMoves);
  return { errors: [], moves: moves.slice(0, limit), totalMoves, bestCount, bestScore: bestScore < 0 ? 0 : bestScore, opening: !board.size };
}

function compareMoves(a, b) {
  return b.score - a.score || b.placements.length - a.placements.length ||
    JSON.stringify(a.placements).localeCompare(JSON.stringify(b.placements));
}
