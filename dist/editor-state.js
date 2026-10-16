import { validatePosition } from './engine.js';

// Editing may temporarily break game rules. Only malformed data prevents restore.
export function restorePosition(saved) {
  if (!saved || !Array.isArray(saved.board) || !Array.isArray(saved.rack)) return null;
  const malformed = /^(A tile has an invalid|The board and rack must|There are only 108|Your rack can hold|Two board tiles occupy)/;
  if (validatePosition(saved.board, saved.rack).some(error => malformed.test(error))) return null;
  return { board: saved.board, rack: saved.rack, bagEmpty: !!saved.bagEmpty };
}

// Move a single slot, preserving order and duplicate tiles. Empty slots mean append.
export function moveRackTile(rack, from, to) {
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || from >= rack.length || to < 0 || to > 5) return rack;
  to = Math.min(to, rack.length - 1);
  if (from === to) return rack;
  const next = [...rack];
  const [tile] = next.splice(from, 1);
  next.splice(to, 0, tile);
  return next;
}
