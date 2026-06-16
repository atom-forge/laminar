import { COMPONENT } from './symbols.js';

type AnyRecord = Record<string, unknown>;

function assemble<T extends AnyRecord>(
	defs: { [K in keyof T]: (...args: any[]) => T[K] },
	getArgs: (self: T) => unknown[],
): T {
	const items = {} as T;
	for (const key of Object.keys(defs) as Array<keyof T>) {
		const value = defs[key](...getArgs(items));
		if (value && typeof value === 'object') (value as any)[COMPONENT] = true;
		items[key] = value;
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
	(
		defs: LayerDefs<FactoryArgs, SelfT>,
		options?: {
			assemble?: (self: SelfT, ...args: FactoryArgs) => void;
		}
	) => (...outerArgs: OuterArgs) => SelfT,
];

/** Extracts the tuple form [OuterArgs, SelfT, FactoryArgs] from a LayerShape type. */
export type FromLayer<T extends Layer<any, any, any>> =
	T extends Layer<infer O, infer S, infer F> ? [O, S, F] : never;

/** Resolves the actual unit type a factory produces. */
export type Unit<T extends (...args: any[]) => any> = ReturnType<T>;

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
	const create = (defs: any, options?: { assemble?: (self: any, ...args: any[]) => void }) => (...outerArgs: any[]): any => {
		const layer = assemble(defs, (self) => resolver(outerArgs, self));
		if (options?.assemble) {
			const factoryArgs = resolver(outerArgs, layer);
			options.assemble(layer, ...factoryArgs);
		}
		return layer;
	};

	return [define, create];
}
