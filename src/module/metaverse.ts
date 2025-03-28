import { sleep } from "./utility/async-wait.js";
import { Helpers } from "./utility/helpers.js";
import { PersonaSockets } from "./persona.js";
import { weightedChoice } from "./utility/array-tools.js";
import { PersonaItem } from "./item/persona-item.js";
import { SkillCard } from "./item/persona-item.js";
import { ValidAttackers } from "./combat/persona-combat.js";
import { Situation } from "./preconditions.js";
import { ModifierList } from "./combat/modifier-list.js";
import { SearchMenu } from "./exploration/searchMenu.js";
import { PersonaRegion } from "./region/persona-region.js";
import { Weapon } from "./item/persona-item.js";
import { ProgressClock } from "./utility/progress-clock.js";
import { DungeonActionConsequence } from "../config/consequence-types.js";
import { shuffle } from "./utility/array-tools.js";
import { InvItem } from "./item/persona-item.js";
import { Consumable } from "./item/persona-item.js";
import { PersonaDB } from "./persona-db.js";
import { PersonaError } from "./persona-error.js";
import { TensionPool } from "./exploration/tension-pool.js";
import { Shadow } from "./actor/persona-actor.js";
import { PersonaCombat } from "./combat/persona-combat.js";
import { Logger } from "./utility/logger.js";
import { PC } from "./actor/persona-actor.js";
import { PersonaActor } from "./actor/persona-actor.js";
import { PersonaSettings } from "../config/persona-settings.js";
import { NPCAlly } from "./actor/persona-actor.js";
import { PersonaScene } from "./persona-scene.js";

export class Metaverse {
	static lastCrunch : number = 0;

	static isEnhanced() : boolean {
		return PersonaSettings.isMetaverseEnhanced(); //placeholder
	}

	static async enterMetaverse() {
		if (!game.user.isGM) return;
		(game.actors as Collection<PersonaActor>)
			.filter( (x: PersonaActor)=> (x.system.type == "pc" && x.tarot != undefined) || x.system.type == "npcAlly")
			.forEach( (pc: PC | NPCAlly)=> pc.onEnterMetaverse());
		(game.scenes.contents as PersonaScene[])
			.forEach( sc => sc.onEnterMetaverse());
		await TensionPool.clear();
		Hooks.callAll("enterMetaverse");
		await Logger.sendToChat(`Entering Metaverse...`);
	}

	static async exitMetaverse() {
		(game.actors as Collection<PersonaActor>)
			.filter( (x: PersonaActor)=> (x.system.type == "pc" && x.tarot != undefined) || x.system.type == "npcAlly")
			.forEach( (x: PC | NPCAlly) => x.onExitMetaverse());
		const promises = game.scenes.contents.map(sc => (sc as PersonaScene).onExitMetaverse());
		await Promise.allSettled(promises);
		await TensionPool.clear();
		Hooks.callAll("exitMetaverse");
		await Logger.sendToChat(`Exiting Metaverse...`);
	}

	static weightedTest2() {
		const map = new Map<Shadow["name"], number>();
		const encounterList = this.getEncounterList(game.scenes.current as PersonaScene, "shadow");
		const weightedList = this.weightedEncounterList(encounterList);
		for (let tries =0; tries< 5000; tries++) {
			const shadow = weightedChoice(weightedList);
			if (!shadow) {
				console.warn("No choice was selected")
				continue;
			}
			const current = map.get(shadow.name) ?? 0;
			map.set(shadow.name, current +1);
		}
		return this.#averageMap(map);
	}

	static weightedTest() {
		const map = new Map<Shadow["name"], number>();
		for (let tries =0; tries< 1000; tries++) {
			const encounter = this.generateEncounter("shadow");
			for (const shadow of encounter) {
				const current = map.get(shadow.name) ?? 0;
				map.set(shadow.name, current +1);
			}
		}
		return this.#averageMap(map);
	}

	static #averageMap(map: Map<string, number>) : string[] {
		let total = 0;
		let ret = [] as string[];
		for (const [_data, amt] of map.entries()) {
			total += amt;
		}
		const sorted = Array.from(map.entries()).sort( (a,b) => b[1] - a[1]);
		for (const [data, amt] of sorted) {
			const avg = Math.round(amt/total * 100)/100;
			ret.push( `${data}: ${avg}`);
		}
		return ret;
	}

	static weightedEncounterList(arr: Shadow[], scene: PersonaScene = game.scenes.current as PersonaScene) {
		return arr
			.map (shadow => ({
				item: shadow,
				weight: shadow.getEncounterWeight(scene) ?? 1,
			}));
	}

	static getEncounterList(scene: PersonaScene, shadowType ?: Shadow["system"]["creatureType"]): Shadow[] {
		return scene.encounterList()
			.filter( shadow => shadowType ? shadow.system.creatureType == shadowType : true);
}

static #getEncounterSize(sizeMod = 0) : number {
		let encounterSize = sizeMod;
		const sizeRoll = Math.floor((Math.random() * 10) +1);
		switch (sizeRoll) {
			case 1:
				encounterSize += 3;
				break;
			case 9: case 10:
				encounterSize += 5;
				break;
			default:
				if (sizeRoll > 10) {
					PersonaError.softFail(`Encounter number is ${sizeRoll}`);
				}
				encounterSize += 4;
				break;
		}
	return encounterSize;
}

static choosePick (pick1: Shadow | undefined, pick2: Shadow | undefined, encounterList: Shadow[]): Shadow | undefined {
	if (!pick1 || !pick2) {
		PersonaError.softFail("Couldn't get a pick from choice list");
		return undefined;
	}
	if (Math.random() < .4) return pick1; //favor weights less heavily
	const p1score = encounterList
		.reduce ( (acc, shadow) => acc + shadow.complementRating(pick1), 0);
	const p2score = encounterList
		.reduce ( (acc, shadow) => acc + shadow.complementRating(pick2), 0);
	const pick = p2score < p1score ? pick1 : pick2;
	return pick;
}

	static generateEncounter(shadowType ?: Shadow["system"]["creatureType"], sizeMod = 0): Shadow[] {
		const scene = game.scenes.current as PersonaScene;
		const encounterList  = this.getEncounterList(scene, shadowType);
		const weightedList = this.weightedEncounterList(encounterList, scene);
		if (encounterList.length == 0) {
			PersonaError.softFail(`Encounter List is empty for ${scene.name} ${shadowType ? "(" + shadowType+ ")"  :""}`);
			return [];
		}
		let enemyType : Shadow["system"]["creatureType"] | undefined = undefined;
		const encounter : Shadow[] = [];
		let bailout = 0;
		let encounterSize = this.#getEncounterSize(sizeMod);
		while (encounterSize > 0) {
			if (bailout > 200) {
				PersonaError.softFail(`Had to bail out, couldn't find match for ${scene.name}`);
				return [];
			}
			if (bailout == 20) {
				ui.notifications.warn("Over 20 fail attempts getting random encounter");
			}
			const pick1 = weightedChoice(weightedList);
			const pick2 = weightedChoice(weightedList);
			const pick  = this.choosePick(pick1, pick2, encounterList);
			if (!pick) {
				continue;
			}
			if (enemyType == undefined) {
				enemyType = pick.system.creatureType;
			}
			if (pick.system.creatureType != enemyType) {
				bailout++; //escape hatch for if it keeps screwing up
				continue;
			}
			const sizeVal = pick.encounterSizeValue();
			if (Math.max(1, encounterSize) < sizeVal) {
				bailout++;
				continue;
			}
			encounterSize -= sizeVal;
			encounter.push(pick);
		}
		encounter.sort( (a,b) => a.name.localeCompare(b.name));
		return encounter;
	}

	static async printRandomEncounterList(encounter: Shadow[]) {
		const speaker = ChatMessage.getSpeaker({alias: "Encounter Generator"});
		const enchtml = encounter.map( shadow =>
			`<li class="shadow"> ${shadow.name} </div>`
		).join("");
		const text = `
		<ul class="enc-list">
		${enchtml}
		</ul>
		`;
		let messageData = {
			speaker: speaker,
			content: text,
			whisper: game.users.filter(usr => usr.isGM),
			style: CONST.CHAT_MESSAGE_STYLES.WHISPER,
		};
		await ChatMessage.create(messageData, {});
	}

	/** for use by macro */
	static async randomEncounter() {
		const encounter = Metaverse.generateEncounter();
		await Metaverse.printRandomEncounterList(encounter);
	}


	static getXPFor(shadow: Shadow, partyLevel: number): number {
		const levelDiff = partyLevel - shadow.system.combat.classData.level;
		let levelMult = 1;
		switch (true) {
			case (levelDiff == 1): levelMult = 0.25; break;
			case (levelDiff > 1): levelMult = 0.05; break;
			case (levelDiff < 0): levelMult = 2; break;
			case (levelDiff == 0): levelMult =  1;break;
			default: levelMult = 1;
		}
		const XPValue = shadow.XPValue();
		return levelMult * XPValue;
	}

	static async awardXP(shadows: Shadow[], party: (PC | NPCAlly)[]) : Promise<void> {
		if (party.length == 0) return;
		const partyLvl = Math.max(...party.map(x=> x.system.combat.classData.level));
		const totalXP = shadows.reduce( (acc,shadow) => {
			const xp = this.getXPFor(shadow, partyLvl) ;
			return acc + xp;
		}, 0);
		const individualXP = Math.floor( totalXP / party.length);
		const levelUps : ValidAttackers[] = [];
		for (const character of party)  {
			if(await character.awardXP(individualXP)) {
				levelUps.push(character);
			}
		}
		const levelUpsStr = levelUps.map( x=> x.name).join(", ");
		let text = `
	<div>XP Awarded: ${individualXP}</div> `;
		if (levelUpsStr.length > 0) {
			text += `<div> Level Ups: ${levelUpsStr} </div>`;
		}
		await ChatMessage.create({
			speaker: {
				alias: "XP Award",
			},
			content: text ,
			rolls: [],
			style: CONST.CHAT_MESSAGE_STYLES.OOC,
		});
	}

	static async generateTreasure(shadows: PersonaActor[]): Promise<Treasure> {
		let items : TreasureItem[] = [];
		let money = 0;
		const considerSkillCard = async function (powerId: string, prob: number) {
			if (!powerId) return;
			if (Math.random() > (prob ?? 0) / 100) {return;}
			const existingCard = PersonaDB.skillCards().find( x=> x.system.skillId  ==  powerId);
			if (existingCard) {
				items.push(existingCard);
				return;
			}
			const power = PersonaDB.allPowers().find( x=> x.id == powerId);
			if (!power) {
				PersonaError.softFail(`Can't fiund Power Id ${power} for treasure`);
				return;
			}
			const msg = `Skill Card created for ${power.name}`;
			ui.notifications.notify(msg);
			console.log(msg);
			const newCard = await PersonaItem.createSkillCardFromPower(power);
			items.push(newCard);
		};
		const considerItem = function (itemId: string, prob: number) {
			const item = PersonaDB.treasureItems().find(x=> x.id == itemId);
			if (!item) {return;}
			if (Math.random() > (prob ?? 0) / 100) {return;}
			items.push(item);
		};
		for (const shadow of shadows) {
			if (shadow.system.type != "shadow") { continue;}
			const treasure = shadow.system.encounter.treasure;
			const moneyLow = treasure.moneyLow ?? 0;
			const moneyHigh = treasure.moneyHigh ?? 0;
			const variability = moneyHigh - moneyLow;
			if (variability >= 0) {
				const bonus = Math.floor(Math.random() * (variability +1));
				money += Math.floor(moneyLow + bonus);
			}
			considerItem(treasure.item0, treasure.item0prob);
			considerItem(treasure.item1, treasure.item1prob);
			considerItem(treasure.item2, treasure.item2prob);
			await considerSkillCard(treasure.cardPowerId, treasure.cardProb);
		}
		const treasure : Treasure = {
			money,
			items
		};
		return treasure;
	}

	static async printTreasure(treasure : Treasure) {
		const {money, items} = treasure;
		const speaker = ChatMessage.getSpeaker({alias: "Treasure Generator"});
		const treasureListHTML = items
			.map( item => `<li> ${item.displayedName} </li>`)
			.join("");
		const text = `
		<b>Money:</b> ${money} <br>
		<ul class="treasure-list">
		${treasureListHTML}
		</ul>
		`;
		let messageData = {
			speaker: speaker,
			content: text,
			whisper: game.users.filter(usr => usr.isGM),
			style: CONST.CHAT_MESSAGE_STYLES.WHISPER,
		};
		await ChatMessage.create(messageData, {});
	}

	static async distributeMoney(money: number, players: PersonaActor[]) {
		if (players.length > 0) {
			const moneyShare = Math.floor(money / players.length)
			const shareDist =
				players.map( x=> ({
					pc: x,
					share: moneyShare
				}));
			shuffle(shareDist);
			let moneyOverflow = money - (moneyShare * players.length);
			for (const entry of shareDist) {
				if (moneyOverflow > 0) {
					entry.share += 1;
					moneyOverflow--;
				}
				if (entry.pc.system.type == "pc") {
					await (entry.pc as PC).gainMoney(entry.share, true);
				}
			}
		}
	}

	static async executeDungeonAction( action: DungeonActionConsequence) : Promise<void> {
		switch (action.dungeonAction) {
			case "roll-tension-pool":
				await TensionPool
					.rollAuto();
				break;
			case "modify-tension-pool":
				await TensionPool.add(action.amount);
				break;
			case "modify-clock": {
				const clock = ProgressClock.getClock(action.clockId);
				if (!clock) {
					PersonaError.softFail(`Can't find clock id ${action.clockId}`);
					return;
				}
				await clock.add(action.amount);
			}
				break;
			case "close-all-doors":
				await this.closeAllDoors();
				break;
			case "change-scene-weather":
				await (game.scenes.active as PersonaScene).changeWeather(action.sceneWeatherType);
				break;
			case "set-clock": {
				const clock = ProgressClock.getClock(action.clockId);
				if (!clock) {
					PersonaError.softFail(`Can't find clock id ${action.clockId}`);
					return;
				}
				await clock.set(action.amount);
				break;
			}
			default:
				action satisfies never;
		}
	}

	static async closeAllDoors() {
		const scene = game.scenes.current;
		const openDoors = scene.walls
			.filter(w=> w.door > 0 && w.ds == 1);
		for (const door of openDoors) {
			door.update( {ds: 0});
		}
	}

	static async searchRoom() {
		const region = this.getRegion();
		if (!region) {
			throw new PersonaError("Can't find region");
		}
		if (region.isSafe) {
			throw new PersonaError("Room is safe can't be searched");
		}
		await this.searchRegion(region);
	}

	static async searchRegion(region: PersonaRegion) {
		const data = region.regionData;
		const searchOptions :typeof SearchMenu["options"] = {
			treasureRemaining: region.treasuresRemaining,
			stopOnHazard: data.specialMods.includes("stop-on-hazard"),
			isHazard: data.hazard != "none" && data.hazard != "found",
			isSecret: data.secret != "none" && data.secret != "found",
			incTension: data.specialMods.includes("no-tension-increase") ? 0 : 1,
			hazardOnTwo: data.specialMods.includes("hazard-on-2"),
			cycle: false,
			treasureFindBonus: 0,
		};
		const results = await SearchMenu.start(searchOptions, region);
		let treasureRolls : Roll[] = [];
		for (const resultSet of results) {
			for (const result of resultSet.results) {
				switch (result.result) {
					case "nothing":
						break;
					case "treasure":
						if (!result.roll) {
							PersonaError.softFail("Treasure Found but no roll given");
							break;
						}
						const treasureRoll = await region.treasureFound(result.roll)
						if (treasureRoll) {
							treasureRolls.push(treasureRoll);
						}
						break;
					case "hazard":
						await region.hazardFound();
						break;
					case "secret":
						await region.secretFound();
						break;
					case "other":
					case "disconnected":
						break;
					default:
						result.result satisfies undefined;
				}
			}
		}
		if (treasureRolls.length) {
			await this.handleTreasureRolls(treasureRolls);
		}
	}

	static async handleTreasureRolls( rolls: Roll[]) {
		let html = `<h2> Treasure Rolls </h2>`;
		const rollstring = rolls.map( r => `<li>${r.formula} (${r.total})</li>`).join("");
		html += `<ul> ${rollstring} </ul>`;
		html = `<div class="treasure-rolls"> ${html} </div>`;
		return await ChatMessage.create({
			speaker: {
				alias: "Treasure Rolls"
			},
			content: html,
			rolls,
			style: CONST.CHAT_MESSAGE_STYLES.OOC,
		});
	}

	static getRegion() : PersonaRegion | undefined {
		if (game.user.isGM) {
			const id = PersonaSettings.get("lastRegionExplored");
			const region = game.scenes.current.regions.find( (r: PersonaRegion) => r.id == id && !r?.regionData?.ignore);
			if (!region) {
				return undefined;
			}
			return region as PersonaRegion;
		}
		const actor = game.user.character;
		if (!actor) {
			throw new PersonaError("No controlled Character");
		}
		let region = game.scenes.current.regions.find( (region : PersonaRegion) => {
			if (region?.regionData?.ignore) return false;
			const arr = Array.from(region.tokens);
			return arr.some( tok => tok.actor?.id == actor.id)
		});
		if (!region) {
			//Search for party token
			region = game.scenes.current.regions.find(
				(region : PersonaRegion) => {
					if (region?.regionData?.ignore) return false;
					const arr = Array.from(region.tokens);
					return arr.some(token => token.actor?.isOwner);
				});
			if (!region) {
				return undefined;
			}
		}
		if ((region as PersonaRegion)?.regionData?.ignore == true) {
			throw new PersonaError("Region is ignore!");

		}
		return region as PersonaRegion;
	}

	static async presenceCheck(region ?: PersonaRegion, situation ?: Situation, modifier = 0) : Promise<PresenceCheckResult> {
		if (!region) {
			region = this.getRegion();
			if (!region) return null;
		}
		if  (!situation) {
			situation = {
				trigger: "on-presence-check",
				triggeringRegionId : region.id,
				triggeringUser: game.user,
			};
		}
		const sModifiers = new ModifierList(
			PersonaDB.getGlobalModifiers()
			.concat(region.roomEffects)
			.flatMap(x=> x.getModifier("shadowPresence", null))
		);
		const sPresence = region.shadowPresence + sModifiers.total(situation);
		if (sPresence > 0) {
			if( await this.#shadowPresenceRoll(sPresence + modifier, this.name) == true) {
				return "shadows";
			}
		}
		const cModifiers = new ModifierList(
			PersonaDB.getGlobalModifiers()
			.concat(region.roomEffects)
			.flatMap(x=> x.getModifier("concordiaPresence", null))
		);
		const cPresence = region.concordiaPresence + cModifiers.total(situation);
		if (cPresence > 0) {
			if ( await this.#concordiaPresenceRoll(cPresence + modifier, this.name) == true)  {
				return "daemons";
			}
		}
		return null;
	}


	static async #concordiaPresenceRoll( presenceValue: number, regionName: string = ""): Promise<boolean> {
		return await this.#presenceRoll({
			presenceValue,
			regionName,
			label: "Concordia Presence",
			rollString: "1d6",
			atkText: "Daemons Attack!",
		});
	}

	static async #shadowPresenceRoll ( presenceValue:number, regionName: string = ""): Promise<boolean> {
		return await this.#presenceRoll({
			presenceValue,
			regionName,
			label: "Shadow Presence",
			rollString: "1d10",
			atkText: "Shadows Attack!",
		});
	}

	static async #presenceRoll (data: PresenceRollData) : Promise<boolean> {
		const roll = new Roll(data.rollString);
		await roll.roll();
		const isEncounter = roll.total <= data.presenceValue;
		let html = `<h2> ${data.label} (${data.regionName})</h2>`;
		html += `<div> Roll vs ${data.label} ${data.presenceValue}: ${roll.total} </div>`;
		const result = isEncounter ? data.atkText ?? `Danger`: data.safeText ?? `Safe`;
		html += `<div class="action-result">${result}</div>`;
		if (isEncounter) {
			html += `<br><hr><div>Will you?</div>`
			html += `<ul> <li> fight</li><li> evade </li><li> try to sneak past</li></ul> `;
		}
		await ChatMessage.create({
			speaker: {
				alias: data.label
			},
			content: html,
			rolls: [roll],
			style: CONST.CHAT_MESSAGE_STYLES.OOC,
		});
		return roll.total <= data.presenceValue;
	}

	static async toggleCrunchParty () : Promise<void> {
		if (game.user.isGM) {
			if ("PartyCruncher" in window) {
				this.lastCrunch = Date.now();
				//@ts-ignore
				await window.PartyCruncher.toggleParty(1);
			}
		} else {
			Helpers.pauseCheck();
			await this.sendPartyCrunchRequest();
		}
	}

	static async sendPartyCrunchRequest() {
			const gms = game.users.filter(x=> x.isGM);
			PersonaSockets.simpleSend("CRUNCH_TOGGLE", {}, gms.map( x=> x.id));
	}

	static async onCrunchRequest() {
		if (game.user.isGM) {
			const currTime = Date.now()
			if (currTime - this.lastCrunch > 8000) {
				await this.toggleCrunchParty();
			}
		} else {
			PersonaError.softFail("Crunch request recieved by non-GM, this is in error");
		}
		Hooks

	}
}

Hooks.on("socketsReady", () => {
	console.log("Sockets set handler");
	PersonaSockets.setHandler("CRUNCH_TOGGLE", Metaverse.onCrunchRequest.bind(Metaverse));
});

declare global {
	interface SocketMessage {
		"CRUNCH_TOGGLE": {
		};
	}
}

type PresenceRollData = {
	presenceValue: number,
	rollString: string,
	regionName: string,
	label: string,
	atkText ?: string,
	safeText ?: string,
}

declare global {
	interface HOOKS {
		"exitMetaverse" : () => void;
		"enterMetaverse" : () => void;
	}
}

Hooks.on("updateWall", function (_updateItem: WallDocument, changes: Record<string, unknown>, _diff: unknown, userId: string) {
	if (changes.ds == 1 && game.user.isGM) {
		const situation : Situation = {
			trigger: "on-open-door",
			triggeringUser: game.users.get(userId)!,
		}
		PersonaCombat.onTrigger("on-open-door", undefined, situation)
		.emptyCheck()
		?.autoApplyResult();
	}
});

Hooks.on("clockTick", function (clock: ProgressClock, _newAmt: number) {
	const situation : Situation = {
		trigger: "on-clock-tick",
		triggeringClockId: clock.id,
		triggeringUser: game.user,
	};
	console.log("Triggering ClockTick");
	PersonaCombat.onTrigger("on-clock-tick", undefined, situation)
	.emptyCheck()
	?.autoApplyResult();
});

Hooks.on("updateClock", async function (clock: ProgressClock, _newAmt: number, _delta: number) {
	const situation : Situation = {
		trigger: "on-clock-change",
		triggeringClockId: clock.id,
		triggeringUser: game.user,
	};
	console.log("Triggering Clock Change");
	await PersonaCombat.onTrigger("on-clock-change", undefined, situation)
	.emptyCheck()
	?.autoApplyResult();
});

//@ts-ignore
window.Metaverse = Metaverse;

export type PresenceCheckResult = null
	| "shadows"
	| "daemons"
	| "any";


export type TreasureItem = Weapon | InvItem | Consumable | SkillCard;

type Treasure = {
	money : number,
	items: TreasureItem[],
};
