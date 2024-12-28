export const CONSQUENCELIST = [
	"none",
	"absorb",
	"modifier", //singular-mod
	"modifier-new", //multi-mod
	"damage-new",
	"addStatus",
	"removeStatus",
	"escalationManipulation",
	"extraAttack",
	"expend-slot",
	"half-hp-cost", //half hp cost of weapon skills
	"revive",
	"extraTurn",
	"expend-item",
	"add-power-to-list",
	"other-effect",
	"set-flag",
	"inspiration-cost",
	"display-msg",
	"scan",
	"social-card-action",
	"alter-energy",
	"dungeon-action",
	"raise-status-resistance",
	"raise-resistance",
	"lower-resistance",
	"use-power",
	"alter-mp",
	"save-slot", //deprecated, don't expend slot you normally would
	"recover-slot", // deprecated
	"add-escalation", // deprecated
	"dmg-low", //deprecated
	"dmg-high", //deprecated
	"dmg-allout-low", //deprecated
	"dmg-allout-high", //deprecated
	"dmg-mult", //deprecated
	"hp-loss", //deprecated
] as const;

export type ConsequenceType = typeof CONSQUENCELIST[number];

export  const MODIFIER_VARIABLE_LIST= [
	"escalationDie", //Escalation Die
	"tensionPool"
] as const;

export type ModifierVariable = typeof MODIFIER_VARIABLE_LIST[number];

export const MODIFIER_VARIABLES = Object.fromEntries(
	MODIFIER_VARIABLE_LIST.map( x=> [x, `persona.modifier-variable.${x}`])
);

export const CONSQUENCETYPES = Object.fromEntries(
CONSQUENCELIST.map( x=> [x, `persona.effecttypes.${x}`])
);

export const POWERTYPESLIST = [
	"weapon",
	"magic",
	"social-link",
	"other",
	"passive",
	"none",
	"standalone",
	"defensive",
	"downtime",
] as const;

export type PowerType = typeof POWERTYPESLIST[number];

export const POWERTYPES= Object.fromEntries( POWERTYPESLIST.map(x=> [x, `persona.power.types.${x}`]));

export const TARGETINGLIST = [
	"1-engaged",
	"1-nearby",
	"1-nearby-dead",
	"1-random-enemy",
	"1d4-random",
	"1d4-random-rep",
	"1d3-random",
	"1d3-random-rep",
	"self",
	"all-enemies",
	"all-allies",
	"all-dead-allies",
	"all-others",
	"everyone",
] as const;

export const TARGETING= Object.fromEntries( TARGETINGLIST.map(x=> [x, `persona.power.targets.${x}`]));

export const SHADOW_CHANGE_REQ_LIST_FULL= [
	"none",
	"always",
	"not-enhanced", //deprecated
	"charged-req",
	"supercharged",
	"supercharged-not-enhanced", //deprecated
	"amp-req",
	"amp-fulldep",
] as const;

export const SHADOW_CHANGE_REQ_LIST= [
	"none",
	"charged-req",
	"always",
	"amp-req",
	"supercharged",
	"amp-fulldep",
] as const;

export type ShadowChargeReq = typeof SHADOW_CHANGE_REQ_LIST[number];

export const SHADOW_CHARGE_REQ = Object.fromEntries( SHADOW_CHANGE_REQ_LIST.map( x=> [x, `persona.power.shadowcosts.${x}`]));

export const SOCIAL_CARD_ACTION_LIST = [
	"stop-execution",
	"exec-event",
	"inc-events",
	"gain-money",
	"modify-progress-tokens",
	"alter-student-skill",
	"modify-progress-tokens-cameo",
] as const;

export type SocialCardAction = typeof SOCIAL_CARD_ACTION_LIST[number];

export const SOCIAL_CARD_ACTIONS = Object.fromEntries(
	SOCIAL_CARD_ACTION_LIST.map( x=> [x, `persona.effecttypes.social-card.${x}`])
);

export const DUNGEON_ACTION_LIST = [
	"roll-tension-pool",
	"modify-tension-pool",
	"modify-clock",
	"close-all-doors",
] as const;


export type DungeonAction = typeof DUNGEON_ACTION_LIST[number];

export const DUNGEON_ACTIONS = Object.fromEntries(
	DUNGEON_ACTION_LIST.map(x => [x, `persona.effecttypes.dungeonAction.${x}`])
);

export const MODIFIER_CONS_TYPE_LIST =  [
	"constant",
	"system-variable",
] as const;


	export type ModifierConsType = typeof MODIFIER_CONS_TYPE_LIST[number];

export const MODIFIER_CONS_TYPES = Object.fromEntries( 
	MODIFIER_CONS_TYPE_LIST.map( x=> [x, `persona.effecttypes.modifierType.${x}`])
);

export const DAMAGE_SUBTYPE_LIST = [
	"high",
	"low",
	"allout-high",
	"allout-low",
	"constant",
	"multiplier",
	"percentage",
] as const;

export type DamageSubtype = typeof DAMAGE_SUBTYPE_LIST[number];


export const DAMAGE_SUBTYPES = Object.fromEntries(
	DAMAGE_SUBTYPE_LIST.map( x=> [x, `persona.damage-subtype.${x}`])
);

export const ALTER_MP_SUBTYPES_LIST = [
	"direct",
	"cost-reduction",
	"percent-of-total",
] as const;

export type AlterMPSubtype = typeof ALTER_MP_SUBTYPES_LIST[number];

export const ALTER_MP_SUBTYPES = Object.fromEntries(
	ALTER_MP_SUBTYPES_LIST.map( x=> [x, `persona.alter-mp-subtypes.${x}`])
);
