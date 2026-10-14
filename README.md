# Qwirkle Analyzer

A small, local-only web app to find the highest-scoring legal Qwirkle move. No dependencies, installation, accounts, API keys, or build step.

## Run

Requires Node.js 20 or newer.

```sh
npm start
```

Open **http://127.0.0.1:5174**. The server binds only to the loopback interface. Stop it with Ctrl+C. To change ports, run `PORT=5175 npm start`.

## Use

1. Choose one of the 36 tiles, then click board squares to recreate the table. Right-click, use the eraser, or press Delete to remove a tile. Arrow keys navigate the grid. The grid expands as you place tiles; scroll or zoom to explore it.
2. Click empty rack slots to add your selected tile, up to six. Click filled slots to remove tiles.
3. Check **The draw bag is empty** only when there are no tiles left to draw.
4. Click **Find best move**. Green outlines preview the move. The result includes the score for each affected line, bonuses, coordinates, and alternative moves. The best 100 moves are available for preview; every legal move is evaluated and counted.
5. **Apply this move** updates the table and rack. Add newly drawn tiles manually. **Undo** restores the last edit, including examples, clears, and applied moves.

The position is saved in this browser's local storage. Nothing is uploaded. The official-rules link is the only external link. An example position is available without overwriting your position permanently: use Undo to restore it.

## Rules and search

Based on [MindWare's official Qwirkle rules](https://www.mindware.orientaltrading.com/pdf/instructions/32016.pdf), also checked against the publisher's [travel edition rules](https://www.mindware.orientaltrading.com/pdf/instructions/52132.pdf).

The engine validates connectivity, line attributes, duplicates, the six-tile line limit, and the three-copy inventory limit across the entered board and rack. An incomplete position can be edited freely but must be valid before analysis. This checks the static position, not whether it could have arisen through a particular history of turns.

Every legal turn ends with all its new tiles in one uninterrupted horizontal or vertical line of at most six tiles. At least one new tile touches the old board. The engine enumerates every segment of length 1–6 containing such an empty neighboring square, including segments with existing tiles between newly placed ones. It tries every distinct rack assignment to the segment's empty squares, pruning only invalid lines and perpendicular crossings. Identical rack copies are interchangeable and cannot occur together in a played line. Single-tile plays found along both axes are deduplicated.

Each affected line scores once; a line of six adds a six-point Qwirkle bonus. Emptying the rack with an empty draw bag adds six points. On an empty board, the app assumes you are the starting player and requires the largest matching set. Opening translations and rotations are equivalent, so it uses a canonical horizontal line at the origin while still considering tile order.

The search has no time cutoff or heuristic approximation and runs in a cancellable Web Worker. Scores optimize **this turn's points**, not long-term strategy, future draws, or opponent responses. Equal scores are displayed with more tiles played first, then a deterministic placement order. Tile exchanges score no points and are suggested only when no placement is possible.

## Verify

```sh
npm test
```

Tests cover rule validation, opening requirements, gap filling, extending both ends, crossings, multiple Qwirkles, the end bonus, and all-move comparisons against an independent brute-force implementation.

`dist/` contains the complete browser app. `server.mjs` is a minimal static file server; `dist/engine.js` contains the pure rules and search code.

## Tile artwork

`dist/tile-art.js` contains the original vector silhouettes extracted from the tile legend in [MindWare's official rulebook](https://i.mindware.com/match/original/Asset_Type/Document/origFilename/32016/) (PDF title: `Qwirkle_Rules_200401_OL`). The paths are translated to local coordinates without redrawing, rotation, or changing their proportions. Symbol sizes and positions relative to the black tile face are preserved. All app views use this same artwork; existing saved tile IDs remain unchanged.

The six screen colors are sampled from PDFium's RGB rendering of the rulebook's CMYK colors. These match that published reference; physical ink, editions, lighting, and displays can differ. Qwirkle and its original artwork belong to their respective owners. The assets are bundled locally, with no runtime requests to the publisher.

For regeneration only, `scripts/extract-tile-art.py path/to/rulebook.pdf` requires Python with pdfplumber and Pillow. Running the app still requires only Node.js.
