const BASIC_POWER_NAMES = [
	"Basic Attack",
	"All-out Attack",
] as const;

export const BASIC_PC_POWER_NAMES = [
	...BASIC_POWER_NAMES,
	"Defend",
] as const;

export const BASIC_SHADOW_POWER_NAMES = [
	...BASIC_POWER_NAMES,
	"Gather Power",
] as const;

