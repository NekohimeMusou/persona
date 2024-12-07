export const CREATURE_TAG_LIST = [
	"neko",
	"cu",
	"fairy",
] as const;

export type CreatureTag = typeof CREATURE_TAG_LIST[number];

export const CREATURE_TAGS = Object.fromEntries(
	CREATURE_TAG_LIST.map(x=> [x, `persona.creatureType.${x}`])
);
