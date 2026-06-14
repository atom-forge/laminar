# Laminar

Laminar is a lightweight, type-safe layered architecture and Dependency Injection (DI) system for TypeScript. It allows you to organize your application logic into layered, well-isolated containers.

The core philosophy is that layers are assembled **lazily** using **factories**, preventing issues related to initialization order or circular dependencies.

---

## Core Concepts

### Layer

A layer is an object structure containing individual elements (modules, services, etc.). In Laminar, a layer is defined by a set of factory functions. These factories are responsible for creating each element of the layer.

### Factory

A factory is a simple function that creates one element of the layer. It can receive elements from other layers, or even other elements from its own layer (self-reference). The objects returned by the factories collectively form the completed layer.

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

Recursively filters out properties marked as `internal(...)` from a type. Neighboring layers will only see the `PublicLayer<T>` interface.

---

## API

### `Layer<OuterArgs, SelfT, FactoryArgs>`

The type definition of a layer. It contains two tools in a tuple:

```ts
[define, create]
```

| Parameter    | Meaning                                                         |
|--------------|-----------------------------------------------------------------|
| `OuterArgs`  | The arguments that the resulting `create(...)` function accepts |
| `SelfT`      | The type of the container built by the layer                    |
| `FactoryArgs`| The arguments that each individual factory function receives    |

### `FromLayer<T>`

Utility type: extracts the tuple format `[OuterArgs, SelfT, FactoryArgs]` from a `Layer<...>` type. Primarily used in the form `makeLayer<FromLayer<MyLayer>>(...)`.

### `makeLayer<L>(resolver)`

Creates a layer. Returns a `[define, create]` tuple.

```ts
const myLayer = makeLayer<FromLayer<MyLayerType>>(
  (outerArgs, self) => [...factoryArgs]
);
```

The role of the `resolver` is to assemble the factory arguments tuple based on `outerArgs` (arguments passed to the creator) and `self` (the container currently being assembled).

---

## Usage

### 1. Defining a Layer

First, define the layer type and create the `[define, create]` toolkit using `makeLayer`.

For example, a `Services` layer built on top of a `Config` object:

```ts
// layers.ts
import { type FromLayer, type Layer, makeLayer, PublicLayer } from '@atom-forge/laminar';
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
import { defineService } from './layers';

export const myService = defineService((config, services) => {
  // 'services' is the self-reference, allowing access to other services (lazily)
  return {
    doSomething: () => { console.log(config.someValue); },
  };
});
```

### 3. Assembling the Container

Use `serviceCreatorFactory` to assemble the full layer container from the factories.

```ts
// services/index.ts
import { serviceCreatorFactory } from './layers';
import { myService } from './my-service';
import { otherService } from './other-service';

// The type of the full layer
export type Services = {
  myService: ReturnType<typeof myService>;
  otherService: ReturnType<typeof otherService>;
};

// The creator function that will expect the Config
export const createServices = serviceCreatorFactory({
  myService,
  otherService,
});
```

### 4. Initialization

Finally, when the application starts, initialize your layer using the `createServices` function:

```ts
// main.ts
import { createServices } from './services';
import { config } from './config';

const services = createServices(config);
services.myService.doSomething();
```

---

## Example: A 3-Layer Application

The following example defines the layers of a typical backend application, built in this order: `Config` → `Services` → `Modules` → `API`.

### Layer Definitions (`layers.ts`)

```ts
// layers.ts
import {type FromLayer, type Layer, makeLayer, PublicLayer} from "@atom-forge/laminar";
import type {Services} from "./services";
import type {Modules} from "./modules";
import type {Rpc} from "./api";
import {Config} from "./index";

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
export const apiLayer: ApiLayer = makeLayer<FromLayer<typeof apiLayer>>(
	([config, modules], _self) => [config, modules as PublicLayer<Modules>],
);

export const [defineService, serviceCreatorFactory] = servicesLayer;
export const [defineModule, moduleCreatorFactory] = modulesLayer
export const [defineApi, apiCreatorFactory] = apiLayer;
```

#### Explanation

1.  **Services Layer**:
    *   `serviceCreatorFactory` expects a `Config` object (`CreatorArgs: [Config]`).
    *   Each service factory receives `Config` and the `Services` container (`FactoryArgs: [Config, Services]`), enabling self-references within the same layer.

2.  **Modules Layer**:
    *   `moduleCreatorFactory` expects `Config` and the `Services` container (`CreatorArgs: [Config, Services]`).
    *   Each module factory receives `Config`, the public interface of the services (`PublicLayer<Services>`), and the `Modules` container. `PublicLayer` ensures that modules cannot access any service methods marked as `internal`.

3.  **API Layer**:
    *   `apiCreatorFactory` expects `Config` and the `Modules` container.
    *   Each API factory receives `Config` and the public interface of the modules. This layer is not self-referential (`_self` is ignored) since API endpoints typically do not call each other directly.

### Implementing a Service and Assembling the Layer

Here is how we use the `defineService` and `serviceCreatorFactory` to build the `Services` layer.

**1. Writing the factory (`email.ts`)**

We write a simple email sending service. `defineService` ensures we receive exactly the parameters specified in `layers.ts`: `(config, services)`.

```ts
// services/email.ts
import { defineService } from './layers';
import { internal } from '@atom-forge/laminar';

export const emailService = defineService((config, services) => {
  // Internal helper function, only accessible within the Services layer
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
import { serviceCreatorFactory } from './layers';
import { emailService } from './email';

// The type of the full Services layer containing both public and internal interfaces.
// This type is used by Laminar for self-referential resolution.
export type Services = {
  email: ReturnType<typeof emailService>;
};

// Create the builder function
export const createServices = serviceCreatorFactory({
  email: emailService,
});
```

When the application starts, calling `createServices(config)` lazily executes the factories to construct the `Services` container.
