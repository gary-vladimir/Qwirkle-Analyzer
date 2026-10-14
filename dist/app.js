import { COLORS, SHAPES, key, tileName, validatePosition } from './engine.js';
import { TILE_ART, TILE_COLORS, TILE_FACE } from './tile-art.js';

const $ = id => document.getElementById(id);
function icon(t) {
  const art = TILE_ART[t.shape];
  return `<svg viewBox="${art.viewBox}" aria-hidden="true"><path fill="${TILE_FACE}" d="${art.face}"/><path fill="${TILE_COLORS[t.color]}" d="${art.symbol}"/></svg>`;
}
function tileMarkup(t, number = '') { return `<span class="tile">${icon(t)}${number ? `<span class="move-number">${number}</span>` : ''}</span>`; }
let board = [], rack = [], bagEmpty = false, selected = { color: 0, shape: 0 }, erasing = false;
let result = null, moveIndex = 0, worker = null, cellSize = 48, history = [];
let panning = false, pickerTarget = null, pickerColor = 0, dragging = null, suppressClick = false;
const storageKey = 'qwirkle-analyzer-v1';
try {
  const saved = JSON.parse(localStorage.getItem(storageKey));
  if (saved && Array.isArray(saved.board) && Array.isArray(saved.rack)) {
    // Accept incomplete editing positions, but reject malformed stored data.
    const errors = validatePosition(saved.board, saved.rack);
    if (!errors.some(e => /invalid color|lists of tiles|108 tiles|at most six|same square/.test(e))) {
      board = saved.board; rack = saved.rack; bagEmpty = !!saved.bagEmpty;
    }
  }
} catch { /* A fresh workspace is safe if storage is unavailable. */ }

function save() {
  try { localStorage.setItem(storageKey, JSON.stringify({ board, rack, bagEmpty })); }
  catch { $('status').textContent = 'Browser storage is unavailable. Keep this tab open to retain the position.'; }
}
function remember() { history.push(JSON.stringify({ board, rack, bagEmpty })); if (history.length > 100) history.shift(); }
function stopSearch() { if (worker) worker.terminate(); worker = null; renderAction(); }
function reveal(id) {
  const el = $(id);
  el.focus({ preventScroll: true });
  el.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
}
function renderAction() {
  const move = result?.moves?.[moveIndex];
  $('analyze').innerHTML = worker ? 'Searching… <span>Cancel</span>' : move ? 'View best move <span aria-hidden="true">↓</span>' : 'Find best move <span aria-hidden="true">↗</span>';
  $('action-title').textContent = worker ? 'Checking every legal play' : move ? `${result.bestScore} points · best possible` : 'Your best move awaits';
  $('action-hint').textContent = worker ? 'You can cancel anytime' : move ? `${result.totalMoves.toLocaleString()} plays checked` : rack.length ? `${rack.length} of 6 rack tiles ready` : 'Add your rack to get started';
  $('preview-link').hidden = !move;
  if (move) $('preview-link').textContent = `${move.score} points · ${move.placements.length} outlined tiles · See move details ↓`;
}
function renderTools() {
  $('active-tile').innerHTML = tileMarkup(selected);
  $('selected-label').textContent = tileName(selected);
  $('choose-tile').classList.toggle('active', !erasing && !panning);
  $('erase').setAttribute('aria-pressed', String(erasing));
  $('pan').setAttribute('aria-pressed', String(panning));
  $('board').classList.toggle('pan', panning);
  $('board-help').textContent = panning ? 'Drag to explore · Placement paused' : erasing ? 'Tap a tile to remove it' : 'Tap to place · Drag to explore';
}
function openPicker(target = null) {
  pickerTarget = target;
  pickerColor = (target !== null && rack[target] ? rack[target] : selected).color;
  $('picker-title').textContent = target === null ? 'Choose a table tile' : `Choose rack tile ${target + 1}`;
  $('picker-hint').textContent = target === null ? 'Choose a color, then a shape. Tap the table to place it.' : 'Choose a color, then tap a shape to add it to your rack.';
  $('remove-rack-tile').hidden = target === null || !rack[target];
  renderPalette();
  $('tile-picker').showModal();
}
function chooseTile(t) {
  $('tile-picker').close();
  if (pickerTarget !== null) {
    const index = Math.min(pickerTarget, rack.length);
    if (rack[index]?.color === t.color && rack[index]?.shape === t.shape) return;
    remember(); rack[index] = t; changed(`${tileName(t)} added to your rack.`);
    $('rack').children[index]?.focus({ preventScroll: true });
  } else {
    selected = t; erasing = false; panning = false; renderTools();
  }
}
function changed(message = '') {
  stopSearch(); result = null; moveIndex = 0; $('status').textContent = message; save(); render();
}
function preview() { return result?.moves?.[moveIndex]?.placements || []; }
function renderPalette() {
  $('colors').replaceChildren();
  COLORS.forEach((name, color) => {
    const button = document.createElement('button');
    button.className = 'color-button';
    button.style.setProperty('--swatch', TILE_COLORS[color]);
    button.setAttribute('aria-label', name);
    button.setAttribute('aria-pressed', String(pickerColor === color));
    button.innerHTML = `<span aria-hidden="true" style="color:${color === 2 ? '#263e35' : '#fff'}">${pickerColor === color ? '✓' : ''}</span>`;
    button.onclick = () => { pickerColor = color; renderPalette(); $('colors').children[color].focus(); };
    $('colors').append(button);
  });
  $('color-name').textContent = COLORS[pickerColor];
  $('palette').replaceChildren();
  SHAPES.forEach((name, shape) => {
    const t = { color: pickerColor, shape }, button = document.createElement('button');
    const current = pickerTarget === null ? selected : rack[pickerTarget];
    button.className = 'shape-button';
    button.innerHTML = `${tileMarkup(t)}<span>${name}</span>`;
    button.setAttribute('aria-label', tileName(t));
    button.setAttribute('aria-pressed', String(current?.color === t.color && current?.shape === shape));
    button.onclick = () => chooseTile(t);
    $('palette').append(button);
  });
}
function renderRack() {
  $('rack').replaceChildren();
  for (let i = 0; i < 6; i++) {
    const t = rack[i], button = document.createElement('button');
    button.className = t ? 'tile' : 'rack-empty'; button.innerHTML = t ? icon(t) : '+';
    button.setAttribute('aria-label', t ? `Change ${tileName(t)} in rack slot ${i + 1}` : `Choose tile for rack slot ${i + 1}`);
    button.setAttribute('aria-haspopup', 'dialog');
    button.onclick = () => openPicker(i);
    $('rack').append(button);
  }
  $('rack-count').textContent = `${rack.length} / 6`; $('bag-empty').checked = bagEmpty;
}
function fitBoard() {
  const all = [...board, ...preview()];
  if (all.length) {
    const width = Math.max(...all.map(t => t.x)) - Math.min(...all.map(t => t.x)) + 3;
    const height = Math.max(...all.map(t => t.y)) - Math.min(...all.map(t => t.y)) + 3;
    cellSize = Math.max(28, Math.min(56, Math.floor(Math.min(($('board-viewport').clientWidth - 24) / width, ($('board-viewport').clientHeight - 56) / height))));
  } else cellSize = 48;
  renderBoard(true);
}
function renderBoard(center = false) {
  const grid = $('board'), viewport = $('board-viewport'), placed = preview();
  const all = [...board, ...placed];
  const xs = all.map(t => t.x), ys = all.map(t => t.y);
  const minX = Math.min(-7, ...xs.map(x => x - 6)), maxX = Math.max(7, ...xs.map(x => x + 6));
  const minY = Math.min(-6, ...ys.map(y => y - 6)), maxY = Math.max(6, ...ys.map(y => y + 6));
  const oldMinX = Number(grid.dataset.minX ?? minX), oldMinY = Number(grid.dataset.minY ?? minY);
  const scrollLeft = viewport.scrollLeft + (oldMinX - minX) * cellSize, scrollTop = viewport.scrollTop + (oldMinY - minY) * cellSize;
  grid.dataset.minX = minX; grid.dataset.minY = minY;
  grid.style.setProperty('--cell', `${cellSize}px`); grid.style.gridTemplateColumns = `repeat(${maxX - minX + 1}, var(--cell))`;
  const occupied = new Map(board.map(t => [key(t.x, t.y), t])), suggestions = new Map(placed.map((t, i) => [key(t.x, t.y), { ...t, number: i + 1 }]));
  const fragment = document.createDocumentFragment();
  for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
    const old = occupied.get(key(x, y)), suggestion = suggestions.get(key(x, y)), t = old || suggestion;
    const button = document.createElement('button');
    button.className = 'cell' + (suggestion ? ' preview' : '') + (!x && !y ? ' origin' : '');
    button.dataset.x = x; button.dataset.y = y;
    button.setAttribute('aria-label', `${t ? tileName(t) : 'Empty square'} at (${x}, ${y})${suggestion ? ', suggested move' : ''}`);
    button.title = `(${x}, ${y})${t ? ` · ${tileName(t)}` : ''}`;
    if (t) button.innerHTML = tileMarkup(t, suggestion?.number);
    // Arrow keys navigate the grid without hundreds of sequential tab stops.
    button.tabIndex = !x && !y ? 0 : -1;
    fragment.append(button);
  }
  grid.replaceChildren(fragment);
  $('board-empty').hidden = all.length > 0;
  $('zoom-level').textContent = `${Math.round(cellSize / 48 * 100)}%`;
  $('zoom-in').disabled = cellSize >= 72;
  $('zoom-out').disabled = cellSize <= 28;
  $('clear').disabled = !board.length;
  $('board-count').textContent = `${board.length} ${board.length === 1 ? 'tile' : 'tiles'}`;
  if (center) {
    const cx = all.length ? (Math.min(...xs) + Math.max(...xs)) / 2 : 0;
    const cy = all.length ? (Math.min(...ys) + Math.max(...ys)) / 2 : 0;
    viewport.scrollLeft = (cx - minX + .5) * cellSize + 24 - viewport.clientWidth / 2;
    viewport.scrollTop = (cy - minY + .5) * cellSize + 24 - viewport.clientHeight / 2;
  } else { viewport.scrollLeft = scrollLeft; viewport.scrollTop = scrollTop; }
}
function renderResults() {
  const el = $('results');
  if (!result) {
    el.innerHTML = `<div class="result-empty"><span class="result-symbol">✧</span><div><h3>${worker ? 'Checking every possibility…' : 'Your next move starts here.'}</h3><p>${worker ? 'Searching all legal placements and scoring each affected line.' : 'Set up the table and your rack, then find your best move.'}</p></div></div>`; return;
  }
  if (result.errors.length) {
    el.innerHTML = '<h2>Check your position</h2><ul class="error-list"></ul>';
    for (const error of result.errors) { const li = document.createElement('li'); li.textContent = error; el.querySelector('ul').append(li); }
    return;
  }
  if (!result.moves.length) {
    el.innerHTML = `<div class="result-empty"><span class="result-symbol">↻</span><div><h3>No legal placement available.</h3><p>${bagEmpty ? 'The bag is empty, so you cannot exchange tiles.' : 'Exchange tiles instead, up to the number remaining in the bag.'}</p></div></div>`; return;
  }
  const move = result.moves[moveIndex], best = move.score === result.bestScore;
  el.innerHTML = `<div class="result-kicker">03 / ${best ? 'YOUR BEST MOVE' : 'EXPLORE A MOVE'}</div>
    <div class="result-head"><div class="score">${move.score}<small>POINTS</small></div><div><h3>${best ? 'Make this one count.' : 'Another way to play.'}</h3><p>Play ${move.placements.length} ${move.placements.length === 1 ? 'tile' : 'tiles'}${result.bestCount > 1 && best ? `<br>${result.bestCount.toLocaleString()} plays tie for best` : ''}</p></div></div>
    <button id="show-board" class="show-board">See outlined tiles on the table ↑</button>
    <div class="placements">${move.placements.map((t, i) => `<div class="placement"><span class="placement-number">${i + 1}.</span>${tileMarkup(t)}<span><strong>${tileName(t)}</strong><small>Column ${t.x}, row ${t.y}</small></span></div>`).join('')}</div>
    <details class="score-details"><summary>How this move scores</summary><div class="breakdown">${move.lines.map(l => `<span class="score-chip">${l.axis} (${l.start.x}, ${l.start.y}): ${l.length}${l.length === 6 ? ' + 6 Qwirkle' : ''}</span>`).join('')}${move.endBonus ? '<span class="score-chip">Empty rack + empty bag: +6</span>' : ''}</div></details>
    <label class="result-select">Explore other plays<select id="move-select">${result.moves.map((m, i) => `<option value="${i}" ${i === moveIndex ? 'selected' : ''}>${i + 1}. ${m.score} points · ${m.placements.length} ${m.placements.length === 1 ? 'tile' : 'tiles'}</option>`).join('')}</select></label>
    <button id="apply" class="primary">Apply this move <span aria-hidden="true">✓</span></button>
    <p class="search-stats">${result.totalMoves.toLocaleString()} legal plays checked in ${(result.elapsed / 1000).toFixed(2)}s.${result.totalMoves > result.moves.length ? ` Showing the top ${result.moves.length}.` : ''}${result.opening ? '<br>Opening plays use your largest set; rotations and translations are equivalent.' : ''}</p>`;
  $('show-board').onclick = () => { fitBoard(); reveal('table'); };
  $('move-select').onchange = event => { moveIndex = Number(event.target.value); renderResults(); fitBoard(); renderAction(); $('move-select').focus({ preventScroll: true }); };
  $('apply').onclick = () => {
    remember();
    for (const t of move.placements) {
      board.push({ ...t }); const i = rack.findIndex(r => r.color === t.color && r.shape === t.shape); rack.splice(i, 1);
    }
    changed(`Move applied for ${move.score} points. ${rack.length === 0 && bagEmpty ? 'Game finished.' : 'Add your newly drawn tiles when ready.'}`);
    fitBoard(); reveal('table');
  };
}
function render() { renderTools(); renderRack(); renderBoard(); renderResults(); renderAction(); $('undo').disabled = !history.length; }

function editCell(event, remove = false) {
  if (panning || suppressClick) return;
  const cell = event.target.closest('.cell'); if (!cell) return;
  const x = Number(cell.dataset.x), y = Number(cell.dataset.y), i = board.findIndex(t => t.x === x && t.y === y);
  if ((remove || erasing) && i < 0) return;
  if (!remove && !erasing && i >= 0 && board[i].color === selected.color && board[i].shape === selected.shape) return;
  remember();
  if (i >= 0) board.splice(i, 1);
  if (!remove && !erasing) board.push({ x, y, ...selected });
  changed();
  $('board').querySelector(`[data-x="${x}"][data-y="${y}"]`)?.focus({ preventScroll: true });
}
$('board').onclick = event => editCell(event);
$('board').oncontextmenu = event => { event.preventDefault(); editCell(event, true); };
$('board').onkeydown = event => {
  const cell = event.target.closest('.cell'); if (!cell) return;
  if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); editCell(event, true); return; }
  const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
  if (!delta) return;
  event.preventDefault();
  const target = $('board').querySelector(`[data-x="${Number(cell.dataset.x) + delta[0]}"][data-y="${Number(cell.dataset.y) + delta[1]}"]`);
  if (target) { cell.tabIndex = -1; target.tabIndex = 0; target.focus(); }
};
$('choose-tile').onclick = () => openPicker();
$('picker-close').onclick = () => $('tile-picker').close();
$('tile-picker').onclick = event => {
  if (event.target !== $('tile-picker')) return;
  const rect = $('tile-picker').getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) $('tile-picker').close();
};
$('remove-rack-tile').onclick = () => {
  const index = pickerTarget;
  $('tile-picker').close(); remember(); rack.splice(index, 1); changed('Tile removed from your rack.');
  $('rack').children[Math.min(index, 5)]?.focus({ preventScroll: true });
};
$('erase').onclick = () => { erasing = !erasing; panning = false; renderTools(); };
$('pan').onclick = () => { panning = !panning; erasing = false; renderTools(); };
$('preview-link').onclick = () => reveal('results');
// Native touch scrolling keeps taps distinct from swipes. Mouse dragging does the same.
$('board-viewport').addEventListener('pointerdown', event => {
  suppressClick = false;
  if (event.pointerType !== 'mouse' || event.button !== 0 || !event.target.closest('.cell')) return;
  dragging = { x: event.clientX, y: event.clientY, left: $('board-viewport').scrollLeft, top: $('board-viewport').scrollTop, moved: false };
});
window.addEventListener('pointermove', event => {
  if (!dragging) return;
  const dx = event.clientX - dragging.x, dy = event.clientY - dragging.y;
  if (!dragging.moved && Math.hypot(dx, dy) < 6) return;
  dragging.moved = true; suppressClick = true;
  $('board').classList.add('dragging');
  $('board-viewport').scrollLeft = dragging.left - dx;
  $('board-viewport').scrollTop = dragging.top - dy;
  event.preventDefault();
});
function endDrag() { dragging = null; $('board').classList.remove('dragging'); }
window.addEventListener('pointerup', endDrag);
window.addEventListener('pointercancel', endDrag);
window.addEventListener('blur', endDrag);
$('bag-empty').onchange = event => { remember(); bagEmpty = event.target.checked; changed(); };
$('undo').onclick = () => {
  if (!history.length) return;
  ({ board, rack, bagEmpty } = JSON.parse(history.pop())); changed('Last edit undone.'); renderBoard(true);
};
$('clear').onclick = () => { if (!board.length) return; remember(); board = []; changed('Table cleared. Your rack is unchanged. Undo restores the table.'); renderBoard(true); };
$('fit').onclick = fitBoard;
$('zoom-in').onclick = () => { cellSize = Math.min(72, cellSize + 6); renderBoard(true); };
$('zoom-out').onclick = () => { cellSize = Math.max(28, cellSize - 6); renderBoard(true); };
$('example').onclick = () => {
  remember();
  board = [0, 1, 2, 3, 4].map((shape, x) => ({ x: x - 2, y: 0, color: 0, shape }));
  board.push({ x: -2, y: 1, color: 4, shape: 0 }, { x: -2, y: 2, color: 3, shape: 0 }, { x: 0, y: -1, color: 2, shape: 2 });
  rack = [{ color: 0, shape: 5 }, { color: 4, shape: 5 }, { color: 3, shape: 5 }, { color: 4, shape: 1 }, { color: 2, shape: 1 }, { color: 5, shape: 2 }];
  bagEmpty = false; changed('Example loaded. Find the best move, or edit the table to explore.'); fitBoard();
};
$('analyze').onclick = () => {
  if (worker) { stopSearch(); renderResults(); $('status').textContent = 'Search cancelled.'; return; }
  if (result?.moves?.length) { moveIndex = 0; renderResults(); fitBoard(); renderAction(); reveal('results'); return; }
  result = null; moveIndex = 0; renderBoard(); $('status').textContent = '';
  const errors = validatePosition(board, rack);
  if (!rack.length) errors.push('Add at least one tile to your rack.');
  if (errors.length) { result = { errors, moves: [] }; renderResults(); reveal('results'); return; }
  try {
    worker = new Worker('/worker.js', { type: 'module' });
    worker.onmessage = ({ data }) => { result = data; stopSearch(); renderResults(); fitBoard(); reveal('results'); };
    worker.onerror = () => { stopSearch(); result = { errors: ['The search could not start. Reload the page and try again.'], moves: [] }; renderResults(); };
    worker.postMessage({ board, rack, bagEmpty });
    renderAction(); renderResults();
  } catch { stopSearch(); result = { errors: ['Open the app through its localhost server to enable the analyzer.'], moves: [] }; renderResults(); }
};
let resizeFrame;
new ResizeObserver(() => { cancelAnimationFrame(resizeFrame); resizeFrame = requestAnimationFrame(() => renderBoard(true)); }).observe($('board-viewport'));
render(); requestAnimationFrame(fitBoard);
