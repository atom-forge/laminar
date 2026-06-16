# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- **Breaking:** `assemble` is now async — factory return values are `await`ed, so factories may return `T | Promise<T>`. The creator function returned by a layer's `create` now returns `Promise<SelfT>` instead of `SelfT`, so call sites must `await` it (e.g. `export const app = await createApp(config);`).

---

## [0.1.0]

### Added
- Initial release of `@atom-forge/laminar` based on the clean generic makeLayer implementation.
