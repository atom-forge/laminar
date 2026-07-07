# Lifecycle support

## API

Az `onInit` és `onDispose` spreadelhető symbol-keyed objektumokat adnak vissza. A factory a return objektumba spreadelve deklarálhatja a lifecycle hookjait — nincs extra wrapper, nincs factory argumentum változás.

```typescript
export const prismaService = defineService((config, services) => {
    const pool = new Pool(config.database);
    return {
        db: new PrismaClient({ adapter: new PrismaPg(pool) }),
        ...onDispose(() => pool.end()),
        ...onInit(() => pool.query('SELECT 1')),
    };
});
```

`internal()`-lal kombinálva — a szülő jelöli internal-nak, nem a gyerek:

```typescript
// conferenceModule
return {
    public: conferencePublicModule(...),
    policy: internal(conferencePolicyModule(...)),  // szülő dönti el
};

// conferencePolicyModule — saját lifecycle, internal-ról nem tud
return {
    canEdit,
    canView,
    ...onDispose(() => cleanup()),
};
```

## Implementáció

```typescript
const COMPONENT = Symbol('laminar.component');
const DISPOSE   = Symbol('laminar.dispose');
const INIT      = Symbol('laminar.init');

type DisposeFn = () => void | Promise<void>;
type InitFn    = () => void | Promise<void>;

export const onDispose = (fn: DisposeFn) => ({ [DISPOSE]: fn });
export const onInit    = (fn: InitFn)    => ({ [INIT]: fn });
```

## Komponens brand

Az `assemble` minden factory return értékét megbrandeli `[COMPONENT]` symbolmal. Ez jelzi, hogy az objektum Laminar-kezelt komponens — nem egy véletlenül ott lévő Prisma model, Date, vagy egyéb objektum.

```typescript
// assemble-ben, minden factory hívás után:
items[key] = await defs[key](...getArgs(items));
(items[key] as any)[COMPONENT] = true;
```

## `dispose()` és `init()` utility-k

Csak `[COMPONENT]`-ként brandelt objektumokba mennek bele rekurzívan — így nem tévednek bele véletlenül domain objektumokba, és körkörös referencia sem fordulhat elő (a rétegrendszer megakadályozza, hogy Laminar komponensek körkörösek legyenek).

```typescript
function walk(obj: object): unknown[] {
    const result: unknown[] = [];
    for (const key of Object.keys(obj)) {
        const value = (obj as any)[key];
        if (!value || typeof value !== 'object' || !value[COMPONENT]) continue;
        result.push(value);
        result.push(...walk(value));
    }
    return result;
}

export async function dispose(layer: object) {
    for (const value of walk(layer).reverse()) {
        if (typeof (value as any)[DISPOSE] === 'function') {
            await (value as any)[DISPOSE]();
        }
    }
}

export async function init(layer: object) {
    for (const value of walk(layer)) {
        if (typeof (value as any)[INIT] === 'function') {
            await (value as any)[INIT]();
        }
    }
}
```

`onInit` mélységi sorrendben fut, `onDispose` fordítva — az utoljára talált komponens takarít el először.

## Használat

```typescript
// application/index.ts
export async function createApp(config: Config) {
    const services   = await createServices(config);
    const modules    = await createModules(config, services);
    const apiSupport = await createApiSupport(config, modules);
    const api        = await createApi(config, modules, apiSupport);

    await init(services);
    await init(modules);

    const disposeAll = async () => {
        await dispose(modules);
        await dispose(services);
    };

    return { config, services, modules, apiSupport, api, dispose: disposeAll };
}
```

A cross-layer sorrendet a hívó kezeli — `init` felépítési sorrendben, `dispose` fordítva.

## Nincs `disposable` kapcsoló

Nincs szükség `makeLayer`-en kapcsolóra, collector argumentumra, vagy factory szignatúra változásra. A lifecycle hookokat a factory szabadon hozzáadhatja — vagy nem. A `dispose()` és `init()` utility-k csendben átugorják azokat a komponenseket, ahol nincs hook.
