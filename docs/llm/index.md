# Laminar — LLM Reference

Laminar is a lightweight, type-safe layered architecture and Dependency Injection (DI) system for TypeScript. It relies on lazy execution of factory functions to assemble containers, preventing circular dependencies and initialization order issues.

## Package

```bash
npm install @atom-forge/laminar
pnpm add @atom-forge/laminar
yarn add @atom-forge/laminar
bun add @atom-forge/laminar
```

## Exports

```typescript
import { internal, PublicLayer, Layer, FromLayer, makeLayer, onInit, onDispose, init, dispose } from '@atom-forge/laminar';
```

---

## API Reference

### `internal<T>(value: T): Internal<T>`
Marks a property within a factory output as private to the layer. It is preserved during assembly for other factories in the same layer to use (self-referential dependency injection) but is stripped from the public-facing type returned to other layers.

### `PublicLayer<T>`
Type utility that recursively strips out any properties marked with `internal` from a container type `T`. Other layers must only consume `PublicLayer<T>`.

### `Layer<OuterArgs, SelfT, FactoryArgs>`
The type definition of a layer where:
- `OuterArgs`: The arguments accepted by the assembler/creator function returned by the layer builder (e.g. `[Config]`).
- `SelfT`: The type of the container built by the layer.
- `FactoryArgs`: The arguments supplied to each individual factory function in the layer.

### `FromLayer<T>`
Helper type to extract the `[OuterArgs, SelfT, FactoryArgs]` tuple from a `Layer` type. Often used to provide types to `makeLayer<FromLayer<MyLayer>>(resolver)`.

### `makeLayer(resolver, options?: { skipInit?: boolean })`
Returns a `[define, create]` tuple where:
- `define`: Type-safe factory definition helper: `const factory = define((...factoryArgs) => ({ ... }))`. Factories may return their value directly or as a `Promise`.
- `create`: Factory assembler: `const createContainer = create({ factoryA, factoryB })`. The resulting `createContainer(...)` function is always async — it returns `Promise<SelfT>` and must be `await`ed, regardless of whether the factories themselves are sync or async. **By default it also runs `init()` on the assembled layer before returning it** — pass `options.skipInit: true` to `makeLayer` to opt out and call `init()` manually instead.
- `resolver`: Mapping function `(outerArgs: OuterArgs, self: SelfT) => FactoryArgs`.

### `onInit(fn: () => void | Promise<void>)` / `onDispose(fn: () => void | Promise<void>)`
Declares a lifecycle hook on a component. Spread the result into the factory's return object — no wrapper, no factory signature change:
```typescript
return { db, ...onDispose(() => pool.end()), ...onInit(() => pool.query('SELECT 1')) };
```
With the default (non-`skipInit`) `makeLayer` setup, `onInit` hooks run automatically as part of `create(...)` — no explicit `init()` call needed in normal usage.

### `init(...layers): Promise<...>` / `dispose(...layers: object[]): Promise<void>`
Recursively walk every component in each given layer (every object returned by a factory is internally branded so these utilities only traverse actual components, not arbitrary nested data), invoking their `onInit`/`onDispose` hooks. Mostly relevant for layers created with `skipInit: true`, or for cleanup at shutdown.
- `init` has two overloads:
  - `init<T extends object>(layer: T | Promise<T>): Promise<T>` — single layer, possibly still-pending. Awaits it, runs its hooks, and returns the resolved layer: `const services = await init(createServices(config));` (used when that layer was built with `skipInit: true`).
  - `init(...layers: object[]): Promise<void>` — multiple already-built layers, processed in the order passed.
- `dispose(...layers: object[]): Promise<void>` reverses both the layer order and the depth order internally, so it can be called with the *same* argument order as a multi-layer `init` call:
```typescript
const services = await createServices(config); // auto-initialized
const modules = await createModules(config, services); // auto-initialized
// later, at shutdown:
await dispose(services, modules);
```

---

## Quick Complete Example

### 1. Define the layers (`layers.ts`)

```typescript
import { type FromLayer, type Layer, makeLayer, PublicLayer } from '@atom-forge/laminar';

export type Config = { smtp: string };

// 1. Services Layer (Creator: (config) => Services; Factory: (config, services) => Service)
export type Services = {
  email: any;
  database: any;
};
type ServicesLayer = Layer<[Config], Services, [Config, Services]>;
export const servicesLayer: ServicesLayer = makeLayer<FromLayer<ServicesLayer>>(
  ([config], self) => [config, self]
);
export const [defineService, serviceCreatorFactory] = servicesLayer;

// 2. Modules Layer (Creator: (config, services) => Modules; Factory: (config, services, modules) => Module)
export type Modules = {
  auth: any;
};
type ModulesLayer = Layer<[Config, Services], Modules, [Config, PublicLayer<Services>, Modules]>;
export const modulesLayer: ModulesLayer = makeLayer<FromLayer<ModulesLayer>>(
  ([config, services], self) => [config, services as PublicLayer<Services>, self]
);
export const [defineModule, moduleCreatorFactory] = modulesLayer;
```

### 2. Implement the services (`services.ts`)

```typescript
import { internal } from '@atom-forge/laminar';
import { defineService, serviceCreatorFactory } from './layers';

export const database = defineService((config, services) => {
  const pool = {}; // setup db pool
  return {
    query: async (sql: string) => { /* query */ },
    pool: internal(pool), // hide database pool from Modules layer
  };
});

export const email = defineService((config, services) => {
  return {
    send: async (to: string, text: string) => {
      // Can reference database service lazily:
      await services.database.query("log email");
    }
  };
});

export type Services = {
  database: ReturnType<typeof database>;
  email: ReturnType<typeof email>;
};

export const createServices = serviceCreatorFactory({ database, email });
```

### 3. Implement modules (`modules.ts`)

```typescript
import { defineModule, moduleCreatorFactory } from './layers';

export const auth = defineModule((config, services, modules) => {
  return {
    login: async (user: string) => {
      await services.email.send(user, "Welcome!");
      // database.pool is NOT accessible here because it is internal
    }
  };
});

export type Modules = {
  auth: ReturnType<typeof auth>;
};

export const createModules = moduleCreatorFactory({ auth });
```

### 4. Assemble and boot (`app.ts`)

```typescript
import { createServices } from './services';
import { createModules } from './modules';

const config = { smtp: "smtp.example.com" };

// Boot the application
const services = await createServices(config);
const modules = await createModules(config, services);

await modules.auth.login("user@example.com");
```
