# Async factory support

## A változás

Az `assemble` függvény asyncronná válik — minden factory return értékét `await`-eli, így a factory-k visszaadhatnak `Promise<T>`-t is `T` mellett.

```typescript
async function assemble<T extends AnyRecord>(
    defs: { [K in keyof T]: (...args: any[]) => T[K] | Promise<T[K]> },
    getArgs: (self: T) => unknown[],
): Promise<T> {
    const items = {} as T;
    for (const key of Object.keys(defs) as Array<keyof T>) {
        items[key] = await Promise.resolve(defs[key](...getArgs(items)));
    }
    return items;
}
```

A szekvenciális await megőrzi a self-referencia működését: `items` mindig már feloldott értékeket tartalmaz, amikor a következő factory megkapja.

## Típusváltozások

`LayerDefs`-ben a factory visszatérési értéke `T[K] | Promise<T[K]>` lesz:

```typescript
type LayerDefs<FactoryArgs extends unknown[], SelfT extends AnyRecord> = {
    [K in keyof SelfT]: (...args: FactoryArgs) => SelfT[K] | Promise<SelfT[K]>;
};
```

A `Layer` tuple `create` eleme `Promise<SelfT>`-t ad vissza:

```typescript
export type Layer<
    OuterArgs extends unknown[] = unknown[],
    SelfT extends AnyRecord = AnyRecord,
    FactoryArgs extends unknown[] = unknown[],
> = [
    <T>(factory: (...args: FactoryArgs) => T | Promise<T>) => (...args: FactoryArgs) => T | Promise<T>,
    (defs: LayerDefs<FactoryArgs, SelfT>) => (...outerArgs: OuterArgs) => Promise<SelfT>,
];
```

## Breaking change

A `create` által visszaadott creator függvény mostantól `Promise`-t ad vissza. A belépési ponton `await` kell:

```typescript
// előtte
export const app = createApp(config);

// utána
export const app = await createApp(config);
```

Az alkalmazás többi kódja nem változik — ha a factory-k belseje szinkron marad, csak a keretrendszer lesz async.
