export const CAMEO_TYPES_LIST = [
	"none",
	"above",
	"below",
	"above+below",
	"student",
	"any",
	"invite-sl4",
	"invite-couple",
	"buy-in-2",
] as const;


export type CameoType = typeof CAMEO_TYPES_LIST[number];

export const CAMEO_TYPES = Object.fromEntries(
	CAMEO_TYPES_LIST.map(x => [x, `persona.social.cameo-type.${x}`])
);
