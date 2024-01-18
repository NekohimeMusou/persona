import { CClass } from "../item/persona-item.js";
import { ModifierTarget } from "../../config/item-modifiers.js";
import { StatusEffectId } from "../../config/status-effects.js";
import { DAMAGETYPESLIST } from "../../config/damage-types.js";
import { ResistStrength } from "../../config/damage-types.js";
import { StatusEffect } from "../combat/combat-result.js";
import { ModifierList } from "../combat/modifier-list.js";
import { Talent } from "../item/persona-item.js";
import { Focus } from "../item/persona-item.js";
import { ModifierContainer } from "../item/persona-item.js";
import { InvItem } from "../item/persona-item.js";
import { Weapon } from "../item/persona-item.js";
import { Power } from "../item/persona-item.js";
import { PersonaDB } from "../persona-db.js";
import { ACTORMODELS } from "../datamodel/actor-types.js"
import { PersonaItem } from "../item/persona-item.js"
import { PersonaAE } from "../active-effect.js";


declare global {
	type ActorSub<X extends PersonaActor["system"]["type"]> = Subtype<PersonaActor, X>;
}

export class PersonaActor extends Actor<typeof ACTORMODELS, PersonaItem, PersonaAE> {

	async createNewItem() {
		return (await this.createEmbeddedDocuments("Item", [{"name": "Unnamed Item", type: "item"}]))[0];
	}

	get inventory() : ItemSub<"weapon" | "item">[] {
		return this.items.filter( x=> x.system.type == "item" || x.system.type == "weapon") as ItemSub<"weapon" | "item">[];
	}

	get class() : Subtype<PersonaItem, "characterClass"> {
		let classNameDefault;
		switch (this.system.type) {
			case "pc":
				classNameDefault = "Persona User";
				break;
			case "shadow":
				classNameDefault = "Shadow";
				break;
			default:
				throw new Error("NPCs have no classes");
		}
		const id = this.system.combat.classData.classId;
		let cl = PersonaDB.getClassById(id);
		if (!cl) {
			const namesearch = PersonaDB.getItemByName(classNameDefault)
			if (!namesearch)
				throw new Error(`Couldn't find class id: ${id} or name: ${classNameDefault}`);
			if (namesearch.system.type != "characterClass")
			{
				throw new Error("Bad Item named: ${classNameDefault}, expecting a character class");
			}
			cl = namesearch as ItemSub<"characterClass">;
		}
		return cl;
	}

	set hp(newval: number) {
		this.update({"system.combat.hp": newval});
	}
	get hp(): number {
		if (this.system.type =="npc") return 0;
		return this.system.combat.hp;

	}

	get mhp() : number {
		if (this.system.type == "npc") return 0;
		try {
			const inc= this.hasIncremental("hp")? 1: 0;
			const lvl = this.system.combat.classData.level;
			const bonuses = this.getBonuses("maxhp");
			return this.class.getClassProperty(lvl + inc, "maxhp") + bonuses.total( {user: this as PC | Shadow});
		} catch (e) {
			console.warn(`Can't get Hp for ${this.name} (${this.id})`);
			return 0;
		}
	}

	hasIncremental(type: keyof Subtype<PersonaActor, "pc">["system"]["combat"]["classData"]["incremental"]) {
		switch (this.system.type) {
			case "pc": case "shadow":
				return this.system.combat.classData.incremental[type];
			default:
				throw new Error("Doesn't have incremental");
		}

	}

	getMaxSlotsAt(slot_lvl: number) : number {
		if (this.system.type != "pc") return 0;
		try {
			const inc =this.hasIncremental("slots") ? 1 : 0;
			const lvl = this.system.combat.classData.level;
			return this.class.getClassProperty(lvl + inc, "slots")[slot_lvl] ?? -999;

		} catch (e) {
			return -999;
		}
	}

	get powers(): Power[] {
		if (this.system.type =="npc") return [];
		try {
			const powerIds = this.system.combat.powers;
			let powers : Power[] = powerIds
				.flatMap( id => {
					const i = PersonaDB.getItemById(id) as Power;
					return i ? [i] : []
				});
			const basicAtk = PersonaItem.getBasicAttack();
			if (basicAtk) {
				powers = powers.concat([basicAtk]);
			}
			return powers;
		} catch(e) {
			console.error(e);
			return [];
		}
	}

	get weapon() : Option<Weapon> {
		if (this.system.type != "pc") {
			return null;
		}
		const id = this.system.equipped.weapon;
		const item = this.items.find( x=> x.id == id);
		if (item) return item as Weapon;
		const dbitem = PersonaDB.getItemById(id);
		if (dbitem) return dbitem as Weapon;
		return null;
	}

	talents() : Talent[] {
		if (this.system.type != "pc") return [];
		return this.system.talents.flatMap( ({talentId}) => {
			const tal= PersonaDB.getItemById(talentId);
			if (!tal) return [];
			if (tal.system.type != "talent") return [];
			return tal as Talent;
		});
	}

	focii(): Focus[] {
		if (this.system.type != "pc") return [];
		const fIds = this.system.combat.focuses;
		const focii = fIds.flatMap( id => {
			const focus = PersonaDB.getItemById(id);
			if (!focus) return [];
			if (focus.system.type != "focus") return [];
			return [focus as Focus];
		});
		return focii;
	}

	async modifyHP( this: Shadow | PC, delta: number) {
		let hp = this.system.combat.hp;
		hp += delta;
		await this.update( {"system.combat.hp": hp});
	}

	async addStatus({id, potency, duration}: StatusEffect): Promise<void> {
		const eff = this.effects.find( eff => eff.statuses.has(id));
		const stateData = CONFIG.statusEffects.find ( x=> x.id == id);
		if (!stateData) {
			throw new Error(`Couldn't find status effect Id: ${id}`);
		}
		if (!eff) {
			const s= new Set();
			s.add(id);
			const newState = {
				...stateData,
				statuses: s
			};
			const newEffect = (await  this.createEmbeddedDocuments("ActiveEffect", [newState]))[0] as PersonaAE;
			// const statuses= Array.from(s);
			// newEffect.update({statuses});
		} else  {

			//TODO: update the effect

		}

	}

	async removeStatus({id}: Pick<StatusEffect, "id">) : Promise<void>{
		this.effects
		.filter( eff => eff.statuses.has(id))
		.forEach( eff => eff.delete());
	}

	async expendSlot(this: PC,  slot: number, amount = 1) {
		if (slot < 0 && slot >= 4) return;
		const slots = this.system.slots;
		slots[slot as (0 | 1 | 2 | 3)] -= amount;
		await this.update( {"system.slots" : slots});
	}

	equippedItems() : (InvItem | Weapon)[]  {
		if (this.system.type != "pc") return [];
		const inv = this.inventory;
		const slots : (keyof typeof this.system.equipped)[]=  ["body", "accessory", "weapon_crystal"]
		const ret = slots
			.map( slot=> inv
				.find(item => item.id == (this as PC).system.equipped[slot]))
			.flatMap (x=> x? [x]: []);
		return ret as (InvItem | Weapon)[];
	}

	wpnDamage(this: PC | Shadow, multiplier_factored: boolean = true) : {low: number, high:number} {
		let basedmg: {low: number, high:number};
		if (this.system.type == "pc") {
			const wpn = this.weapon;
			if (!wpn) {
				ui.notifications.warn(`${this.name} doesn't have an equipped weapon`)
				return  {low: 1, high:2};
			}
			basedmg =  wpn.system.damage;
		} else {
			basedmg = this.system.combat.wpndmg;
		}
		if (!multiplier_factored)
			return basedmg;
		const mult =this.wpnMult();
		return {
			low: basedmg.low * mult,
			high: basedmg.high * mult,
		}
	}

	getBonuses (type : ModifierTarget): ModifierList {
		if (this.system.type != "pc")  return new ModifierList();
		const modifiers : ModifierContainer[] =[
			...this.equippedItems(),
			...this.focii(),
			...this.talents(),
		];
		const modList = new ModifierList( modifiers.flatMap( item => {
			return item.getModifier(type)
				.map( x=>
					({
						source: item,
						name: item.name,
						...x,
					})
				);
		}));
		return modList;
	}

	wpnAtkBonus(this: PC | Shadow) : ModifierList {
		const mods = new ModifierList();
		const lvl = this.system.combat.classData.level;
		const inc = this.system.combat.classData.incremental.atkbonus ? 1 : 0;
		const wpnAtk = this.system.combat.wpnatk;
		mods.add("Base Weapon Attack Bonus", wpnAtk);
		mods.add("Level Bonus", lvl + inc);
		const itemBonus = this.getBonuses("wpnAtk");
		return mods.concat(itemBonus);
	}

	magAtkBonus(this:PC | Shadow) : ModifierList {
		const mods = new ModifierList();
		const lvl = this.system.combat.classData.level;
		const magAtk = this.system.combat.magatk;
		const inc = this.system.combat.classData.incremental.atkbonus ? 1 : 0;
		mods.add("Base Magic Attack Bonus", magAtk);
		mods.add("Level Bonus", lvl + inc);
		const itemBonus = this.getBonuses("magAtk");
		return mods.concat(itemBonus);
	}

	getDefense(this: PC | Shadow,  type : keyof PC["system"]["combat"]["defenses"]) : ModifierList {
		const mods = new ModifierList();
		const lvl = this.system.combat.classData.level;
		const baseDef = this.system.combat.defenses.ref;
		const inc = this.system.combat.classData.incremental.defbonus ? 1 : 0;
		mods.add("Base", 10);
		mods.add("Base Defense Bonus", baseDef);
		mods.add("Level Bonus", lvl + inc);
		const itemBonus = this.getBonuses("ref");
		return mods.concat(itemBonus);
	}

	elementalResist(this: PC | Shadow, type: typeof DAMAGETYPESLIST[number]) : ResistStrength  {
		switch (type) {
			case "untyped":  case "none":
				return "normal";
			case "healing":
				return "absorb";
		}
		return this.system.combat.resists[type] ?? "normal";
	}

	wpnMult( this: PC | Shadow) : number {
		const lvl = this.system.combat.classData.level;
		const inc = this.system.combat.classData.incremental.wpn_mult ? 1 : 0;
		const mult = this.class.getClassProperty(lvl + inc, "wpn_mult") ?? 0;
		return mult;

	}

	magDmg (this: PC | Shadow) : {low: number, high:number} {
		const lvl = this.system.combat.classData.level;
		const inc = this.system.combat.classData.incremental.mag_dmg ? 1 : 0;
		const magDmg = this.class.getClassProperty(lvl + inc, "magic_damage") ?? 0;
		return magDmg ;
	}

	critBoost(this: PC | Shadow) : ModifierList {
		const itemBonus = this.getBonuses("ref");
		return itemBonus; //placeholder
	}

	async addTalent(this: PC | Shadow, talent: Talent) {
		const talents = this.system.talents;
		if (talents.find(x => x.talentId == talent.id)) return;
		talents.push( {
			talentLevel: 0,
			talentId: talent.id
		});
		await this.update( {"system.talents": talents});
	}

	async addPower(this: PC | Shadow, power: Power) {
		const powers = this.system.combat.powers;
		if (powers.includes(power.id)) return;
		powers.push(power.id);
		await this.update( {"system.combat.powers": powers});
	}

	async addFocus(this: PC | Shadow, focus: Focus) {
		const foci = this.system.combat.focuses;
		if (foci.includes(focus.id)) return;
		foci.push(focus.id);
		await this.update( {"system.combat.focuses": foci});
	}

	async  setClass(this: PC | Shadow, cClass: CClass) {
		await this.update( {"this.system.combat.classData.classId": cClass.id});


	}

}

export type PC = Subtype<PersonaActor, "pc">;
export type Shadow = Subtype<PersonaActor, "shadow">;
export type NPC = Subtype<PersonaActor, "npc">;
