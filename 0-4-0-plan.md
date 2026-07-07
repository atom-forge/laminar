# 0.4.0 — Sync rollback + async lifecycle

## Miért?

A 0.2.0-ban bevezetett async factory support (async `assemble`) több problémát okozott mint amennyit megoldott:

- A nested factory hívások mindenhol `await`-et igényelnek
- A container típusok (`Services`, `Modules`, `Api`) `Component<>` / `Awaited<>` fix-et igényelnek
- A `defineApi`, `defineModule` stb. factory-k `async` kulcsszót kapnak ahol nested hívás van
- Összességében nagy refaktor teher, minimális valós igény nélkül

A lifecycle support (`onInit`, `onDispose`) ugyanakkor értékes — de nem igényel async assembly-t. Az `init()` és `dispose()` utility-k maguk lehetnek async, az `assemble` maradhat szinkron.

## Változások

### Kivesz: async factory support

Az `assemble` visszaáll szinkronra:

```typescript
function assemble<T extends AnyRecord>(
    defs: { [K in keyof T]: (...args: any[]) => T[K] },
    getArgs: (self: T) => unknown[],
): T {
    const items = {} as T;
    for (const key of Object.keys(defs) as Array<keyof T>) {
        items[key] = defs[key](...getArgs(items));
    }
    return items;
}
```

A `Layer` típus `create` eleme visszaáll `SelfT`-re (`Promise<SelfT>` helyett). A `createApp` és minden creator hívás szinkron marad.

### Marad: lifecycle support (0.3.0-ból)

`[COMPONENT]` brand, `onInit`, `onDispose`, `walk`, `init()`, `dispose()` — változatlanul.

### Async init és dispose

Az `init()` és `dispose()` utility-k async-ok — a hookokat `await`-elik:

```typescript
export async function init(layer: object): Promise<void> {
    for (const value of walk(layer)) {
        if (typeof (value as any)[INIT] === 'function') {
            await (value as any)[INIT]();
        }
    }
}

export async function dispose(layer: object): Promise<void> {
    for (const value of walk(layer).reverse()) {
        if (typeof (value as any)[DISPOSE] === 'function') {
            await (value as any)[DISPOSE]();
        }
    }
}
```

A factory-k `onInit`/`onDispose` hookjai lehetnek async-ok — az assembly ettől nem változik, az `init()`/`dispose()` híváskor futnak le.

## Eredmény

```typescript
// szinkron assembly — semmi sem változik
export const app = createApp(config);

// async init — az assembly után, egyszer
await init(app.services);
await init(app.modules);

// async dispose — leálláskor
await dispose(app.modules);
await dispose(app.services);
```

Factory lifecycle hookokkal:

```typescript
export const dbService = defineService((config, services) => {
    const pool = new Pool(config.database);
    return {
        db: new Client({ pool }),
        ...onDispose(() => pool.end()),
        ...onInit(() => pool.query('SELECT 1')),
    };
});
```

## Breaking changes

- Async factory support eltűnik — aki async factory-t írt, az visszaállítja szinkronra
- `Component<>` / `Awaited<>` típus-fixek nem kellenek
- Creator hívások előtti `await`-ek eltűnnek
