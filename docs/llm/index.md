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
import { internal, PublicLayer, Layer, FromLayer, Unit, makeLayer, onInit, onDispose, init, dispose } from '@atom-forge/laminar';
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

### `Unit<T>`
Helper type to extract the return type of a factory function: `ReturnType<T>`. Prevents boilerplate and reads nicely: `type Services = { db: Unit<typeof db> }`.

### `makeLayer(resolver)`
Returns a `[define, create]` tuple where:
- `define`: Type-safe factory definition helper: `const factory = define((...factoryArgs) => ({ ... }))`. Factories must return their value directly (synchronously).
- `create`: Factory assembler: `const createContainer = create({ factoryA, factoryB }, options?)`. The resulting `createContainer(...)` function is synchronous — it returns `SelfT` immediately, as all factories run synchronously.
  - `options.assemble?: (self: SelfT, ...args: FactoryArgs) => void`: Optional synchronous callback running immediately after the layer has been fully assembled. Useful for imperative setup (middleware registration, etc.) without wrapper functions.
- `resolver`: Mapping function `(outerArgs: OuterArgs, self: SelfT) => FactoryArgs`.

### `onInit(fn: () => void | Promise<void>)` / `onDispose(fn: () => void | Promise<void>)`
Declares a lifecycle hook on a component. Spread the result into the factory's return object — no wrapper, no factory signature change:
```typescript
return { db, ...onDispose(() => pool.end()), ...onInit(() => pool.query('SELECT 1')) };
```
Since assembly is synchronous, creator functions like `createServices` do not run `onInit` hooks automatically. You must run them using the async `init()` utility after assembling the layer.

### `init(layer): Promise<void>` / `dispose(layer: object): Promise<void>`
Recursively walk every component in the given layer (every object returned by a factory is internally branded so these utilities only traverse actual components, not arbitrary nested data), invoking their `onInit`/`onDispose` hooks.
- `init(layer)` runs hooks in build order (depth-first).
- `dispose(layer)` runs hooks in reverse build order.
```typescript
const services = createServices(config); // synchronous assembly
const modules = createModules(config, services); // synchronous assembly

await init(services);
await init(modules);

// later, at shutdown:
await dispose(modules);
await dispose(services);
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
  database: Unit<typeof database>;
  email: Unit<typeof email>;
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
  auth: Unit<typeof auth>;
};

export const createModules = moduleCreatorFactory({ auth });
```

### 4. Assemble and boot (`app.ts`)

```typescript
import { createServices } from './services';
import { createModules } from './modules';
import { init } from '@atom-forge/laminar';

const config = { smtp: "smtp.example.com" };

// Boot the application
const services = createServices(config); // synchronous assembly
const modules = createModules(config, services); // synchronous assembly

await init(services);
await init(modules);

await modules.auth.login("user@example.com");
```
