# Changelog

## 0.1.0 — 2026-10-22

First public release of RepoSketch: explore a public GitHub repository as an editable, source-backed import map.

- Map JavaScript and TypeScript source from a commit-pinned GitHub snapshot.
- Inspect imports, dependents, and exact source lines; search files and follow an entry-point walkthrough.
- Explore potential impact with direct and indirect dependent highlighting, shortest import paths, and an optional type-only filter.
- Edit diagrams in Excalidraw and export the current drawing as PNG or `.excalidraw`.
- Try an original offline sample without an account or API key.
- Resolve relative imports, directory indexes, extension substitution, and local TypeScript path aliases.
- Enforce download and archive limits; downloaded repository code is never executed.

### Scope

This release is a locally runnable application, not a hosted service. It supports public default-branch repositories up to 250 supported source files. The graph shows static imports, not runtime behavior. Inherited/referenced TypeScript configuration and some workspace/bundler aliases are not resolved. Canvas edits must be exported to keep them across reloads.

### Validation

28 automated tests cover analysis, archive limits, HTTP handling, layout, and impact traversal. The production build includes TypeScript checking. Browser checks covered desktop and phone layouts, exports, source paths, and exact preservation of drawing edits and undo history across impact mode.
