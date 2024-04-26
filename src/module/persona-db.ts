import { Tarot } from "./actor/persona-actor.js";
import { PersonaItem } from "./item/persona-item.js";
import { DBAccessor } from "./utility/db-accessor.js";
import { PersonaActor } from "./actor/persona-actor.js";
import { ModifierContainer } from "./item/persona-item.js";
import { Power } from "./item/persona-item.js";
import { BASIC_POWER_NAMES } from "../config/basic-powers.js";


class PersonaDatabase extends DBAccessor<PersonaActor, PersonaItem> {

	getClassById(id: string): Option<ItemSub<"characterClass">> {
		const item = this.getItemById(id);
		if (!item) return null;
		if (item.system.type == "characterClass") {
			return item as ItemSub<"characterClass">;
		}
		throw new Error("Id ${id} points towards invalid type");
	}

	getGlobalModifiers() : ModifierContainer [] {
		const items = this.getAllByType("Item") as PersonaItem[];
		const UMs = items.filter( x=> x.system.type == "universalModifier") as ModifierContainer[];
		return UMs;
	}

	allPowers() : Power[] {
		const items = this.allItems();
		return items
		.filter( x=> x.system.type == "power") as Power[];
	}

	getBasicPower( name: typeof BASIC_POWER_NAMES[number]) : Power | undefined {
		return PersonaDB.getItemByName(name) as Power | undefined;
	}

	tarotCards(): Tarot[] {
		const actors = this.allActors();
		return actors.filter( actor=> actor.system.type == "tarot") as Tarot[];
	}

}

export const PersonaDB = new PersonaDatabase();

//@ts-ignore
window.PersonaDB =PersonaDB;
