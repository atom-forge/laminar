import type { __internal__ } from './symbols.js';

type Internal<T> = T & { [__internal__]: true };

/** Marks a value as internal so it is omitted from the corresponding public interface view. */
export function internal<T>(value: T): Internal<T> {
	return value as Internal<T>;
}

/** Recursively derives the public surface of an object by removing properties marked as internal. */
export type PublicLayer<T> = {
	[K in keyof T as T[K] extends { [__internal__]: true } ? never : K]:
	T[K] extends (...args: any[]) => any
		? T[K]
		: PublicLayer<T[K]>
};
