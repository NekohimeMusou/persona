
interface Window {
	CONFIG : typeof CONFIG,
	foundry: typeof foundry,
		game: Game
}

declare const game : Game;

declare const foundry:   {
	abstract: FoundryAbstract;
	data: FoundryData;
}

declare const Hooks: Hooks;

declare const CONFIG : CONFIG;


declare interface CONFIG {
	Actor: {
		dataModels: Record<string, typeof foundry.abstract.DataModel>;
		documentClass: typeof Actor<T>;
	}
	Item: {
		dataModels: Record<string, typeof foundry.abstract.DataModel>;
		documentClass: typeof Item<T>;
	}

}


declare interface Game {
	actors: Collection<Actor<any, any>>;
	items: Collection<Item<any>>,
		packs: Collection<FoundryCompendium<any>>,
		users: Collection<FoundryUser>,
		system: FoundrySystem,
}


declare class Actors {
	static unregisterSheet<T>(scope: string, sheetClass: typeof ActorSheet<T>): void;
	static registerSheet<T>(scope: string, sheetClass: typeof ActorSheet<T>, details: {
		types: string[], makeDefault: boolean}) : void;
}

declare class Items {
	static unregisterSheet<T>(scope: string, sheetClass: typeof ItemSheet<T>): void;
	static registerSheet<T>(scope: string, sheetClass: typeof ItemSheet<T>, details: {
		types: string[], makeDefault: boolean}) : void;
}

declare interface Collection<T> {
	filter(fn: (T) => boolean) : T[];
	map(fn: (T) => boolean) : T[];
	[Symbol.iterator]() : Iterator<T>;
	get(id: string) : T | null;
	getName(name: string): T | null;

}

declare class FoundryCompendium<T extends object> {
	documentName: FoundryDocumentTypes;
	async getDocuments(): Promise<T[]>;
}

declare class FoundryUser extends FoundryDocument<never>{

}

type FoundryDocumentTypes = "Actor" | "Item" | "Scene";


interface FoundrySystem {
	id: string
}
