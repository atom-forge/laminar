---
type: chapter
---
# Pitfalls and checklist

## Common mistakes

> [!bug] Destructuring a sibling during assembly
> ```ts
> const { database } = services; // undefined if database is built later
> ```
> Access it inside a method instead.

> [!bug] `await` in a factory
> Factories and the `assemble` callback must be synchronous. Move asynchronous work to `onInit`.

> [!bug] Forgetting `await init(...)`
> Creators do not run hooks. Without `init`, pools stay closed.

> [!bug] Numeric factory keys
> `{ 2: a, 1: b }` is iterated as `1, 2` by JavaScript. Use names.

> [!bug] Two `onInit` in one object
> The second silently replaces the first.

> [!bug] Treating `internal` as security
> It is a type-level convention only. The value is present at runtime.

> [!bug] Infinite recursion through deferred cycles
> Deferred circular references are safe to build, but circular *calls* still recurse forever.

## Before you ship

- [x] Factories are synchronous and return values directly.
- [x] Siblings are accessed inside functions, not at construction time.
- [x] Consuming layers type their arguments as `PublicLayer<…>`.
- [x] `init` is called per layer, lowest first.
- [x] `dispose` is called in the reverse order.
- [x] Each object has at most one `onInit` and one `onDispose`.

> [!question]- Can one factory depend on a later one?
> Only through deferred access. Either reorder the definitions or touch the other component inside a function.

> [!question]- Is there a global container?
> No. Each creator call builds a new, independent container.
