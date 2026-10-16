import { COLORS, SHAPES, key, tileName, validatePosition } from './engine.js';
import { TILE_ART, TILE_COLORS, TILE_FACE } from './tile-art.js';

const $ = id => document.getElementById(id);
function icon(t) {
  const art = TILE_ART[t.shape];
  return `<svg viewBox="${art.viewBox}" aria-hidden="true"><path fill="${TILE_FACE}" d="${art.face}"/><path fill="${TILE_COLORS[t.color] || '#e9e9dc'}" d="${art.symbol}"/></svg>`;
}
function tileMarkup(t, number = '') { return `<span class="tile">${icon(t)}${number ? `<span class="move-number">${number}</span>` : ''}</span>`; }
let board = [], rack = [], bagEmpty = false, selected = { color: 0, shape: 0 }, erasing = false;
let result = null, moveIndex = 0, worker = null, cellSize = 48, history = [];
let panning = false, pickerTarget = null, pickerShape = null, trayShape = null, tileDrag = null, dragging = null, suppressClick = false;
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
  $('erase').setAttribute('aria-pressed', String(erasing));
  $('pan').setAttribute('aria-pressed', String(panning));
  $('board').classList.toggle('pan', panning);
  $('board-help').textContent = panning ? 'Drag to explore · Placement paused' : erasing ? 'Tap a tile to remove it' : 'Tap to add or recolor · Drag to explore';
  $('tray-hint').textContent = trayShape === null ? 'Drag to the table or rack · Tap a tile to recolor' : `${SHAPES[trayShape]} selected · Tap a destination · Esc to cancel`;
  for (const button of $('shape-tray').children) button.setAttribute('aria-pressed', String(Number(button.dataset.shape) === trayShape));
}
function targetTile(target) {
  return target.kind === 'rack' ? rack[target.index] : board.find(t => t.x === target.x && t.y === target.y);
}
function focusTarget(target) {
  const el = target.kind === 'rack' ? $('rack').children[Math.min(target.index, 5)] : $('board').querySelector(`[data-x="${target.x}"][data-y="${target.y}"]`);
  el?.focus({ preventScroll: true });
}
function openPicker(target) {
  pickerTarget = target;
  const existing = targetTile(target);
  pickerShape = existing?.shape ?? trayShape;
  trayShape = null;
  renderTools(); renderPalette();
  $('tile-picker').showModal();
  (pickerShape === null ? $('palette') : $('colors')).querySelector('button')?.focus();
}
function chooseTile(t) {
  const target = pickerTarget, current = targetTile(target);
  $('tile-picker').close();
  selected = t;
  if (current?.color === t.color && current?.shape === t.shape) return;
  remember();
  if (target.kind === 'rack') rack[Math.min(target.index, rack.length)] = t;
  else if (current) Object.assign(current, t);
  else board.push({ x: target.x, y: target.y, ...t });
  changed(`${tileName(t)} ${current ? 'updated' : 'added'}.`);
  focusTarget(target);
}
function changed(message = '') {
  stopSearch(); result = null; moveIndex = 0; $('status').textContent = message; save(); render();
}
function preview() { return result?.moves?.[moveIndex]?.placements || []; }
function renderPalette() {
  const existing = targetTile(pickerTarget), choosingShape = pickerShape === null;
  $('picker-title').textContent = choosingShape ? 'Choose a shape' : 'Choose a color';
  $('picker-hint').textContent = choosingShape ? '1 of 2 · Pick the shape on your tile.' : `${existing ? 'Recolor' : '2 of 2 ·'} ${SHAPES[pickerShape].toLowerCase()} · Tap a color to save.`;
  $('palette').hidden = !choosingShape; $('colors').hidden = choosingShape;
  $('change-shape').hidden = choosingShape;
  $('remove-tile').hidden = !existing;
  $('remove-tile').textContent = pickerTarget.kind === 'rack' ? 'Remove from rack' : 'Remove from table';
  $('rack-order').hidden = pickerTarget.kind !== 'rack' || !existing;
  $('rack-left').disabled = pickerTarget.index === 0;
  $('rack-right').disabled = pickerTarget.index >= rack.length - 1;
  $('palette').replaceChildren(); $('colors').replaceChildren();
  SHAPES.forEach((name, shape) => {
    const button = document.createElement('button');
    button.className = 'shape-button';
    button.innerHTML = `${tileMarkup({ shape, color: -1 })}<span>${name}</span>`;
    button.setAttribute('aria-label', name);
    button.onclick = () => { pickerShape = shape; renderPalette(); $('colors').firstElementChild.focus(); };
    $('palette').append(button);
  });
  if (choosingShape) return;
  COLORS.forEach((name, color) => {
    const button = document.createElement('button');
    button.className = 'shape-button color-choice';
    button.innerHTML = `${tileMarkup({ color, shape: pickerShape })}<span>${name}</span>`;
    button.setAttribute('aria-label', name);
    button.setAttribute('aria-pressed', String(existing?.color === color && existing?.shape === pickerShape));
    button.onclick = () => chooseTile({ color, shape: pickerShape });
    $('colors').append(button);
  });
}
function reorderRack(from, to) {
  to = Math.min(to, rack.length - 1);
  if (from === to || to < 0 || from < 0 || from >= rack.length) return;
  remember(); const [tile] = rack.splice(from, 1); rack.splice(to, 0, tile);
  changed(`Rack tile moved to slot ${to + 1}.`);
  focusTarget({ kind: 'rack', index: to });
}
function renderRack() {
  $('rack').replaceChildren();
  for (let i = 0; i < 6; i++) {
    const t = rack[i], button = document.createElement('button');
    button.dataset.index = i;
    button.className = t ? 'tile' : 'rack-empty'; button.innerHTML = t ? icon(t) : '+';
    button.setAttribute('aria-label', t ? `Change ${tileName(t)} in rack slot ${i + 1}` : `Choose tile for rack slot ${i + 1}`);
    button.setAttribute('aria-haspopup', 'dialog');
    if (t) {
      button.title = 'Drag to reorder · Tap to recolor · Alt + arrow keys to move';
      button.onpointerdown = event => startTileDrag(event, { kind: 'rack', index: i, tile: t });
    }
    button.onclick = event => { if (!suppressClick || !event.detail) openPicker({ kind: 'rack', index: i }); };
    button.onkeydown = event => {
      if (t && event.altKey && ['ArrowLeft', 'ArrowRight'].includes(event.key)) {
        event.preventDefault(); reorderRack(i, i + (event.key === 'ArrowLeft' ? -1 : 1));
      }
    };
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
  const hadFocus = grid.contains(document.activeElement);
  let focusX = Number(grid.dataset.focusX || 0), focusY = Number(grid.dataset.focusY || 0);
  const all = [...board, ...placed];
  const xs = all.map(t => t.x), ys = all.map(t => t.y);
  const minX = Math.min(-7, ...xs.map(x => x - 6)), maxX = Math.max(7, ...xs.map(x => x + 6));
  const minY = Math.min(-6, ...ys.map(y => y - 6)), maxY = Math.max(6, ...ys.map(y => y + 6));
  if (focusX < minX || focusX > maxX || focusY < minY || focusY > maxY) {
    focusX = focusY = 0; grid.dataset.focusX = grid.dataset.focusY = '0';
  }
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
    button.tabIndex = x === focusX && y === focusY ? 0 : -1;
    fragment.append(button);
  }
  grid.replaceChildren(fragment);
  if (hadFocus) grid.querySelector('[tabindex="0"]')?.focus({ preventScroll: true });
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
  if (!remove && !erasing) { openPicker({ kind: 'board', x, y }); return; }
  if (i < 0) return;
  remember(); board.splice(i, 1); changed('Tile removed from the table.');
  focusTarget({ kind: 'board', x, y });
}
$('board').addEventListener('focusin', event => {
  const cell = event.target.closest('.cell'); if (!cell) return;
  $('board').querySelector('[tabindex="0"]')?.setAttribute('tabindex', '-1');
  cell.tabIndex = 0;
  $('board').dataset.focusX = cell.dataset.x;
  $('board').dataset.focusY = cell.dataset.y;
});
$('board').onclick = event => { if (!event.detail) suppressClick = false; editCell(event); };
$('board').oncontextmenu = event => { event.preventDefault(); editCell(event, true); };
$('board').onkeydown = event => {
  suppressClick = false;
  const cell = event.target.closest('.cell'); if (!cell) return;
  if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); editCell(event, true); return; }
  const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
  if (!delta) return;
  event.preventDefault();
  const target = $('board').querySelector(`[data-x="${Number(cell.dataset.x) + delta[0]}"][data-y="${Number(cell.dataset.y) + delta[1]}"]`);
  if (target) { cell.tabIndex = -1; target.tabIndex = 0; target.focus(); }
};
$('change-shape').onclick = () => { pickerShape = null; renderPalette(); $('palette').firstElementChild.focus(); };
$('tile-picker').addEventListener('close', () => focusTarget(pickerTarget));
$('picker-close').onclick = () => $('tile-picker').close();
$('tile-picker').onclick = event => {
  if (event.target !== $('tile-picker')) return;
  const rect = $('tile-picker').getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) $('tile-picker').close();
};
$('remove-tile').onclick = () => {
  const target = pickerTarget;
  $('tile-picker').close(); remember();
  if (target.kind === 'rack') rack.splice(target.index, 1);
  else board = board.filter(t => t.x !== target.x || t.y !== target.y);
  changed('Tile removed.'); focusTarget(target);
};
for (const [id, delta] of [['rack-left', -1], ['rack-right', 1]]) $(id).onclick = () => {
  const index = pickerTarget.index; $('tile-picker').close(); reorderRack(index, index + delta);
};
$('erase').onclick = () => { erasing = !erasing; panning = false; renderTools(); };
$('pan').onclick = () => { panning = !panning; erasing = false; renderTools(); };
$('preview-link').onclick = () => reveal('results');
// Pointer events support the same drag interaction with mouse, pen, and touch.
window.addEventListener('pointerdown', () => { suppressClick = false; }, true);
function startTileDrag(event, source) {
  if (event.button !== 0 || !event.isPrimary) return;
  tileDrag = { ...source, pointerId: event.pointerId, element: event.currentTarget,
    startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY, moved: false };
  event.currentTarget.setPointerCapture(event.pointerId);
}
function dropTarget(x, y, source) {
  const hit = document.elementFromPoint(x, y);
  const slot = hit?.closest('#rack [data-index]');
  if (slot) return { kind: 'rack', index: Number(slot.dataset.index), element: slot };
  const cell = hit?.closest('#board .cell');
  if (cell && source.kind === 'shape') return { kind: 'board', x: Number(cell.dataset.x), y: Number(cell.dataset.y), element: cell };
  return null;
}
function updateDragTarget() {
  const d = tileDrag;
  d.target?.element.classList.remove('drop-target');
  d.target = dropTarget(d.x, d.y, d);
  d.target?.element.classList.add('drop-target');
  d.ghost.classList.toggle('can-drop', !!d.target);
  d.ghost.style.transform = `translate(${d.x - 28}px, ${d.y - 66}px)`;
}
function dragScroll() {
  const d = tileDrag; if (!d?.moved) return;
  const viewport = $('board-viewport'), rect = viewport.getBoundingClientRect();
  const speed = (value, min, max) => value < min + 35 ? -8 : value > max - 35 ? 8 : 0;
  if (d.kind === 'shape' && d.x > rect.left && d.x < rect.right && d.y > rect.top && d.y < rect.bottom) {
    viewport.scrollLeft += speed(d.x, rect.left, rect.right);
    viewport.scrollTop += speed(d.y, rect.top, rect.bottom);
  }
  // Scroll the page above the fixed tray, leaving the drag source within reach.
  const bottom = document.querySelector('.shape-dock').getBoundingClientRect().top;
  window.scrollBy(0, d.y < 65 ? -10 : d.y > bottom - 35 ? 10 : 0);
  updateDragTarget(); d.frame = requestAnimationFrame(dragScroll);
}
window.addEventListener('pointermove', event => {
  const d = tileDrag; if (!d || d.pointerId !== event.pointerId) return;
  d.x = event.clientX; d.y = event.clientY;
  if (!d.moved && Math.hypot(d.x - d.startX, d.y - d.startY) < 7) return;
  event.preventDefault(); suppressClick = true;
  if (!d.moved) {
    d.moved = true; d.ghost = document.createElement('div'); d.ghost.className = 'drag-ghost';
    d.ghost.innerHTML = tileMarkup(d.tile); document.body.append(d.ghost);
    d.element.classList.add('drag-source'); document.body.classList.add('tile-dragging');
    d.frame = requestAnimationFrame(dragScroll);
  }
  updateDragTarget();
}, { passive: false });
function finishTileDrag(commit = false) {
  const d = tileDrag; if (!d) return;
  tileDrag = null; cancelAnimationFrame(d.frame); d.ghost?.remove();
  d.target?.element.classList.remove('drop-target'); d.element.classList.remove('drag-source');
  document.body.classList.remove('tile-dragging');
  if (d.element.hasPointerCapture(d.pointerId)) d.element.releasePointerCapture(d.pointerId);
  if (!d.moved || !commit) return;
  const target = d.target;
  if (!target) { $('tray-hint').textContent = 'Drop cancelled · Use a table square or rack slot'; return; }
  trayShape = null; erasing = false; panning = false;
  if (d.kind === 'rack') { reorderRack(d.index, target.index); return; }
  const old = targetTile(target);
  if (old?.shape === d.tile.shape && old?.color === d.tile.color) return;
  remember();
  if (target.kind === 'rack') rack[Math.min(target.index, rack.length)] = { ...d.tile };
  else if (old) Object.assign(old, d.tile);
  else board.push({ x: target.x, y: target.y, ...d.tile });
  changed(`${tileName(d.tile)} placed. Tap it to choose another color.`);
  focusTarget(target);
}
window.addEventListener('pointerup', event => { if (tileDrag?.pointerId === event.pointerId) finishTileDrag(true); });
window.addEventListener('pointercancel', () => finishTileDrag());
window.addEventListener('blur', () => finishTileDrag());
window.addEventListener('keydown', event => {
  if (event.key === 'Escape') { finishTileDrag(); trayShape = null; renderTools(); }
});
SHAPES.forEach((name, shape) => {
  const button = document.createElement('button'); button.className = 'tray-shape'; button.dataset.shape = shape;
  button.innerHTML = `${tileMarkup({ color: -1, shape })}<span>${name}</span>`;
  button.setAttribute('aria-label', `Pick ${name.toLowerCase()}`);
  button.setAttribute('aria-pressed', 'false');
  button.onpointerdown = event => startTileDrag(event, { kind: 'shape', tile: { shape, color: selected.color } });
  button.onclick = event => {
    if (suppressClick && event.detail) return;
    trayShape = trayShape === shape ? null : shape; erasing = false; panning = false; renderTools();
  };
  $('shape-tray').append(button);
});
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
    worker.onerror = () => { stopSearch(); result = { errors: ['The search could not start. Reload the page and try again.'], moves: [] }; renderResults(); reveal('results'); };
    worker.postMessage({ board, rack, bagEmpty });
    renderAction(); renderResults();
  } catch { stopSearch(); result = { errors: ['The search could not start. Reload the page and try again.'], moves: [] }; renderResults(); reveal('results'); }
};
let resizeFrame;
new ResizeObserver(() => { cancelAnimationFrame(resizeFrame); resizeFrame = requestAnimationFrame(() => { if (!tileDrag) renderBoard(true); }); }).observe($('board-viewport'));
render(); requestAnimationFrame(fitBoard);
