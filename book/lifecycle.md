---
type: chapter
---
# Lifecycle

Assembly is synchronous, but real components need asynchronous startup (open a pool, ping a server) and shutdown. Laminar offers two hooks and two runners.

## Declaring hooks

Spread the result of `onInit` / `onDispose` into the object a factory returns. No wrapper, no extra argument.

```ts
export const prismaService = defineService((config) => {
  const pool = new Pool(config.database);
  return {
    db: new PrismaClient({ adapter: new PrismaPg(pool) }),
    ...onInit(async () => { await pool.query('SELECT 1'); }),
    ...onDispose(() => pool.end()),
  };
});
```

Components without hooks are skipped silently.

## Running hooks

```ts
const services = createServices(config);
await init(services);

// … application runs …

await dispose(services);
```

`createServices` never runs `onInit` for you.

## Order

```mermaid
flowchart TB
  subgraph "init: depth-first, parent before child"
    direction LR
    a1[db] --> a2[cache] --> a3[mailer]
  end
  subgraph "dispose: reverse order"
    direction LR
    b1[mailer] --> b2[cache] --> b3[db]
  end
```

For a flat layer this is definition order for `init` and its reverse for `dispose`.

Between layers the caller is responsible for ordering:

```ts
await init(services);
await init(modules);

await dispose(modules);
await dispose(services);
```

> [!tip] Rule
> Initialize lower layers first; dispose them last.

## How traversal works

Every object or function returned by a factory is registered internally as a component — including results of defined factories called inside another factory, so nested components take part in the lifecycle too. Registration does not modify the result, so frozen objects work. `init` / `dispose` walk **only registered components**, so a Prisma model, a `Date` or any other arbitrary data inside a component is never traversed.

## Behaviour to know

> [!warning] Errors
> An error stops the current `init` call; there is no rollback. `dispose` keeps going: every hook runs, then the error is rethrown — or an `AggregateError` if several hooks failed.

> [!warning] Repeated calls
> Calling `init` twice runs the hooks twice. Idempotency is your responsibility.

> [!warning] One hook per kind per object
> Spreading two `onInit` results into the same object overwrites the first one. Combine them in a single function.

> [!note] Each component once
> The walker visits every component at most once per call, so shared components and cyclic references are safe.

> [!note] Closure dependencies are invisible
> Laminar does not discover dependencies captured in closures. That is why you order layers yourself.
