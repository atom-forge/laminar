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
