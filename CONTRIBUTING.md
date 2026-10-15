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
- Choose, replace, and remove rack tiles; place and erase table tiles.
- Drag the table without placing a tile; test Pan, zoom, and fit.
- Preview an alternative, apply a move, and undo it.
- Reload and confirm the position persists; verify empty-rack guidance.
- Navigate the grid with arrow keys, delete a tile, and close the picker with Escape.
- Check narrow screens (320–390 px), landscape, and desktop for overflow or covered controls.

The automated suite covers the rules and server; these browser checks are manual. The deployment workflow runs on pushes to `main` and manual runs on `main`, not on pull requests. Run the checks locally for a contribution. Merging into `main` triggers a production deployment in the upstream repository.

## Updating screenshots

The README uses real captures in `docs/images/`. Refresh them when the visible UI changes:

1. Run the local app and choose **Try example**, then **Find best move**. Do not apply the move.
2. Capture the desktop workspace with the suggested tiles and rack visible as `desktop-analysis.png`.
3. At a 390 × 844 mobile viewport, capture the result as `mobile-analysis.png`.
4. Open the table tile picker and capture it as `mobile-picker.png`.
5. Review each image, keep the existing names, and verify the README renders them. Use actual screenshots without fabricated UI or scores; rendering and capture scale may vary by browser.

The current images were captured on 2026-10-15. They are documentation assets only: the static server and Docker build do not include them.

## Pull requests and bug reports

Explain the user-visible problem, the change, and how you verified it. Include updated screenshots for visual changes. For a scoring issue, include the board coordinates, rack tiles, bag-empty setting, expected score, and the relevant rule. Never include deployment credentials.

Deployment setup and renewing the app-scoped token are documented in [DEPLOY.md](DEPLOY.md). Forks must use their own repository settings and Fly app.
