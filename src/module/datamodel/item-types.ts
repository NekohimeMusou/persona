const {StringField:txt, BooleanField: bool, ObjectField:obj, NumberField: num, SchemaField: sch, HTMLField: html , ArrayField: arr, DocumentIdField: id } = foundry.data.fields;

import { AVAILABILITY_LIST } from "../../config/availability-types.js";
import { STUDENT_SKILLS_LIST } from "../../config/student-skills.js";
import { CharacterClassDM } from "./character-class-dm.js";
import { UsablePowerProps } from "./power-dm.js";
import { powerCost } from "./power-dm.js";
import { powerSpecific } from "./power-dm.js";
import { damage } from "./power-dm.js";
import { EQUIP_SLOTS_LIST } from "../../config/equip-slots.js";
import { effects } from "./power-dm.js";

function itemBase() {
	return {
		itemCost: new num({ integer: true, min:0, initial: 0}),
		desciption: new html(),
		amount: new num({ integer: true, initial: 1, min: 0}),
		price: new num({ integer: true, initial: 0, min:0}),
	};
}



 class Weapon extends foundry.abstract.DataModel {
	get type() { return "weapon" as const;}
	static override defineSchema() {
		const ret = {
			...itemBase(),
			damage: damage(),
			...effects (false),
		};
		return ret;
	}
}

 class Focus extends foundry.abstract.DataModel {
	get type() { return "focus" as const;}
	static override defineSchema() {
		const ret = {
			description: new txt(),
			...effects (false),
		}
		return ret;
	}
}

 class UniversalModifier extends foundry.abstract.DataModel {
	get type() { return "universalModifier" as const;}
	static override defineSchema() {
		const ret = {
			description: new html(),
			...effects (false),
		}
		return ret;
	}
}

 class Power extends foundry.abstract.DataModel {
	get type() {return "power" as const;}
	static override defineSchema() {
		const ret = {
			...powerSpecific(),
			...powerCost(),
			...UsablePowerProps(),
			...effects(true),
		};
		return ret;
	}
}

 class Consumable extends foundry.abstract.DataModel {
	get type() {return "consumable" as const;}
	static override defineSchema() {
		const ret = {
			subtype: new txt({ initial: "consumable", choices: ["consumable"]}),
			...itemBase(),
			...UsablePowerProps(),
			...effects(true),
		};
		return ret;
	}
}


 class Talent extends foundry.abstract.DataModel {
	get type() { return "talent" as const;}
	static override defineSchema() {
		const ret = {
			desciption: new html(),
			...effects(false),
		}
		return ret;
	}
}


 class InventoryItemSchema extends foundry.abstract.DataModel {
	get type() { return "item" as const;}
	static override defineSchema() {
		const ret = {
			...itemBase(),
			slot: new txt<typeof EQUIP_SLOTS_LIST[number]>({choices: EQUIP_SLOTS_LIST}),
			...effects(false),
		}
		return ret;
	}
}

class JobItemSchema extends foundry.abstract.DataModel {
	get type() { return "job" as const;}
	static override defineSchema() {
		const ret = {
			keyskill: new sch({
				primary: new txt( {choices: STUDENT_SKILLS_LIST, initial: "diligence"}),
				secondary: new txt( {choices: STUDENT_SKILLS_LIST, initial: "diligence"}),
			}),
			pay:new sch( {
				high: new num({initial: 0, min: 0, integer:true, max: 20}),
				low: new num({initial: 0, min: 0, integer:true, max: 20}),
			}),
			perk: new txt(),
			active: new bool({initial: false}),
			availability: new txt({choices: AVAILABILITY_LIST, initial: "-"}),
		}
		return ret;
	}



}

export const ITEMMODELS = {
	consumable: Consumable,
	item: InventoryItemSchema,
	power: Power,
	characterClass: CharacterClassDM,
	focus: Focus,
	talent: Talent,
	weapon: Weapon,
	universalModifier: UniversalModifier,
	job: JobItemSchema,
} as const;


//testing the types, purely for debug purposes
type CClass = SystemDataObjectFromDM<typeof CharacterClassDM>;
type PowerSO= SystemDataObjectFromDM<typeof Power>;

