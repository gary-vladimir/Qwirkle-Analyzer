# Contributing

[Back to the README](README.md)

## Work locally

Use Node.js 24, matching CI and the Docker image. Clone the repository (or your fork), create a branch, and run:

```sh
git switch -c your-change
npm start
```

Open [localhost:5174](http://127.0.0.1:5174). There are no npm dependencies to install and no build step. Edit `dist/` directly and reload; restart Node after changing `server.mjs`.

Keep changes focused. Preserve stable color/shape IDs, saved-position compatibility, and the original SVG tile geometry. The [architecture guide](docs/ARCHITECTURE.md) describes the boundaries between editing, worker messages, and search.

## Verify a change

Run `npm test` and `git diff --check` before submitting a pull request. Add regression coverage for rules or scoring changes in `test/engine.test.js`; keep the independent brute-force comparisons independent of the production search implementation.

For UI changes, check these interactions in a modern browser at phone and desktop sizes:

- Load the example and analyze: expect 53 legal plays and a 19-point best move.
- Tap an empty square or rack slot: shape first, color second; Escape must cancel without placing.
- Tap existing board and rack tiles to recolor, change shape, or remove them.
- Drag all tray shapes onto board squares and empty/occupied rack slots; check outside-drop and Escape cancellation.
- Reorder rack tiles by dragging in both directions, including duplicate tiles and drops on empty slots. Check Alt + arrow keys and the popup Move buttons.
- Check mouse and touch input: drag highlighting, edge-hover scrolling, and no accidental popup after a drop.
- Select a tray shape, then tap a destination to place without dragging.
- Drag the table without placing a tile; test Pan, zoom, and fit.
- Preview an alternative, apply a move, and undo it.
- Reload and confirm unfinished positions (including invalid lines) and rack order persist; verify empty-rack guidance.
- Navigate the grid with arrow keys, delete a tile, and close the picker with Escape.
- Check narrow screens (320–390 px), landscape, and desktop for overflow or covered controls.

The automated suite covers the rules, editor state, and server; these browser checks are manual. The deployment workflow runs on pushes to `main` and manual runs on `main`, not on pull requests. Run the checks locally for a contribution. Merging into `main` triggers a production deployment in the upstream repository.

## Updating screenshots

The README uses real captures in `docs/images/`. Refresh them when the visible UI changes:

1. Run the local app and choose **Try example**, then **Find best move**. Do not apply the move.
2. Use **See outlined tiles on the table** and capture the desktop workspace with the suggested tiles, rack, and fixed tray visible as `desktop-analysis.png`.
3. At a 390 × 844 mobile viewport, capture the result as `mobile-analysis.png`.
4. Tap an empty table square and capture the shape step as `mobile-shapes.png`. Choose a shape and capture the color step as `mobile-picker.png`; cancel to leave the example unchanged.
5. Review each image, keep the existing names, and verify the README renders them. Use actual screenshots without fabricated UI or scores; rendering and capture scale may vary by browser.

The current images were captured on 2026-10-15. They are documentation assets only: the static server and Docker build do not include them.

## Pull requests and bug reports

Explain the user-visible problem, the change, and how you verified it. Include updated screenshots for visual changes. For a scoring issue, include the board coordinates, rack tiles, bag-empty setting, expected score, and the relevant rule. Never include deployment credentials.

Deployment setup and renewing the app-scoped token are documented in [DEPLOY.md](DEPLOY.md). Forks must use their own repository settings and Fly app.
