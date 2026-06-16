# Laminar

Laminar egy könnyűsúlyú, típusbiztos rétegkezelő rendszer TypeScript-hez. Lehetővé teszi, hogy az alkalmazás logikáját egymásra épülő, jól elkülönített rétegekbe szervezzük.

A lényege, hogy a rétegek **lazy módon** szerelődnek össze **factory-k** által.

---

## Alapfogalmak

### Réteg (Layer)

Egy réteg egy objektumstruktúra, ami önálló komponensekből (modulok, service-ek, stb.) áll. A Laminar-ban egy réteget factory függvények egy csoportja határoz meg. Ezek a factory-k felelősek a réteg egyes komponenseinek létrehozásáért.

### Factory

Egy factory egy egyszerű függvény, amely a réteg egy unitját hozza létre. Paraméterként megkaphatja más rétegek unitjait, vagy akár a saját rétegén belüli más unitokat is (self-referencia). A factory-k által visszaadott objektumok együttesen alkotják a teljes réteget. Egy factory az értékét közvetlenül (szinkron módon) adja vissza.

### `internal`

Egy értéket belsőnek jelöl — a modul/service publikus felületéből kizáródik, de a rétegen belül más factory-k számára látható marad. Ez lehetővé teszi, hogy a réteg belső működését elrejtsük más rétegek elől.

```ts
import { internal } from '@atom-forge/laminar';

return {
  doPublicThing,
  doInternalThing: internal(doInternalThing),
};
```

### `PublicLayer<T>`

Rekurzívan leveszi az `internal(...)` jelöléssel ellátott mezőket egy típusból. A szomszédos rétegek csak a `PublicLayer<T>` felületet látják.

---

## API

### `Layer<OuterArgs, SelfT, FactoryArgs>`

Egy réteg típusa. Tuple formában tartalmazza a réteg két eszközét:

```ts
[define, create]
```

| Paraméter    | Jelentés                                                        |
|--------------|-----------------------------------------------------------------|
| `OuterArgs`  | A `create(...)` által visszaadott creator függvény argumentumai |
| `SelfT`      | A réteg által épített konténer típusa                           |
| `FactoryArgs`| Amit minden egyes factory függvény kap argumentumként           |

### `FromLayer<T>`

Utility type: egy `Layer<...>` típusból kivonja a tuple formát `[OuterArgs, SelfT, FactoryArgs]`. Főleg `makeLayer<FromLayer<MyLayer>>(...)` formában használatos.

### `Unit<T>`

Utility type: kinyeri egy factory függvény visszatérési típusát (`ReturnType<T>`). Segítségével tisztábban definiálhatók a konténer típusok: `type Services = { myService: Unit<typeof myService> }`.

### `makeLayer<L>(resolver)`

Egy réteg létrehozója. Visszaad egy `[define, create]` tuple-t. A `create(...)` által visszaadott függvény szinkron — mindig `SelfT`-t ad vissza közvetlenül, mivel a factory-k mind szinkronban futnak le.

```ts
const myLayer = makeLayer<FromLayer<MyLayerType>>(
  (outerArgs, self) => [...factoryArgs]
);
```

A `resolver` feladata: az `outerArgs` (a creator kapott argumentumai) és a `self` (az éppen épülő konténer) alapján összerakja a factory argumentum tuple-t.

A `makeLayer` által visszaadott creator függvény (a tuple második eleme) elfogad egy opcionális `options` objektumot második paraméterként:
```ts
const createContainer = create(defs, {
  assemble: (self, ...factoryArgs) => {
    // Közvetlenül az összeszerelés után fut le szinkronban
  }
});
```
Ez nagyon hasznos olyan imperatív beállítások (például router/middleware regisztráció vagy eseménykezelők bekötése) végrehajtására közvetlenül az összeszerelés után, amikhez egyébként egy egyedi wrapper függvényt kellene írnunk.

### `onInit(fn)` / `onDispose(fn)`

Lifecycle hookokat deklarálnak egy uniton — a factory return objektumába spreadelve kell használva, nincs extra wrapper, nincs factory argumentum változás.

```ts
export const prismaService = defineService((config, services) => {
  const pool = new Pool(config.database);
  return {
    db: new PrismaClient({ adapter: new PrismaPg(pool) }),
    ...onDispose(() => pool.end()),
    ...onInit(() => pool.query('SELECT 1')),
  };
});
```

Mivel a szerelés teljesen szinkronban történik, a `createServices` és hasonló creator függvények nem futtatják le automatikusan az `onInit` hookokat. Az inicializáláshoz manuálisan kell meghívni az aszinkron `init()` utility-t a réteg felépítése után.

### `init(layer)` / `dispose(layer)`

Egy réteget fogad el, és rekurzívan bejárja az összes unitját, lefuttatva az `onInit`/`onDispose` hookokat. Mindkettő aszinkron és megvárja a hookokat. Csendben átugorja azokat a unitokat, ahol nincs hook.

```ts
const services = createServices(config); // szinkron összeszerelés
await init(services); // aszinkron inicializálás

// Leállás
await dispose(services); // aszinkron takarítás
```

---

## Használat

### 1. Réteg definiálása

Először definiáljuk a réteg típusát és létrehozzuk a `[define, create]` eszköztárat a `makeLayer` segítségével.

Például egy `Services` réteg, ami a `Config` rétegre épül:

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

### 2. Factory írása

A `defineService` segítségével típusbiztosan írhatunk egy factory-t a réteghez.

```ts
// services/my-service.ts
import { defineService } from './layers';

export const myService = defineService((config, services) => {
  // 'services' itt a self-referencia, hozzáférhetünk más service-ekhez (lazy)
  return {
    doSomething: () => { console.log(config.someValue); },
  };
});
```

### 3. Konténer összeszerelése

A `serviceCreatorFactory` segítségével a factory-kból összeállítjuk a teljes réteget.

```ts
// services/index.ts
import { type Unit } from '@atom-forge/laminar';
import { serviceCreatorFactory } from './layers';
import { myService } from './my-service';
import { otherService } from './other-service';

// A teljes réteg típusa
export type Services = {
  myService: Unit<typeof myService>;
  otherService: Unit<typeof otherService>;
};

// A creator függvény, ami a Config-ot várja majd
export const createServices = serviceCreatorFactory({
  myService,
  otherService,
});
```

### 4. Összeállítás és inicializálás

Végül az alkalmazás indításakor a `createServices` függvénnyel hozzuk létre a réteget, majd az `init`-tel inicializáljuk:

```ts
// main.ts
import { createServices } from './services';
import { config } from './config';
import { init } from '@atom-forge/laminar';

const services = createServices(config); // szinkron összeszerelés
await init(services); // aszinkron inicializálás
services.myService.doSomething();
```

---

## Példa: Egy 3-rétegű alkalmazás

Az alábbi példa egy konkrét alkalmazás rétegeit definiálja. A rétegek egymásra épülnek a következő sorrendben: `Config` → `Services` → `Modules` → `API`.

### A rétegek definíciója (`layers.ts`)

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

#### Magyarázat

1.  **Services Layer**:
    *   A `serviceCreatorFactory` egy `Config` objektumot vár (`CreatorArgs: [Config]`).
    *   Minden service factory megkapja a `Config`-ot és a `Services` konténert (`FactoryArgs: [Config, Services]`), ami lehetővé teszi a rétegen belüli hivatkozásokat.

2.  **Modules Layer**:
    *   A `moduleCreatorFactory` egy `Config`-ot és egy `Services` konténert vár (`CreatorArgs: [Config, Services]`).
    *   Minden modul factory megkapja a `Config`-ot, a `Services` publikus felületét (`PublicLayer<Services>`), és a `Modules` konténert (`FactoryArgs: [Config, PublicLayer<Services>, Modules]`). A `PublicLayer` biztosítja, hogy a modulok ne férjenek hozzá a service-ek belső (`internal`) részeihez.

3.  **API Layer**:
    *   Az `apiCreatorFactory` egy `Config`-ot és egy `Modules` konténert vár (`CreatorArgs: [Config, Modules]`).
    *   Minden API factory megkapja a `Config`-ot és a `Modules` publikus felületét (`FactoryArgs: [Config, PublicLayer<Modules>]`). Ez a réteg nem önreferens (`_self` eldobva), mert az API végpontok általában nem hivatkoznak egymásra.

### Egy service implementálása és a réteg összeállítása

Most nézzük meg, hogyan használjuk fel a fent definiált `defineService` és `serviceCreatorFactory` eszközöket a `Services` réteg megépítéséhez.

**1. A factory megírása (`email.ts`)**

Létrehozunk egy egyszerű e-mail küldő service-t. A `defineService` biztosítja, hogy pontosan azokat a paramétereket kapjuk meg, amiket a `layers.ts`-ben definiáltunk: `(config, services)`.

```ts
// services/email.ts
import { defineService } from './layers';
import { internal } from '@atom-forge/laminar';

export const emailService = defineService((config, services) => {
  // Belső segédfüggvény, csak a Services rétegen belül lesz elérhető
  async function connectToSmtp() {
    console.log(`Connecting to ${config.smtpHost}...`);
    // ...
  }

  // Publikus függvény, amit a felsőbb rétegek is használhatnak
  async function sendEmail(to: string, body: string) {
    await connectToSmtp();
    console.log(`Sending email to ${to}`);
    // ...
  }

  return {
    sendEmail,
    connectToSmtp: internal(connectToSmtp), // Elrejtjük a Modules réteg elől
  };
});
```

**2. A konténer összeszerelése (`index.ts`)**

Miután minden service-t megírtunk, egyetlen fájlban összegyűjtjük őket, és a `serviceCreatorFactory` segítségével elkészítjük az összeszerelő függvényt (`createServices`). Ez a függvény lesz az, ami a legfelső szinten példányosítja a teljes réteget.

```ts
// services/index.ts
import { type Unit } from '@atom-forge/laminar';
import { serviceCreatorFactory } from './layers';
import { emailService } from './email';

// A teljes Services réteg publikus és belső (internal) felülete egyben.
// Ezt a típust használja a Laminar a rétegen belüli self-referenciákhoz.
export type Services = {
  email: Unit<typeof emailService>;
};

// Létrehozzuk a builder függvényt.
export const createServices = serviceCreatorFactory({
  email: emailService,
});
```

Amikor az alkalmazás elindul, a `createServices(config)` hívás lazy módon, a factory-k lefuttatásával felépíti a `Services` konténert szinkron módon. Ezt követően az `await init(services)` hívással inicializáljuk a réteget. Ezt a konténert (pontosabban annak `PublicLayer` változatát) adjuk majd tovább a `Modules` réteg factory-jának.
