import { isComponent } from './component.js';
import { DISPOSE, INIT } from './symbols.js';

type DisposeFn = () => void | Promise<void>;
type InitFn = () => void | Promise<void>;

/** Declares a dispose hook on a factory's return object — spread it into the returned object. */
export const onDispose = (fn: DisposeFn) => ({ [DISPOSE]: fn });

/** Declares an init hook on a factory's return object — spread it into the returned object. */
export const onInit = (fn: InitFn) => ({ [INIT]: fn });

/** Collects every component reachable from `root` depth-first, parent before child, each at most once. */
function walk(root: object, seen = new Set<object>([root]), result: object[] = []): object[] {
	for (const key of Object.keys(root)) {
		const value = (root as any)[key];
		if (!isComponent(value) || seen.has(value)) continue;
		seen.add(value);
		result.push(value);
		walk(value, seen, result);
	}
	return result;
}

/**
 * Runs the `onInit` hooks of every component in the layer sequentially, depth-first, parent before child.
 * Stops at the first error.
 */
export async function init(layer: object): Promise<void> {
	for (const value of walk(layer)) {
		const hook = (value as any)[INIT];
		if (typeof hook === 'function') await hook();
	}
}

/**
 * Runs the `onDispose` hooks of every component in the layer sequentially, in the reverse order of `init`.
 * Every hook runs even if an earlier one fails; a single failure is rethrown as is,
 * several failures are thrown together as an `AggregateError`.
 */
export async function dispose(layer: object): Promise<void> {
	const errors: unknown[] = [];
	for (const value of walk(layer).reverse()) {
		const hook = (value as any)[DISPOSE];
		if (typeof hook !== 'function') continue;
		try {
			await hook();
		} catch (error) {
			errors.push(error);
		}
	}
	if (errors.length === 1) throw errors[0];
	if (errors.length > 1) throw new AggregateError(errors, `${errors.length} dispose hooks failed`);
}
