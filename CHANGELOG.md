# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
