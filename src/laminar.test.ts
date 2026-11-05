import { describe, expect, test } from "bun:test";
import { makeLayer, onInit, onDispose, init, dispose, internal, type FromLayer, type Layer, type PublicLayer } from "./index.js";

type Config = { database: string };
type Services = {
	db: { query: (sql: string) => string; initCalled?: boolean; disposeCalled?: boolean };
	cache: { get: (key: string) => string; initCalled?: boolean; disposeCalled?: boolean };
};

type ServicesLayer = Layer<[Config], Services, [Config, Services]>;

describe("Laminar Sync Assembly + Async Lifecycle", () => {
	test("should assemble synchronously and run init/dispose asynchronously", async () => {
		let initSeq: string[] = [];
		let disposeSeq: string[] = [];

		const servicesLayer: ServicesLayer = makeLayer<FromLayer<ServicesLayer>>(
			([config], self) => [config, self]
		);

		const [defineService, serviceCreatorFactory] = servicesLayer;

		const dbService = defineService((config, services) => {
			return {
				query: (sql: string) => `result for ${sql}`,
				...onInit(async () => {
					await new Promise((resolve) => setTimeout(resolve, 10));
					initSeq.push("db");
				}),
				...onDispose(async () => {
					await new Promise((resolve) => setTimeout(resolve, 10));
					disposeSeq.push("db");
				}),
			};
		});

		const cacheService = defineService((config, services) => {
			return {
				get: (key: string) => `value for ${key}`,
				...onInit(async () => {
					initSeq.push("cache");
				}),
				...onDispose(async () => {
					disposeSeq.push("cache");
				}),
			};
		});

		const createServices = serviceCreatorFactory({
			db: dbService,
			cache: cacheService,
		});

		// 1. Assembly is synchronous
		const services = createServices({ database: "localhost" });
		expect(services.db.query("SELECT 1")).toBe("result for SELECT 1");
		expect(services.cache.get("foo")).toBe("value for foo");

		// 2. Lifecycle init is async and explicit
		expect(initSeq).toEqual([]);
		await init(services);
		expect(initSeq).toEqual(["db", "cache"]);

		// 3. Lifecycle dispose is async, explicit, and in reverse order
		expect(disposeSeq).toEqual([]);
		await dispose(services);
		expect(disposeSeq).toEqual(["cache", "db"]);
	});

	test("should run the optional assemble hook synchronously with correct arguments", () => {
		let assembleCalledWith: any[] = [];

		const servicesLayer: ServicesLayer = makeLayer<FromLayer<ServicesLayer>>(
			([config], self) => [config, self]
		);

		const [defineService, serviceCreatorFactory] = servicesLayer;

		const dbService = defineService(() => ({ query: (sql: string) => `result` }));
		const cacheService = defineService(() => ({ get: (key: string) => `value` }));

		const createServices = serviceCreatorFactory({
			db: dbService,
			cache: cacheService,
		}, {
			assemble: (self, config, services) => {
				assembleCalledWith = [self, config, services];
			}
		});

		const services = createServices({ database: "localhost" });
		expect(assembleCalledWith).toEqual([services, { database: "localhost" }, services]);
	});
});

type Comps = Record<string, any>;
type CompLayer = Layer<[], Comps, [Comps]>;
const makeCompLayer = () => makeLayer<FromLayer<CompLayer>>((_outer, self) => [self]);

describe("Lifecycle traversal", () => {
	test("runs hooks of nested components created by defined factories", async () => {
		const [define, create] = makeCompLayer();
		const log: string[] = [];
		const child = define(() => ({
			...onInit(() => { log.push("init child"); }),
			...onDispose(() => { log.push("dispose child"); }),
		}));
		const parent = define((self) => ({
			child: internal(child(self)),
			...onInit(() => { log.push("init parent"); }),
			...onDispose(() => { log.push("dispose parent"); }),
		}));
		const layer = create({ parent })();
		await init(layer);
		await dispose(layer);
		expect(log).toEqual(["init parent", "init child", "dispose child", "dispose parent"]);
	});

	test("accepts frozen results and does not mutate factory results", async () => {
		const [define, create] = makeCompLayer();
		const log: string[] = [];
		const shared = Object.freeze({ ...onInit(() => { log.push("frozen"); }) });
		const layer = create({ frozen: define(() => shared) })();
		expect(Object.getOwnPropertySymbols(shared)).toHaveLength(1);
		await init(layer);
		expect(log).toEqual(["frozen"]);
	});

	test("runs hooks on function components", async () => {
		const [define, create] = makeCompLayer();
		const log: string[] = [];
		const fn = define(() => Object.assign(() => 1, onInit(() => { log.push("fn"); })));
		await init(create({ fn })());
		expect(log).toEqual(["fn"]);
	});

	test("visits shared and cyclic components once", async () => {
		const [define, create] = makeCompLayer();
		const log: string[] = [];
		const a = define(() => {
			const value: Record<string, unknown> = { ...onInit(() => { log.push("a"); }) };
			value.self = value;
			return value;
		});
		const b = define((self) => ({ a: self.a, ...onInit(() => { log.push("b"); }) }));
		await init(create({ a, b })());
		expect(log).toEqual(["a", "b"]);
	});

	test("ignores plain objects not produced by factories", async () => {
		const [define, create] = makeCompLayer();
		const log: string[] = [];
		const data = { ...onInit(() => { log.push("data"); }) };
		await init(create({ svc: define(() => ({ data })) })());
		expect(log).toEqual([]);
	});

	test("dispose runs every hook and rethrows a single error", async () => {
		const [define, create] = makeCompLayer();
		const log: string[] = [];
		const error = new Error("boom");
		const a = define(() => ({ ...onDispose(() => { log.push("a"); }) }));
		const b = define(() => ({ ...onDispose(() => { throw error; }) }));
		await expect(dispose(create({ a, b })())).rejects.toBe(error);
		expect(log).toEqual(["a"]);
	});

	test("dispose throws AggregateError for several failures", async () => {
		const [define, create] = makeCompLayer();
		const failing = (msg: string) => define(() => ({ ...onDispose(async () => { throw new Error(msg); }) }));
		const result = await dispose(create({ a: failing("a"), b: failing("b") })()).catch((e) => e);
		expect(result).toBeInstanceOf(AggregateError);
		expect((result as AggregateError).errors.map((e: Error) => e.message)).toEqual(["b", "a"]);
	});

	test("init stops at the first error", async () => {
		const [define, create] = makeCompLayer();
		const log: string[] = [];
		const a = define(() => ({ ...onInit(() => { throw new Error("a"); }) }));
		const b = define(() => ({ ...onInit(() => { log.push("b"); }) }));
		await expect(init(create({ a, b })())).rejects.toThrow("a");
		expect(log).toEqual([]);
	});
});

describe("PublicLayer", () => {
	test("removes internal properties at the type level only", () => {
		const svc = { visible: 1, hidden: internal(2), nested: { ok: true, secret: internal("x") } };
		const pub: PublicLayer<typeof svc> = svc;
		expect(pub.visible).toBe(1);
		// @ts-expect-error internal property is not part of the public surface
		expect(pub.hidden).toBe(2);
		// @ts-expect-error nested internal property is not part of the public surface
		expect(pub.nested.secret).toBe("x");
	});
});

describe("Self reference", () => {
	test("factories reach later siblings through deferred access", () => {
		type Pair = { first: { readSecond: () => number }; second: { value: number } };
		type PairLayer = Layer<[], Pair, [Pair]>;
		const [define, create] = makeLayer<FromLayer<PairLayer>>((_outer, self) => [self]);
		const first = define((self) => ({ readSecond: () => self.second.value }));
		const second = define(() => ({ value: 42 }));
		expect(create({ first, second })().first.readSecond()).toBe(42);
	});
});
