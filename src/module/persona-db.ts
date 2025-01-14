import { ModifierContainer } from "./item/persona-item.js";
import { SocialLink } from "./actor/persona-actor.js";
import { PC } from "./actor/persona-actor.js";
import { Weapon } from "./item/persona-item.js"
import { Shadow } from "./actor/persona-actor.js";
import { InvItem } from "./item/persona-item.js";
import { Consumable } from "./item/persona-item.js";
import { PersonaError } from "./persona-error.js";
import { Activity } from "./item/persona-item.js";
import { NPC } from "./actor/persona-actor.js";
import { UniversalModifier } from "./item/persona-item.js";
import { Job } from "./item/persona-item.js";
import { Tarot } from "./actor/persona-actor.js";
import { PersonaItem } from "./item/persona-item.js";
import { DBAccessor } from "./utility/db-accessor.js";
import { PersonaActor } from "./actor/persona-actor.js";
import { Power } from "./item/persona-item.js";
import { BASIC_PC_POWER_NAMES } from "../config/basic-powers.js";
import { BASIC_SHADOW_POWER_NAMES } from "../config/basic-powers.js";
import { SocialCard } from "./item/persona-item.js";


class PersonaDatabase extends DBAccessor<PersonaActor, PersonaItem> {

	#cache: PersonaDBCache;

	constructor() {
		super();
		this.#resetCache();
	}

	#resetCache() : PersonaDBCache {
		return this.#cache = {
			powers: undefined,
			shadows: undefined,
			socialLinks: undefined,
			treasureItems: undefined,
			tarot: undefined,
		};
	}

	override async onLoadPacks() {
		super.onLoadPacks();
		this.#resetCache();
	}

	onCreateActor(actor :PersonaActor) {
		this.#resetCache();
	}

	onCreateItem(item: PersonaItem) {
		this.#resetCache();
	}


	getClassById(id: string): Option<ItemSub<"characterClass">> {
		const item = this.getItemById(id);
		if (!item) return null;
		if (item.system.type == "characterClass") {
			return item as ItemSub<"characterClass">;
		}
		throw new Error("Id ${id} points towards invalid type");
	}

	getGlobalModifiers() : UniversalModifier [] {
		const items = this.getAllByType("Item") as PersonaItem[];
		const UMs = items.filter( x=> x.system.type == "universalModifier") as UniversalModifier[];
		return UMs.filter(um=> !um.system.room_effect);
	}

	getRoomModifiers() : UniversalModifier [] {
		const items = this.getAllByType("Item") as PersonaItem[];
		const UMs = items.filter( x=> x.system.type == "universalModifier") as UniversalModifier[];
		return UMs.filter(um=> um.system.room_effect);
	}

	allSocialLinks() : SocialLink[] {
		return this.allActors()
		.filter( actor=> actor.system.type == "pc" || actor.system.type == "npc") as SocialLink[];
	}

	allPowers() : Power[] {
		if (this.#cache.powers) return this.#cache.powers;
		const items = this.allItems();
		return this.#cache.powers = items
		.filter( x=> x.system.type == "power") as Power[];
	}

	getBasicPower( name: typeof BASIC_SHADOW_POWER_NAMES[number] | typeof BASIC_PC_POWER_NAMES[number]) : Power | undefined {
		const power = PersonaDB.getItemByName(name) as Power | undefined;
		if (!power)  {
			PersonaError.softFail(`Can't get basic power ${name}`);
		}
		return power;
	}

	shadows(): Shadow[] {
		if (this.#cache.shadows) return this.#cache.shadows;
		const actors = this.allActors();
		return this.#cache.shadows = actors
			.filter( act=> act.system.type == "shadow") as Shadow[];

	}

	tarotCards(): Tarot[] {
		if (this.#cache.tarot) return this.#cache.tarot;
		const actors = this.allActors();
		return this.#cache.tarot = actors
			.filter( actor=> actor.system.type == "tarot") as Tarot[];
	}

	treasureItems(): (Weapon | InvItem | Consumable)[] {
		if (this.#cache.treasureItems) return this.#cache.treasureItems;
		const items = this.allItems();
		return  this.#cache.treasureItems = items
			.filter ( item =>
			item.system.type == "weapon"
			|| item.system.type == "consumable"
			|| item.system.type == "item"
		) as (Weapon | InvItem | Consumable)[];
	}

	dungeonScenes(): Scene[] {
		return game.scenes.contents;
	}

	allSocialCards() :SocialCard[] {
		return this.allItems()
			.filter( x=> x.system.type == "socialCard") as SocialCard[];
	}

	allJobs(): Job[] {
		return this.allItems()
		.filter( x=> x.system.type == "job") as Job[];
	}

	allActivities(): Activity[] {
		return this.allItems()
		.filter( x=> x.system.type == "socialCard" && (x.system.cardType == "job" || x.system.cardType =="training" || x.system.cardType == "recovery" || x.system.cardType == "other") ) as Activity[];
	}

	personalSocialLink(): NPC {
		return this.getActorByName("Personal Social Link") as NPC;
	}

	teammateSocialLink(): NPC {
					return PersonaDB.getActorByName("Teammate Social Link") as NPC;
	}

	socialLinks(): (PC | NPC)[] {
		if (this.#cache.socialLinks) return this.#cache.socialLinks;
		return this.#cache.socialLinks = game.actors.filter( (actor :PersonaActor) =>
			(actor.system.type == "npc"
			|| actor.system.type == "pc" )
			&& !!actor.system.tarot
		) as (PC | NPC)[];
	}

	getPower(id: string) : Power | undefined {
		return this.getItemById(id) as Power | undefined;
	}

	navigatorModifiers(): ModifierContainer[] {
		return [];
	}

}

export const PersonaDB = new PersonaDatabase();

//@ts-ignore
window.PersonaDB =PersonaDB;

Hooks.on("createItem", (item: PersonaItem) => {
	PersonaDB.onCreateItem(item);

});

Hooks.on("createActor", (actor : PersonaActor) => {
	PersonaDB.onCreateActor(actor);
});

type PersonaDBCache =	{
	powers: Power[] | undefined,
	shadows: Shadow[] | undefined;
	socialLinks: (PC | NPC)[] | undefined;
	treasureItems: (Weapon | InvItem | Consumable)[] | undefined;
	tarot: Tarot[] | undefined;
};

