# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- `book/` documentation book in BookMD format with diagrams and callouts: the front page (`book.md`) holds the overview, audience and reading guide, followed by unnumbered chapters (getting started, layers and factories, internal visibility, lifecycle, layered application, API reference, pitfalls, upgrading) and AI Notes.
- CI workflow running typecheck, tests and build on pushes and pull requests; the publish workflow and `prepublishOnly` now also typecheck and test before publishing.
- `book/upgrading.md` upgrade guide describing the behaviour changes of the next release in detail, with a checklist, followed by the 0.4 migration notes and the release history.
- "Upgrading" section in the English and Hungarian docs, derived from the book's upgrade guide.
- Documentation rules in `AGENTS.md`: the `book/` BookMD book is the source of truth (intro, usage chapters, upgrading, AI Notes); changes flow one way to `docs/en/` (a single page or chapter files mirroring the book, depending on size; AI Notes stays book-only) and then to its Hungarian translation in `docs/hu/`; every change that may require user action is documented in `book/upgrading.md` (with `Unreleased` as the target version until it is decided) and marked **Breaking:** in the changelog; `README-AI.md` is kept in sync with the AI Notes chapter.
- Link to the published book (https://books.atom-forge.eu) in `README.md`.
- `typecheck` script and `@types/bun` so the test suite is type-checked.
- Tests for nested components, frozen and function components, shared/cyclic traversal, dispose error handling, `PublicLayer` and self-reference.

### Changed
- **Breaking:** Components are now tracked in an internal `WeakSet` instead of being branded with a symbol property, so factory results are no longer mutated and spread copies of components are no longer treated as components.
- **Breaking:** `dispose` runs every hook even when some fail, then rethrows the error, or an `AggregateError` when several hooks failed.
- **Breaking:** `define` returns a wrapper that registers the factory result, so it is no longer identical to the function passed in.
- `package.json` `exports` lists the `types` condition first.
- Renamed `AGENT.md` to `AGENTS.md`, the conventional agent instruction file name.

### Removed
- Outdated planning notes (`async.md`, `async-fix.md`, `dispose.md`, `0-4-0-plan.md`) describing superseded APIs.

### Fixed
- **Breaking:** `onInit` / `onDispose` hooks of nested components (defined factories called inside another factory) now run; previously only top-level factory results were traversed.
- Factories returning frozen or non-extensible objects no longer throw during assembly.
- Function components can declare lifecycle hooks.
- `init` / `dispose` visit each component once, preventing duplicate hook calls and infinite recursion on cyclic references.
- Typed `makeLayer` usage in the test suite, which previously failed type checking.


---

## [0.4.3] - 2026-10-07

---

## [0.4.2] - 2026-10-07

### Added
- `README-AI.md` as a concise guide for AI-assisted development, linked from the README and included in the npm package.
- `AGENT.md` requiring agents to record every change in the changelog as part of the same task.

### Changed
- Consolidated the separate LLM reference into the English and Hungarian documentation, preserving its complete typed example and implementation constraints.

### Fixed
- Corrected documentation describing assembly as lazy, clarified compile-time internal visibility and lifecycle behavior, and fixed example imports, layer type parameters, and async initialization callbacks.

---

## [0.4.1] - 2026-06-16

### Added
- Optional `assemble` hook as a second argument for creator functions (e.g. `createApi(defs, { assemble: (self, ...factoryArgs) => { ... } })`). It runs synchronously immediately after the layer has been fully assembled, making it easy to run imperative setup (like route or middleware registration) without custom wrapper functions.

---

## [0.4.0] - 2026-06-16

### Added
- `Unit<T>` utility type: `ReturnType<T>` for a factory function, helping to keep container type definitions clean (e.g. `type Services = { db: Unit<typeof db> }`).

### Changed
- **Breaking:** Rolled back async factory support. `assemble` and all layer creators (like `createApp` / `createServices`) are now synchronous. Factories must return their values synchronously, and creators return the assembled container directly rather than a `Promise`.
- **Breaking:** Updated lifecycle hooks to run asynchronously outside of assembly. `makeLayer` no longer automatically runs `onInit` hooks. You must call `await init(layer)` and `await dispose(layer)` explicitly.
- **Breaking:** `init` and `dispose` now accept a single layer object instead of multiple layers.

---

## [0.3.0] - 2026-06-16

### Added
- Lifecycle hooks: `onInit` and `onDispose` let a factory declare init/dispose behavior by spreading their result into its return object. `makeLayer`'s `create(...)` runs `onInit` hooks automatically on the assembled layer by default; pass `{ skipInit: true }` to `makeLayer` to opt out. `init(...layers)` and `dispose(...layers)` are also exported directly for manual use (e.g. with `skipInit`, or for cleanup at shutdown) — `init` runs hooks depth-first across the given layers in the order passed, `dispose` accepts the same argument order and reverses it internally. Calling `init` with a single (possibly still-pending) layer resolves it, runs its hooks, and returns it — e.g. `const services = await init(createServices(config));`. `assemble` now brands every factory's return object internally so these utilities only walk actual components.

---

## [0.2.0] - 2026-06-16

### Changed
- **Breaking:** `assemble` is now async — factory return values are `await`ed, so factories may return `T | Promise<T>`. The creator function returned by a layer's `create` now returns `Promise<SelfT>` instead of `SelfT`, so call sites must `await` it (e.g. `export const app = await createApp(config);`).

---

## [0.1.0]

### Added
- Initial release of `@atom-forge/laminar` based on the clean generic makeLayer implementation.
