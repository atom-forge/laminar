---
type: chapter
---
# Getting started

This chapter builds a single `Services` layer end to end. Four steps: define the layer, write factories, assemble, start.

## 1. Define the layer

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

The resolver `([config], self) => [config, self]` says: *every factory in this layer receives the config and the container being built.*

## 2. Write a factory

```ts
// services/my-service.ts
import { defineService } from '../layers';

export const myService = defineService((config, services) => {
  return {
    doSomething: () => console.log(config.someValue),
  };
});
```

`defineService` only fixes the factory's parameter types; it returns the function unchanged.

## 3. Assemble the container

```ts
// services/index.ts
import { type Unit } from '@atom-forge/laminar';
import { serviceCreatorFactory } from '../layers';
import { myService } from './my-service';
import { otherService } from './other-service';

export type Services = {
  myService: Unit<typeof myService>;
  otherService: Unit<typeof otherService>;
};

export const createServices = serviceCreatorFactory({ myService, otherService });
```

> [!note] `Unit<T>`
> `Unit<typeof myService>` is just `ReturnType<typeof myService>`. It keeps the `Services` type in sync with the factories without repeating it by hand.

## 4. Start the application

```ts
// main.ts
import { init } from '@atom-forge/laminar';
import { createServices } from './services';
import { config } from './config';

const services = createServices(config); // synchronous
await init(services);                    // asynchronous hooks
services.myService.doSomething();
```

> [!success] That is the whole workflow
> Define a layer once, write as many factories as you like, call the creator, call `init`.
