import { STUDENT_SKILLS_LIST } from "./student-skills.js";
export const MODIFIERLIST = [
	"maxhp",
	"allAtk",
	"wpnAtk",
	"magAtk",
	"wpnDmg",
	"wpnMult",
	"magDmg",
	"magLow",
	"magHigh",
	"criticalBoost",
	"allOutDmgMult", //adds to weapon multiplier on AoA
	"allDefenses",
	"ref",
	"fort",
	"will",
	...STUDENT_SKILLS_LIST,
	"save",
	"recovery",
	"maxhpMult",
	"critResist",
	"wpnDmg_low",
	"wpnDmg_high",
	"itemAtk",
	"disengage",
	"socialRoll",
	"weakestSlot",
	"pay",
	"extraMaxPowers",
	"initiative",
	"starting-energy",
	"energy-per-turn",
	"maxmp",
	"maxmpMult",
	"mpCostMult",
] as const;

export const MODIFIERS_TABLE = Object.fromEntries(
	MODIFIERLIST.map ( x=> [x, `persona.modifier.${x}`])
);

export type ModifierTarget = typeof MODIFIERLIST[number];

