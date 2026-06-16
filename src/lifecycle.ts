import { COMPONENT, DISPOSE, INIT } from './symbols.js';

type DisposeFn = () => void | Promise<void>;
type InitFn = () => void | Promise<void>;

/** Declares a dispose hook on a factory's return object — spread it into the returned object. */
export const onDispose = (fn: DisposeFn) => ({ [DISPOSE]: fn });

/** Declares an init hook on a factory's return object — spread it into the returned object. */
export const onInit = (fn: InitFn) => ({ [INIT]: fn });

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

/** Runs onDispose hooks of every component across the given layers, reverse of build order. */
export async function dispose(...layers: object[]): Promise<void> {
	for (const layer of layers.reverse()) {
		for (const value of walk(layer).reverse()) {
			if (typeof (value as any)[DISPOSE] === 'function') {
				await (value as any)[DISPOSE]();
			}
		}
	}
}

// Overload: single (possibly still-pending) layer — resolves and returns it, e.g.
// `const services = await init(createServices(config));`
export async function init<T extends object>(layer: T | Promise<T>): Promise<T>;
// Overload: multiple already-built layers, run in build order.
export async function init(...layers: object[]): Promise<void>;

/** Runs onInit hooks of every component across the given layers, in build order. */
export async function init(...layers: (object | Promise<object>)[]): Promise<any> {
	const resolved = await Promise.all(layers);
	for (const layer of resolved) {
		for (const value of walk(layer)) {
			if (typeof (value as any)[INIT] === 'function') {
				await (value as any)[INIT]();
			}
		}
	}
	return resolved.length === 1 ? resolved[0] : undefined;
}
