# Contributing to RepoSketch

Start with `npm ci` and `npm run dev` using Node.js 22.12 or newer. Run `npm test` and `npm run build` before submitting a change.

The most useful contributions improve the accuracy and readability of the map:

- Project references and local `extends` configuration support.
- Workspace package resolution with source evidence.
- Better layouts for dense graphs and cycles.
- Accessible keyboard navigation and mobile editing.

For analyzer changes, add a small in-memory source fixture that demonstrates the expected file-to-file connection and exact import line. Cover ambiguity explicitly; do not invent dependencies. For archive changes, preserve compressed/decompressed limits and never execute or extract downloaded source to disk.

For UI changes, exercise both the bundled sample and an actual small public repository. Check file selection, filtering, walkthrough, PNG export, and Excalidraw export. Verify that searching and selecting files do not discard drawing edits.

Keep pull requests focused. Describe the user-visible change, include a reproduction for fixes, and report the checks you ran. Use `npm run format` for consistent formatting.
