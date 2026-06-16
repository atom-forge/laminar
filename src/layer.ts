import { COMPONENT } from './symbols.js';
import { init } from './lifecycle.js';

type AnyRecord = Record<string, unknown>;

async function assemble<T extends AnyRecord>(
	defs: { [K in keyof T]: (...args: any[]) => T[K] | Promise<T[K]> },
	getArgs: (self: T) => unknown[],
): Promise<T> {
	const items = {} as T;
	for (const key of Object.keys(defs) as Array<keyof T>) {
		const value = await defs[key](...getArgs(items));
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
	[K in keyof SelfT]: (...args: FactoryArgs) => SelfT[K] | Promise<SelfT[K]>;
};

export type Layer<
	OuterArgs extends unknown[] = unknown[],
	SelfT extends AnyRecord = AnyRecord,
	FactoryArgs extends unknown[] = unknown[],
> = [
	<T>(factory: (...args: FactoryArgs) => T | Promise<T>) => (...args: FactoryArgs) => T | Promise<T>,
	(defs: LayerDefs<FactoryArgs, SelfT>) => (...outerArgs: OuterArgs) => Promise<SelfT>,
];

/** Extracts the tuple form [OuterArgs, SelfT, FactoryArgs] from a LayerShape type. */
export type FromLayer<T extends Layer<any, any, any>> =
	T extends Layer<infer O, infer S, infer F> ? [O, S, F] : never;

export type LayerOptions = {
	/** Skip the automatic init() run after assembly — call init(layer) manually when ready. */
	skipInit?: boolean;
};

// Overload: tuple form [OuterArgs, SelfT, FactoryArgs]
export function makeLayer<
	L extends [unknown[], AnyRecord, unknown[]],
>(resolver: (outerArgs: L[0], self: L[1]) => L[2], options?: LayerOptions): Layer<L[0], L[1], L[2]>;

// Overload: traditional 3 separate type params
export function makeLayer<
	OuterArgs extends unknown[],
	SelfT extends AnyRecord,
	FactoryArgs extends unknown[],
>(resolver: (outerArgs: OuterArgs, self: SelfT) => FactoryArgs, options?: LayerOptions): Layer<OuterArgs, SelfT, FactoryArgs>;

// Implementation
export function makeLayer(resolver: any, options: LayerOptions = {}): any {
	const define = <T>(factory: (...args: any[]) => T) => factory;
	const create = (defs: any) => async (...outerArgs: any[]): Promise<any> => {
		const layer = await assemble(defs, (self) => resolver(outerArgs, self));
		if (!options.skipInit) await init(layer);
		return layer;
	};

	return [define, create];
}
