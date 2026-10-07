# Laminar

Laminar is a lightweight, type-safe layered architecture and Dependency Injection (DI) system for TypeScript. It allows you to organize your application logic into layered, well-isolated containers.

Layers are assembled **synchronously** using **factories**, in `Object.keys(defs)` order. Factories receive the shared container while it is being built. Access later components inside methods or lifecycle hooks after assembly, not during factory execution. Circular references are safe only when access is deferred; destructuring a not-yet-built component captures `undefined`.

---

## Core Concepts

### Layer

A layer is an object structure containing individual components (modules, services, etc.). In Laminar, a layer is defined by a set of factory functions. These factories are responsible for creating each component of the layer.

### Factory

A factory is a simple function that creates one component of the layer. It can receive components from other layers, or even other components from its own layer (self-reference). The objects returned by the factories collectively form the completed layer. A factory returns its value directly (synchronously).

There is no dependency graph or automatic sorting. Prefer non-numeric factory names to preserve insertion order. Each creator invocation calls every factory again and builds a new container; there is no global singleton registry. Deferred circular references do not prevent circular method calls from recursing indefinitely.

### `internal`

Marks a value as internal — it is excluded from the public layer interface, but remains visible to other factories within the same layer. This allows you to hide the internal implementation details of a layer from other layers.

```ts
import { internal } from '@atom-forge/laminar';

return {
  doPublicThing,
  doInternalThing: internal(doInternalThing), // Hidden from external layers
};
```

### `PublicLayer<T>`

Recursively filters out properties marked as `internal(...)` from a type. Neighboring layers see this restricted interface only when their factory arguments are typed as `PublicLayer<T>`. Function signatures are preserved.

This is compile-time visibility, not runtime filtering or a security boundary: `internal(value)` returns the same value unchanged, and internal properties remain on the object at runtime.

---

## API

### `Layer<OuterArgs, SelfT, FactoryArgs>`

The type definition of a layer. It contains two tools in a tuple:

```ts
[define, create]
```

| Parameter    | Meaning                                                         |
|--------------|-----------------------------------------------------------------|
| `OuterArgs`  | The arguments accepted by the creator returned by `create(...)` |
| `SelfT`      | The type of the container built by the layer                    |
| `FactoryArgs`| The arguments that each individual factory function receives    |

### `FromLayer<T>`

Utility type: extracts the tuple format `[OuterArgs, SelfT, FactoryArgs]` from a `Layer<...>` type. Primarily used in the form `makeLayer<FromLayer<MyLayer>>(...)`.

### `Unit<T>`

Utility type: extracts the return type of a factory function (`ReturnType<T>`). Useful for defining the container types cleanly: `type Services = { myService: Unit<typeof myService> }`.

### `makeLayer<L>(resolver)`

Creates a layer. Returns a `[define, create]` tuple. `create(defs, options?)` returns a creator function; calling that creator with `OuterArgs` synchronously builds and returns `SelfT`. Factories and the `assemble` callback must be synchronous; asynchronous startup belongs in `onInit`.

```ts
const myLayer = makeLayer<FromLayer<MyLayerType>>(
  (outerArgs, self) => [...factoryArgs]
);
```

The role of the `resolver` is to assemble the factory arguments tuple based on `outerArgs` (arguments passed to the creator) and `self` (the container currently being assembled).

The `create` helper returned by `makeLayer` (the second element of the tuple) accepts an optional `options` object as a second argument, alongside the factory definitions:
```ts
const createContainer = create(defs, {
  assemble: (self, ...factoryArgs) => {
    // Runs synchronously immediately after assembly
  }
});
```
This is useful for running imperative setup/binding logic (e.g. registering routes or middleware on the container) immediately after it is assembled, without needing a separate custom wrapper function.

### `onInit(fn)` / `onDispose(fn)`

Declares lifecycle hooks on a component — spread the result into the factory's return object. No extra wrapper, no change to the factory signature.

```ts
export const prismaService = defineService((config, services) => {
  const pool = new Pool(config.database);
  return {
    db: new PrismaClient({ adapter: new PrismaPg(pool) }),
    ...onDispose(() => pool.end()),
    ...onInit(async () => { await pool.query('SELECT 1'); }),
  };
});
```

Since the assembly is fully synchronous, creator functions like `createServices` do not run `onInit` hooks automatically. You must run them using the async `init()` utility after assembling the layer.

### `init(layer)` / `dispose(layer)`

Accepts a layer and recursively walks factory-returned objects branded as components, running their `onInit`/`onDispose` hooks. Arbitrary nested data is not traversed. Both functions await hooks sequentially; components without a hook are skipped.

- `init` uses depth-first traversal, parent before child; `dispose` uses the reverse order. For a flat layer, this is factory definition order and its reverse.
- An error stops the current call. There is no automatic rollback or cleanup of remaining components.
- Repeated calls run hooks again; idempotency is the application's responsibility.
- Traversal has no cycle detection or deduplication. Keep component references in closures rather than cyclic enumerable properties; shared components can have their hooks called more than once.
- Each object holds one hook of each kind: spreading multiple `onInit` or `onDispose` results overwrites earlier hooks of that kind.
- Initialize lower layers before higher layers and dispose them in the opposite order; dependencies captured in closures are not discovered automatically.

```ts
const services = createServices(config); // synchronous assembly
await init(services); // async initialization

// Shutdown
await dispose(services); // async cleanup
```

---

## Usage

### 1. Defining a Layer

First, define the layer type and create the `[define, create]` toolkit using `makeLayer`.

For example, a `Services` layer built on top of a `Config` object:

```ts
// layers.ts
import { type FromLayer, type Layer, makeLayer } from '@atom-forge/laminar';
import type { Config } from './config';
import type { Services } from './services';

// Layer<CreatorArgs, SelfType, FactoryArgs>
type ServicesLayer = Layer<[Config], Services, [Config, Services]>;

export const servicesLayer: ServicesLayer = makeLayer<FromLayer<ServicesLayer>>(
  ([config], self) => [config, self],
);

export const [defineService, serviceCreatorFactory] = servicesLayer;
```

### 2. Writing a Factory

Use `defineService` to write a type-safe factory for the layer.

```ts
// services/my-service.ts
import { defineService } from '../layers';

export const myService = defineService((config, services) => {
  // Access later services through the shared container inside methods after assembly.
  return {
    doSomething: () => { console.log(config.someValue); },
  };
});
```

### 3. Assembling the Container

Use `serviceCreatorFactory` to assemble the full layer container from the factories.

```ts
// services/index.ts
import { type Unit } from '@atom-forge/laminar';
import { serviceCreatorFactory } from '../layers';
import { myService } from './my-service';
import { otherService } from './other-service';

// The type of the full layer
export type Services = {
  myService: Unit<typeof myService>;
  otherService: Unit<typeof otherService>;
};

// The creator function that will expect the Config
export const createServices = serviceCreatorFactory({
  myService,
  otherService,
});
```

### 4. Initialization

Finally, when the application starts, initialize your layer by calling the creator function and executing `init`:

```ts
// main.ts
import { createServices } from './services';
import { config } from './config';
import { init } from '@atom-forge/laminar';

const services = createServices(config); // synchronous assembly
await init(services); // async initialization
services.myService.doSomething();
```

---

## Example: A 3-Layer Application

The following example defines the layers of a typical backend application, built in this order: `Config` → `Services` → `Modules` → `API`.

### Layer Definitions (`layers.ts`)

```ts
// layers.ts
import {type FromLayer, type Layer, makeLayer, type PublicLayer} from "@atom-forge/laminar";
import type {Services} from "./services";
import type {Modules} from "./modules";
import type {Rpc} from "./api";
import type {Config} from "./config";

// Services layer
// Creator: (config) => Services
// Factory: (config, services) => T
type ServicesLayer = Layer<[Config], Services, [Config, Services]>;
export const servicesLayer: ServicesLayer = makeLayer<FromLayer<ServicesLayer>>(
	([config], self) => [config, self],
);

// Modules layer
// Creator: (config, services) => Modules
// Factory: (config, services, modules) => T
type ModulesLayer = Layer<[Config, Services], Modules, [Config, PublicLayer<Services>, Modules]>;
export const modulesLayer: ModulesLayer = makeLayer<FromLayer<ModulesLayer>>(
	([config, services], self) => [config, services as PublicLayer<Services>, self],
);

// Api layer
// Creator: (config, modules) => Rpc
// Factory: (config, modules) => T
type ApiLayer = Layer<[Config, Modules], Rpc, [Config, PublicLayer<Modules>]>;
export const apiLayer: ApiLayer = makeLayer<FromLayer<ApiLayer>>(
	([config, modules], _self) => [config, modules as PublicLayer<Modules>],
);

export const [defineService, serviceCreatorFactory] = servicesLayer;
export const [defineModule, moduleCreatorFactory] = modulesLayer;
export const [defineApi, apiCreatorFactory] = apiLayer;
```

#### Explanation

1.  **Services Layer**:
    *   `serviceCreatorFactory` expects a `Config` object (`CreatorArgs: [Config]`).
    *   Each service factory receives `Config` and the `Services` container (`FactoryArgs: [Config, Services]`), enabling self-references within the same layer.

2.  **Modules Layer**:
    *   `moduleCreatorFactory` expects `Config` and the `Services` container (`CreatorArgs: [Config, Services]`).
    *   Each module factory receives `Config`, the public interface of the services (`PublicLayer<Services>`), and the `Modules` container. `PublicLayer` prevents access to service methods marked as `internal` at compile time.

3.  **API Layer**:
    *   `apiCreatorFactory` expects `Config` and the `Modules` container.
    *   Each API factory receives `Config` and the public interface of the modules. This layer is not self-referential (`_self` is ignored) since API endpoints typically do not call each other directly.

### Implementing a Service and Assembling the Layer

Here is how we use the `defineService` and `serviceCreatorFactory` to build the `Services` layer.

**1. Writing the factory (`email.ts`)**

We write a simple email sending service. `defineService` ensures we receive exactly the parameters specified in `layers.ts`: `(config, services)`.

```ts
// services/email.ts
import { defineService } from '../layers';
import { internal } from '@atom-forge/laminar';

export const emailService = defineService((config, services) => {
  // Internal helper function, omitted from PublicLayer<Services> at compile time
  async function connectToSmtp() {
    console.log(`Connecting to ${config.smtpHost}...`);
    // ...
  }

  // Public function accessible to upper layers
  async function sendEmail(to: string, body: string) {
    await connectToSmtp();
    console.log(`Sending email to ${to}`);
    // ...
  }

  return {
    sendEmail,
    connectToSmtp: internal(connectToSmtp), // Hidden from the Modules layer
  };
});
```

**2. Assembling the container (`index.ts`)**

Collect all services in a single file and use `serviceCreatorFactory` to create the assembler function `createServices`.

```ts
// services/index.ts
import { type Unit } from '@atom-forge/laminar';
import { serviceCreatorFactory } from '../layers';
import { emailService } from './email';

// The type of the full Services layer containing both public and internal interfaces.
// This type is used by Laminar for self-referential resolution.
export type Services = {
  email: Unit<typeof emailService>;
};

// Create the builder function
export const createServices = serviceCreatorFactory({
  email: emailService,
});
```

When the application starts, calling `createServices(config)` immediately executes the factories in definition order to construct a new `Services` container synchronously. You then initialize the layer using `await init(services)`.

---

## Complete Typed Example

### 1. Define the layers (`layers.ts`)

```typescript
import { type FromLayer, type Layer, makeLayer, type PublicLayer } from '@atom-forge/laminar';
import type { Services } from './services';
import type { Modules } from './modules';

export type Config = { smtp: string };

// 1. Services Layer (Creator: (config) => Services; Factory: (config, services) => Service)

type ServicesLayer = Layer<[Config], Services, [Config, Services]>;
export const servicesLayer: ServicesLayer = makeLayer<FromLayer<ServicesLayer>>(
  ([config], self) => [config, self]
);
export const [defineService, serviceCreatorFactory] = servicesLayer;

// 2. Modules Layer (Creator: (config, services) => Modules; Factory: (config, services, modules) => Module)

type ModulesLayer = Layer<[Config, Services], Modules, [Config, PublicLayer<Services>, Modules]>;
export const modulesLayer: ModulesLayer = makeLayer<FromLayer<ModulesLayer>>(
  ([config, services], self) => [config, services as PublicLayer<Services>, self]
);
export const [defineModule, moduleCreatorFactory] = modulesLayer;
```

### 2. Implement the services (`services.ts`)

```typescript
import { internal, type Unit } from '@atom-forge/laminar';
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
      // Access the database through the shared container after assembly:
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
import { type Unit } from '@atom-forge/laminar';
import { defineModule, moduleCreatorFactory } from './layers';

export const auth = defineModule((config, services, modules) => {
  return {
    login: async (user: string) => {
      await services.email.send(user, "Welcome!");
      // PublicLayer<Services> excludes database.pool at compile time
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
