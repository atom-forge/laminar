import { describe, expect, test, mock } from "bun:test";
import { makeLayer, onInit, onDispose, init, dispose, type Layer } from "./index.js";

type Config = { database: string };
type Services = {
	db: { query: (sql: string) => string; initCalled?: boolean; disposeCalled?: boolean };
	cache: { get: (key: string) => string; initCalled?: boolean; disposeCalled?: boolean };
};

describe("Laminar Sync Assembly + Async Lifecycle", () => {
	test("should assemble synchronously and run init/dispose asynchronously", async () => {
		let initSeq: string[] = [];
		let disposeSeq: string[] = [];

		const servicesLayer: Layer<[Config], Services, [Config, Services]> = makeLayer(
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

		const servicesLayer: Layer<[Config], Services, [Config, Services]> = makeLayer(
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
