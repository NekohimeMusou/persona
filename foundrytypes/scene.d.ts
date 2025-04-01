namespace Foundry {
	interface SceneConstructor extends DocumentConstructor {
		new(...args: unknown[]): Scene;
	}


	// class Scene extends FoundryDocument<never> {
	interface Scene extends Document<never> {
		tokens: Collection<TokenDocument<Actor<any>>>;
		dimensions: {distance:number};
		walls: Collection<WallDocument>;
		regions: Collection<RegionDocument>;
		weather: keyof CONFIG["weatherEffects"];
	}

	interface WallDocumentConstructor extends DocumentConstructor {
		new(...args: unknown[]): WallDocument;
	}

	// class WallDocument extends FoundryDocument {
	interface WallDocument extends Document<never> {
		//** 0, not a doort, 1 regular, 2 secret
		door: number;
		//** doorstate 0 closed, 1 open
		ds: number;

		doorSound: string;
		dir: number;
		c: number[];
	}

	interface RegionDocumentConstructor  extends DocumentConstructor {
		new(...args: unknown[]): RegionDocument;
	}

	// declare class RegionDocument extends DocumentConstructor {
	interface RegionDocument extends Document<never> {
		parent: Scene;
		get tokens(): Set<TokenDocument<Actor<any>>>;
	}

}
declare const Scene: Foundry.SceneConstructor;
type Scene = Foundry.Scene;

declare const WallDocument: Foundry.WallDocumentConstructor;
type WallDocument = Foundry.WallDocument;


declare const RegionDocument: Foundry.RegionDocumentConstructor;
	type RegionDocument = Foundry.RegionDocument;


