/** Registry of values produced by Laminar factories. Kept in a WeakSet so results are never mutated. */
const components = new WeakSet<object>();

export function markComponent<T>(value: T): T {
	if (value !== null && (typeof value === 'object' || typeof value === 'function')) {
		components.add(value as object);
	}
	return value;
}

export function isComponent(value: unknown): value is object {
	return value !== null && (typeof value === 'object' || typeof value === 'function') && components.has(value as object);
}
