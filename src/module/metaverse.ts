import { InvItem } from "./item/persona-item.js";
import { Consumable } from "./item/persona-item.js";
import { ShadowRole } from "../config/shadow-types.js";
import { PersonaCalendar } from "./social/persona-calendar.js";
import { PersonaDB } from "./persona-db.js";
import { PersonaError } from "./persona-error.js";
import { TensionPool } from "./exploration/tension-pool.js";
import { Shadow } from "./actor/persona-actor.js";
import { PersonaCombat } from "./combat/persona-combat.js";
import { Logger } from "./utility/logger.js";
import { PC } from "./actor/persona-actor.js";
import { PersonaActor } from "./actor/persona-actor.js";
import { PersonaSettings } from "../config/persona-settings.js";

export class Metaverse {
	static isEnhanced() : boolean {
		return PersonaSettings.isMetaverseEnhanced(); //placeholder
	}

	static async enterMetaverse() {
		(game.actors as Collection<PersonaActor>)
			.filter( (x: PersonaActor)=> x.system.type == "pc" && x.tarot != undefined)
			.forEach( (x: PC)=> x.OnEnterMetaverse());
		game.scenes
			.forEach( scene => scene.tokens.contents
				.forEach( tok => {
					try {
					(tok.actor as PersonaActor | undefined)?.fullHeal();
					PersonaCombat.onTrigger("enter-metaverse", tok.actor as PC | Shadow);
					} catch (e) {console.log(e)}
				})
			);
		await TensionPool.clear();
		Hooks.callAll("enterMetaverse");
		await Logger.sendToChat(`Entering Metaverse...`);
	}

	static async exitMetaverse() {
		(game.actors as Collection<PersonaActor>)
			.filter( (x: PersonaActor)=> x.system.type == "pc" && x.tarot != undefined)
			.forEach( (x: PC)=> x.OnExitMetaverse());
		game.scenes
			.forEach( scene => scene.tokens.contents
				.forEach( tok => {
					try {
						const actorType = (tok.actor as PersonaActor)?.system.type;
						if (!actorType) return;
						switch (actorType) {
							case "pc":
							case "shadow":
							PersonaCombat.onTrigger("exit-metaverse", tok.actor as PC | Shadow);
								break;
							case "npc":
							case "tarot":
								return;
							default:
								actorType satisfies never;
								throw new PersonaError("Unknown Actor Type");
						}
					} catch (e) {console.log(e)}
				})
			);
		await TensionPool.clear();
		Hooks.callAll("exitMetaverse");
		await Logger.sendToChat(`Exiting Metaverse...`);
	}

	static async generateEncounter(): Promise<Shadow[]> {
		const scene = game.scenes.current;
		const sceneId = scene.id;
		const disAllowedRoles: ShadowRole[] = [
			"miniboss",
			"boss",
		];
		let encounterList = PersonaDB.shadows()
			.filter ( shadow=> shadow.system.encounter.dungeons.includes(sceneId)
			&& !disAllowedRoles.includes(shadow.system.role)
			);
	if (!PersonaCalendar.isStormy()) {
		encounterList = encounterList.filter( shadow => shadow.system.encounter.rareShadow != true);
	}
		if (encounterList.length == 0) {
			throw new PersonaError(`Encounter List is empty for ${scene.name}`);
		}
		let encounterVal = 0;
		const encounter : Shadow[] = [];
		while (encounterVal < 5) {
		const dice = Math.floor(Math.random() * encounterList.length);
			const pick = encounterList[dice];
			if (!pick) {continue;}
			if (pick.system.role == "elite") {
				++encounterVal ;
			}
			++encounterVal;
			encounter.push(pick);
			if (encounterVal >= 3) {
				const abort = Math.floor(Math.random() * 10);
				if (abort <= 2) break;
			}
		}
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
			type: CONST.CHAT_MESSAGE_TYPES.WHISPER
		};
		await ChatMessage.create(messageData, {});
		return encounter;
	}

	static async generateTreasure(shadows: PersonaActor[]): Promise<(InvItem | Consumable) []> {
		let items : (InvItem | Consumable)[] = [];
		let money = 0;
		const considerItem= function (itemId: string, prob: number) {
			const item = PersonaDB.treasureItems().find(x=> x.id == itemId);
			if (!item) {return;}
			const rnd = Math.random();
			if (rnd < (prob ?? 0) / 100) {
				items.push(item);
			}
		};
		for (const shadow of shadows) {
			if (shadow.system.type != "shadow") {continue;}
			const treasure = shadow.system.encounter.treasure;
			const moneyLow = treasure.moneyLow ?? 0;
			const moneyHigh = treasure.moneyHigh ?? 0;
			const variability = moneyHigh - moneyLow;
			if (variability >= 0) {
				const bonus = Math.floor(Math.random() * (variability +1));
				money += Math.floor(moneyLow + bonus);
			}
			considerItem(treasure.item1, treasure.item1prob);
			considerItem(treasure.item2, treasure.item2prob);
		}
		const speaker = ChatMessage.getSpeaker({alias: "Treasure Generator"});
		const treasureListHTML = items
		.map( item => `<li> ${item.name} </li>`)
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
			type: CONST.CHAT_MESSAGE_TYPES.WHISPER
		};
		await ChatMessage.create(messageData, {});
		return items;
	}
}

declare global {
	interface HOOKS {
		"exitMetaverse" : () => void;
		"enterMetaverse" : () => void;
	}
}



//@ts-ignore
window.Metaverse = Metaverse;
