declare const __internal__: unique symbol;
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


// --- Core ---

type AnyRecord = Record<string, unknown>;

function assemble<T extends AnyRecord>(
	defs: { [K in keyof T]: (...args: any[]) => T[K] },
	getArgs: (self: T) => unknown[],
): T {
	const items = {} as T;
	for (const key of Object.keys(defs) as Array<keyof T>) {
		items[key] = defs[key](...getArgs(items));
	}
	return items;
}


// --- Generic layer primitive ---
//
// OuterArgs   = args the resulting creator function will accept
// SelfT       = the container type being built (= creator's return type)
// FactoryArgs = args every individual factory inside the layer receives
//
// resolver(outerArgs, self) maps those two runtime inputs to the factory arg tuple.
// Pass `_self` and omit it from the returned tuple for non-self-referential layers.
//
// Adding a new layer is just a 3-line wrapper — see the pre-built helpers below.

type LayerDefs<FactoryArgs extends unknown[], SelfT extends AnyRecord> = {
	[K in keyof SelfT]: (...args: FactoryArgs) => SelfT[K];
};

export type Layer<
	OuterArgs extends unknown[] = unknown[],
	SelfT extends AnyRecord = AnyRecord,
	FactoryArgs extends unknown[] = unknown[],
> = [
	<T>(factory: (...args: FactoryArgs) => T) => (...args: FactoryArgs) => T,
	(defs: LayerDefs<FactoryArgs, SelfT>) => (...outerArgs: OuterArgs) => SelfT,
];

/** Extracts the tuple form [OuterArgs, SelfT, FactoryArgs] from a LayerShape type. */
export type FromLayer<T extends Layer<any, any, any>> =
	T extends Layer<infer O, infer S, infer F> ? [O, S, F] : never;

// Overload: tuple form [OuterArgs, SelfT, FactoryArgs]
export function makeLayer<
	L extends [unknown[], AnyRecord, unknown[]],
>(resolver: (outerArgs: L[0], self: L[1]) => L[2]): Layer<L[0], L[1], L[2]>;

// Overload: traditional 3 separate type params
export function makeLayer<
	OuterArgs extends unknown[],
	SelfT extends AnyRecord,
	FactoryArgs extends unknown[],
>(resolver: (outerArgs: OuterArgs, self: SelfT) => FactoryArgs): Layer<OuterArgs, SelfT, FactoryArgs>;

// Implementation
export function makeLayer(resolver: any): any {
	const define = <T>(factory: (...args: any[]) => T) => factory;
	const create = (defs: any) => (...outerArgs: any[]): any =>
		assemble(defs, (self) => resolver(outerArgs, self));
	return [define, create];
}
