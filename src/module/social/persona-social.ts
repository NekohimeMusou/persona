import { CardChoice } from "../../config/social-card-config.js";
import { SocialCardActionEffect } from "../combat/combat-result.js";
import { weightedChoice } from "../utility/weightedChoice.js";
import { SocketPayload } from "../utility/socket-manager.js";
import { PersonaCalendar } from "./persona-calendar.js";
import { ConditionalEffect } from "../datamodel/power-dm.js";
import { ArrayCorrector } from "../item/persona-item.js";
import { ActivityLink } from "../actor/persona-actor.js";
import { Activity } from "../item/persona-item.js";
import { StudentSkill } from "../../config/student-skills.js"

import { getActiveConsequences } from "../preconditions.js";
import { CardRoll } from "../../config/social-card-config.js";
import { testPreconditions } from "../preconditions.js";
import { CardEvent } from "../../config/social-card-config.js";
import { PersonaSockets } from "../persona.js";
import { SocialLinkData } from "../actor/persona-actor.js";
import { TarotCard } from "../../config/tarot.js";
import { PersonaCombat } from "../combat/persona-combat.js";
import { CombatResult } from "../combat/combat-result.js";
import { NonCombatTrigger } from "../../config/triggers.js";
import { SocialLink } from "../actor/persona-actor.js";
import { PersonaItem } from "../item/persona-item.js";
import { PersonaActor } from "../actor/persona-actor.js";
import { HBS_TEMPLATES_DIR } from "../../config/persona-settings.js";
import { SocialCard } from "../item/persona-item.js";
import { PersonaSounds } from "../persona-sounds.js";
import { Logger } from "../utility/logger.js";
import { PersonaError } from "../persona-error.js";
import { PC } from "../actor/persona-actor.js";
import { SocialStat } from "../../config/student-skills.js";
import { ModifierList } from "../combat/modifier-list.js";
import { STUDENT_SKILLS } from "../../config/student-skills.js";
import { Situation } from "../preconditions.js";
import { RollBundle } from "../persona-roll.js";
import { PersonaDB } from "../persona-db.js";
import { HTMLTools } from "../utility/HTMLTools.js";
import { StudentSkillExt } from "../../config/student-skills.js";

export class PersonaSocial {
	static allowMetaverse: boolean = true;
	static metaverseChoosers = 0;
	static cardDrawPromise: null | {
		res: (str: string) => void,
		rej: (x: any) => void,
	}

	static #drawnCardIds: string[] = [];
	static rollState: null |
		{
			continuation: ((...args: any) => void);
			cardData: CardData;
		};


	static async startSocialCombatTurn(disallowMetaverse = false, advanceCalendar = true) {
		this.allowMetaverse = !disallowMetaverse;
		this.metaverseChoosers = 0;
		if (!game.user.isGM) {
			ui.notifications.error("Only GM can start new social combat turn");
			return;
		}
		const extraMsgs : string [] = [];
		const actingCharacter = game?.combat?.combatant?.actor as PersonaActor | undefined;
		if (actingCharacter && actingCharacter.system.type == "pc") {
			if (actingCharacter.hasStatus("injured")) {
				extraMsgs.push(`<b> ${actingCharacter.name} </b>: is injured and should probably take the rest action`);
			}
			if (actingCharacter.hasStatus("jailed")) {
				extraMsgs.push(`<b> ${actingCharacter.name} </b>: is jailed and must either pay their bail or take the jail action`);
			}
			if (actingCharacter.hasStatus("crippled")) {
				extraMsgs.push(`<b> ${actingCharacter.name} </b>: is crippled and must take the hospital action.`);
			}
			if (actingCharacter.hasStatus("exhausted")) {
				extraMsgs.push(`<b> ${actingCharacter.name} </b>: is exhausted and should probably take the rest action.`);
			}
		}
		if (this.allowMetaverse) {
			extraMsgs.push("<b>Metaverse</b>: You may opt to go to the metaverse, though you must decide to now before taking any actions");
		}

		if (advanceCalendar) {
			await this.advanceCalendar(true, extraMsgs);
		}

	}

	static async advanceCalendar(force = false, extraMsgs : string [] = []) {
		if (!force && !(await HTMLTools.confirmBox( "Advance Date", "Advnace Date?", true)))
			return;
		await PersonaCalendar.nextDay(extraMsgs);
		const day = PersonaCalendar.weekday();
		const socialLinks = (game.actors.contents as PersonaActor[]).filter( actor=> actor.system.type == "pc" || actor.system.type == "npc" && actor.tarot).map(x=> x as SocialLink);
		for (const link of socialLinks){
			const avail = link.system.weeklyAvailability[day];
			await link.setAvailability(avail);
		}
		for (const activity of PersonaDB.allActivities()){
			const avail = activity.system.weeklyAvailability[day];
			await activity.setAvailability(avail);
		}

	}

	static async rollSocialStat( pc: PC, socialStat: SocialStat, extraModifiers?: ModifierList, altName ?: string, situation?: Situation) : Promise<RollBundle> {
		let mods = pc.getSocialStat(socialStat);
		let socialmods = pc.getBonuses("socialRoll");
		mods = mods.concat(socialmods);
		const customMod = await HTMLTools.getNumber("Custom Modifier") ?? 0;
		mods.add("Custom Modifier", customMod);
		if (extraModifiers) {
			mods = mods.concat(extraModifiers);
		}
		const skillName = game.i18n.localize(STUDENT_SKILLS[socialStat]);
		const rollName = (altName) ? altName : skillName;
		const sit: Situation = situation ?? {
			user: PersonaDB.getUniversalActorAccessor(pc),
			attacker: pc.accessor,
		};
		const r = await new Roll("1d20").roll();
		const dice = new RollBundle(rollName, r, true,  mods, sit);
		return dice;
	}

	static async boostSocialSkill(pc: PC, socialStat: SocialStat) {
		const amount = await HTMLTools.numberButtons("Amount", 1, 3) as 1 | 2| 3;
		await pc.alterSocialSkill(socialStat, amount);
	}

	static resolvePrimarySecondarySocialStat(choice: StudentSkillExt, link: SocialLink | Activity) : StudentSkill {
		switch (choice) {
			case "primary":
			case "secondary":
				if (link instanceof PersonaActor){
					return link.getSocialStatToRaiseLink(choice);
				}else {
					return link.system.keyskill[choice];
				}
			default:
				return choice;
		}
	}



	static async getPrimarySecondary(defaultChoice: "primary" | "secondary" | SocialStat = "primary") :Promise<"primary" | "secondary" | SocialStat> {
		const skillList = foundry.utils.mergeObject(
			{
				"primary":		"persona.term.primary",
				"secondary":"persona.term.secondary"
			} ,
			STUDENT_SKILLS);
		const html = await renderTemplate(`${HBS_TEMPLATES_DIR}/dialogs/social-skill-selector.hbs`, {skillList, defaultChoice} );
		return await new Promise( (conf, reject) => {
			const dialog = new Dialog({
				title: `Prompt`,
				content: html,
				render: async (html: string) => {
					$(html).find(".numInput").focus();
				},
				buttons: {
					one: {
						icon: `<i class="fas fa-check"></i>`,
						label: "Confirm",
						callback: (htm: string) => {
							// const value =$('select[name="PorS"]:checked').val() as "primary" | "secondary" | undefined;
							const value = $(htm).find(".social-skill-choice").find(":selected").val() as "primary" | "secondary" | SocialStat | undefined;
							if (value) {
								conf(value);
							} else {
								reject("Something weird happened");
							}
						}
					},
					two: {
						icon: `<i class="fas fa-times"></i>`,
						label: "Cancel",
						callback: () => reject("Cancel"),
					}
				},
				default: "one",
				close: () => {
					reject("close");
				},
			}, {});
			dialog.render(true);
		});

	}

	static validSocialCards(actor: PC, activity: SocialLink) : SocialCard[] {
		const link = this.lookupSocialLink(actor, activity.id)
		const situation : Situation= {
			user: actor.accessor,
			attacker: actor.accessor,
			socialTarget: link? link.actor.accessor : undefined,
			isSocial: true,
			target: link? link.actor.accessor : undefined,
		};
		const preconditionPass=  PersonaDB.allSocialCards()
			.filter( card => testPreconditions(card.system.conditions, situation, null));
		if (!link) return preconditionPass;
		else return  preconditionPass
			.filter( item => {
				const relationshipName : string = link.relationshipType;
				return item.system.qualifiers
					.some(x=> x.relationshipName == relationshipName
						&& link.linkLevel >= x.min
						&& link.linkLevel <= x.max
					)
			});
	}

	static async #drawSocialCard(actor: PC, link : Activity | SocialLink) : Promise<SocialCard> {
		if (!game.user.isGM)
		return await this.#sendGMCardRequest(actor, link);
		if (link instanceof PersonaItem) {
			return link;
		}
		const cards = this.validSocialCards(actor, link);
		let undrawn = cards.filter( card=> !this.#drawnCardIds.includes(card.id));

		if (undrawn.length < 1) {
			undrawn = cards;
			this.#drawnCardIds = this.#drawnCardIds
				.filter(cardId=> !cards.find(card => card.id == cardId));
		}
		// const draw  = Math.floor(Math.random() * undrawn.length) ;
		// const chosenCard =  undrawn[draw];
		const chosenCard = weightedChoice(
			undrawn.map( card=> ({
				item: card,
				weight: card.system.frequency ?? 1,
			}))
		);
		if (!chosenCard) throw new PersonaError("Can't find valid social card!");
		this.#drawnCardIds.push(chosenCard.id);
		return chosenCard;
	}

	static async #socialEncounter(actor: PC, activity: SocialLink | Activity) : Promise<ChatMessage[]> {
		if (activity instanceof PersonaActor) {
			const link = this.lookupSocialLink(actor, activity.id);
			if (link.actor.isSpecialEvent(link.linkLevel+1)) {
				//TODO: Finish later
			}
		}
		const card = await this.#drawSocialCard(actor, activity);
		const cameos = this.#getCameos(card, actor, activity.id);
		const perk = this.#getPerk(card, actor, activity, cameos);
		const situation : Situation = {
			user: actor.accessor,
			socialTarget: activity instanceof PersonaActor ?  activity.accessor: undefined,
			attacker: actor.accessor,
			target: activity instanceof PersonaActor ?  activity.accessor: undefined,
			isSocial: true,
		};
		const cardData : CardData = {
			card,
			actor,
			linkId: activity.id,
			activity,
			cameos,
			perk,
			eventsChosen: [],
			eventsRemaining: card.system.num_of_events,
			situation,
			forceEventLabel: null
		};
		return await this.#execCardSequence(cardData);

		// return await this.#printSocialCard(card, actor, linkId, cameos, perk);
	}


	static lookupLink(cardData: CardData): ActivityLink | SocialLinkData {
		switch (cardData.card.system.cardType) {
			case "social":
				return this.lookupSocialLink(cardData.actor, cardData.linkId);
			default:
				return this.lookupActivity(cardData.actor, cardData.linkId);
		}

	}

	static lookupActivity(actor: PC, activityId: string): ActivityLink {
		const link = actor.activityLinks.find( x=> x.activity.id == activityId);
		if (!link) throw new PersonaError(`Can't find activity: ${activityId}`);
		return link;
	}

	static lookupSocialLink(actor: PC, linkId: string) :SocialLinkData {
		const link= actor.socialLinks.find(link => link.actor.id == linkId);
		if (!link)
			throw new PersonaError(`Can't find link ${linkId}`);
		return link;
	}

	static #getCameos(card: SocialCard, actor: PC, linkId: string) : SocialLink[] {
		let targets : (undefined | SocialLink)[] = [];
		switch (card.system.cameoType) {
			case "none": return [];
			case "above":
				targets.push(this.getCharInInitiativeList(-1));
				break;
			case "below":
				targets.push(this.getCharInInitiativeList(1));
				break;
			case "above+below":
				targets.push(this.getCharInInitiativeList(-1));
				targets.push(this.getCharInInitiativeList(1));
				break;
			case "student": {
				const students = (game.actors.contents as PersonaActor[])
				.filter( x=>
					(x.system.type == "npc" || x.system.type == "pc")
					&& x.baseRelationship == "PEER"
					&& x != actor && x.id != linkId
					&& x.isAvailable()
				) as SocialLink[];
				const randomPick = students[Math.floor(Math.random() * students.length)];
				if (!randomPick)
				throw new PersonaError("Random student select failed");
				return [randomPick];
			}
			case "any": {
				const anyLink = (game.actors.contents as PersonaActor[])
				.filter( x=>
					(x.system.type == "npc" || x.system.type == "pc")
					&& x.baseRelationship != "SHADOW"
					&& x != actor && x.id != linkId
					&& x.isAvailable()
				) as SocialLink[];
				const randomPick = anyLink[Math.floor(Math.random() * anyLink.length)];
				if (!randomPick)
				throw new PersonaError("Random any link select failed");
				return [randomPick];
			}
			case "invite-sl4":
				PersonaError.softFail("invite not yet implemented");
				return [];
			case "invite-couple":
				PersonaError.softFail("invite couple type not yet implemented");
				return [];
			case "buy-in-2":
				PersonaError.softFail("Buy in 2 not yet implemented");
				return [];
			default:
				card.system.cameoType satisfies never;
		}
		return targets.filter( x=> x != undefined 
			&& x != actor
			&& x.id != linkId) as SocialLink[];
	}

	static #getPerk(card: SocialCard,actor: PC, link: Activity | SocialLink, cameos: SocialLink[]) {
		switch (card.system.perkType) {
			case "standard":
				return link.perk;
			case "standard-or-cameo":
				return "Choose One: <br>" +
					[link].concat(cameos)
					.map( x=> `* ${x.perk}`)
					.join("<br>");
			case "card-or-cameo":
				return "Choose One: <br>" +
					[card.system.perk].concat(cameos.map( x=> `* ${x.perk}`))
					.join("<br>");
			case "custom-only":
				return card.system.perk;
			case "standard-or-custom":
				return "Choose One: <br>" +
					[link.perk, card.perk]
					.map( x=> `* ${x}`)
					.join("<br>");
			case "standard-or-date":
				let datePerk : string;
				switch (link.system.type) {
					case "pc":
						datePerk = this.defaultDatePerk();
						break;
					case "npc":
						datePerk = link.system.datePerk || this.defaultDatePerk();
						break;
					default:
						PersonaError.softFail(`No datePerk type for ${link.system.type}`);
						datePerk="";
				}
				return "Choose One: <br>" +
					[actor.perk, datePerk]
					.map( x=> `* ${x}`)
					.join("<br>");
			case "none":
				return "";
			default:
				card.system.perkType satisfies never;
				return "";
		}
	}

	static defaultDatePerk() : string {
		return "Gain 2 social progress tokens with the target character";
	}

	static getCharInInitiativeList( offset: number) : SocialLink | undefined {
		if (!game.combat || !game.combat.combatant) return undefined;
		const initList = game.combat.turns;
		const index = initList.indexOf(game.combat.combatant);
		let modOffset = (index + offset) % initList.length;
		while(modOffset < 0) {
			modOffset += initList.length;
		}
		return initList[modOffset].actor as SocialLink;
	}

	static async #execCardSequence(cardData: CardData): Promise<ChatMessage[]> {
		let chatMessages: ChatMessage[] = [];
		await this.#printCardIntro(cardData);
		while (cardData.eventsRemaining > 0) {
			const ev = this.#getCardEvent(cardData);
			if (!ev) {
				PersonaError.softFail("Ran out of events");
				break;
			}
			cardData.eventsRemaining--;
			const msg = await this.#execEvent(ev, cardData);
			chatMessages.push(msg);
		}
		const opp = await this.#execOpportunity(cardData);
		if (opp) {
			chatMessages.push(opp);
		}
		const final = await this.#finalizeCard(cardData);
		chatMessages.push(final);
		this.rollState = null;
		return chatMessages;
	}

	static async #execOpportunity(cardData: CardData) {
		const card = cardData.card;
		if (!card.system.opportunity
			&& !card.system.opportunity_choices)
			return;
		const html = await renderTemplate(`${HBS_TEMPLATES_DIR}/chat/social-card-opportunity.hbs`, {item: card,card,cardData} );
		const speaker = ChatMessage.getSpeaker();
		const msgData : MessageData = {
			speaker,
			content: html,
			type: CONST.CHAT_MESSAGE_TYPES.OOC
		};
		return await ChatMessage.create(msgData,{} );
	}

	static #getCardEvent(cardData:CardData) : CardEvent | undefined  {
		if (cardData.forceEventLabel) {
			const gotoEvent = cardData.card.system.events.find( x=> x.label  == cardData.forceEventLabel);
			cardData.forceEventLabel = null;
			if (gotoEvent) {
				return gotoEvent;
			}
			PersonaError.softFail (`Can't find event label ${cardData.forceEventLabel} on card ${cardData.card.name}`);
		}
		let eventList = cardData.card.system.events
			.filter( (ev, i) => !cardData.eventsChosen.includes(i) && testPreconditions(ev.conditions, cardData.situation, null));
		const isEvType = function (ev: CardEvent, evType: keyof NonNullable<CardEvent["placement"]>) {
			let placement = ev.placement ?? {
				starter: true,
				middle: true,
				finale: true,
			};
			if (Object.values(placement).every( x=> x == false)) {
				placement ={
					starter: true,
					middle: true,
					finale: true,
				};
			}
			return placement[evType];
		};
		switch (true) {
			case cardData.eventsChosen.length == 0:
				eventList = eventList.filter( ev => isEvType(ev, "starter"));
				break;
			case cardData.eventsRemaining > 1:
				eventList = eventList.filter( ev => isEvType(ev, "middle"));
				break;
			case cardData.eventsRemaining <= 1:
				eventList = eventList.filter( ev => isEvType(ev, "finale"));
				break;
		}
		const ev = weightedChoice(eventList.map( event => ({
			item: event,
			weight: event.frequency ?? 1
		})));
		if (!ev) return undefined;
		cardData.eventsChosen.push(cardData.card.system.events.indexOf(ev));
		return ev;
	}

	static async #printCardIntro(cardData: CardData) {
		const {card, cameos, perk, actor } = cardData;
		const link = this.lookupLink(cardData);
		const DC = this.getBaseSkillDC(cardData);
		const linkId =  "actor" in link ? link.actor.id : link.activity.id;
		const { perkDisabled } = card.system;
		const isCameo = card.system.cameoType != "none";
		const html = await renderTemplate(`${HBS_TEMPLATES_DIR}/chat/social-card-intro.hbs`, {item: card,card, cameos, perk, perkDisabled, link: link, linkId, pc: actor, isCameo, user: game.user, DC} );
		const speaker = ChatMessage.getSpeaker();
		const msgData : MessageData = {
			speaker,
			content: html,
			type: CONST.CHAT_MESSAGE_TYPES.OOC
		};
		return await ChatMessage.create(msgData,{} );
	}

	static async #execEvent(event: CardEvent, cardData: CardData) {
		const eventNumber = cardData.eventsChosen.length;
		const eventIndex = cardData.card.system.events.indexOf(event);
		const html = await renderTemplate(`${HBS_TEMPLATES_DIR}/chat/social-card-event.hbs`,{event,eventNumber, cardData, situation : cardData.situation, eventIndex});
		const speaker = ChatMessage.getSpeaker();
		const msgData : MessageData = {
			speaker,
			content: html,
			type: CONST.CHAT_MESSAGE_TYPES.OOC
		};
		const msg = await ChatMessage.create(msgData,{} );
		if (ArrayCorrector(event.choices).length > 0) {
			await new Promise( (conf, _rej) => {
				this.rollState = {
					cardData,
					continuation: conf
				};
			});
		}
		return msg;
	}

	static getCardModifiers(cardData: CardData) : ModifierList {
		const card= cardData.card;
		let effects : ConditionalEffect[] = [];
		effects = effects.concat(card.system.globalModifiers);
		const retList = new ModifierList();
		retList.addConditionalEffects(effects, "Card Modifier",["socialRoll"]);
		return retList;
	}



	static async #finalizeCard( cardData: CardData) : Promise<ChatMessage<Roll>> {

		let html = "";
		let pcImproveSpend = "";
		if (cardData.card.system.cardType == "social") {
			const link = this.lookupLink(cardData) as SocialLinkData;

			if (link.actor.type == "pc") {
				pcImproveSpend = `<li class="token-spend"> spend 4 progress tokens to raise link with ${link.actor.name}</li>`;
			}
		}
		const tokenSpends = (cardData.card.system.tokenSpends ?? [])
		.concat(cardData.activity != cardData.card ?  cardData.activity.system.tokenSpends ?? [] : [])
		.filter( spend => testPreconditions(spend.conditions ?? [], cardData.situation, null))
		.map(x=> `spend ${x.amount} progress tokens to ${x.text}.`)
		.map(x=> `<li class="token-spend"> ${x} </li>`);

		const finale = (cardData.card.system.finale?.trim()) ? `
		<h2> Finale </h2>
		<span class="finale">
		${cardData.card.system.finale.trim()}
		</span>
		` : "";
		html += finale;

		html += `<div class="token-spends">
		<h3>Token Spends:</h3>
		<ul>
		${pcImproveSpend}
		${tokenSpends.join("")}
		</ul>
		</div>
		`;
		const speaker = ChatMessage.getSpeaker();
		const msgData : MessageData = {
			speaker,
			content: html,
			type: CONST.CHAT_MESSAGE_TYPES.OOC
		};
		const msg= await ChatMessage.create(msgData,{} );
		return msg;
	}

	static async chooseActivity(actor: PC, activity: SocialLink | Activity, _options: ActivityOptions = {}) {
		if (!game.combat
			|| !(game.combat.combatant?.actor == actor)) {
			ui.notifications.warn("It's not your turn");
			return;
		}
		if (activity instanceof PersonaItem) {
			const situation : Situation = {
				user: actor.accessor,
				attacker: actor.accessor,
				isSocial: true,
			};
			if (!testPreconditions( activity.system.conditions, situation, null)) {
				ui.notifications.warn("Fails to meet preconditions for this activity.");
				return;
			}
		}

		if (actor.hasStatus("exhausted") && activity instanceof PersonaItem && activity.system.cardType == "training") {
			ui.notifications.warn("You're currently unable to take this action, you must recover first");
			return;
		}
		if (!actor.canTakeNormalDowntimeActions()) {
			if (activity instanceof PersonaActor) {
				ui.notifications.warn("You're currently unable to take this action, you must recover first");
				return;
			}
			if (activity.system.cardType != "recovery") {
				ui.notifications.warn("You're currently unable to take this action, you must recover first");
				return;
			}

		}
		if (activity instanceof PersonaItem) {
			await actor.addNewActivity(activity);
			if (activity.system.cardType == "job") {
				//TODO: sockets to send availability change
				// await activity.setAvailability(false);
			}
		}
		if (activity instanceof PersonaActor) {
			// await activity.setAvailability(false);
		}
		this.#socialEncounter(actor, activity);
	}

	static drawnCards() : string[] {
		//NOTE: Only a debug function
		return this.#drawnCardIds;
	}

	static async execTrigger( trigger: NonCombatTrigger, actor: PC, situation ?: Situation, msg = "Triggered Effect") {
		await this.onTrigger(trigger, actor, situation)
			.emptyCheck()
			?.toMessage(msg, actor);

	}
	static onTrigger(trigger: NonCombatTrigger, actor: PC, situation ?: Situation) : CombatResult {
		const result = new CombatResult();
		if (!situation) {
			situation = {
				user: actor.accessor,
			}
		}
		situation = {
			...situation,
			trigger
		} ; //copy the object so it doesn't permanently change it
		for (const trig of actor.triggers) {
			for (const eff of trig.getEffects(actor)) {
				if (ModifierList.testPreconditions(eff.conditions, situation, trig)) { continue;}
				const cons = PersonaCombat.ProcessConsequences(trig, situation, eff.consequences, actor)
				for (const c of cons.consequences) {
					result.addEffect(null, actor, c.cons);
				}
			}
		}
		return result;
	}

	static async awardPerk(target: PC, socialLink: SocialLink) {
		const situation : Situation = {
			user: target.accessor,
			tarot: socialLink.tarot?.name as TarotCard,
			target: target.accessor,
			socialTarget: target.accessor,
		}
		console.log(situation);
		await this.execTrigger("on-attain-tarot-perk", target, situation, `Gains Perk (${socialLink.tarot?.name})`) ;
	}

	static getBaseSkillThreshold (cardData: CardData) : number {
		return this.getBaseSkillDC(cardData) - 5;
	}

	static getBaseSkillDC (cardData: CardData) : number {
		const ctype = cardData.card.system.cardType;
		switch (ctype) {
			case "social":
				const link = this.lookupSocialLink(cardData.actor, cardData.linkId);
				return 10 + link.linkLevel * 2;
			case "training":
			case "other":
			case "job":
			case "recovery":
				switch (cardData.card.system.dc.thresholdType) {
					case "static":
						return cardData.card.system.dc.num;
					case "levelScaled":
						return cardData.card.system.dc.multiplier * cardData.actor.system.combat.classData.level + cardData.card.system.dc.startingVal;
					case "statScaled":
						const stat = cardData.card.system.dc.stat;
						return 10 + (cardData.actor.system.skills[stat] ?? -999);
					default:
							cardData.card.system.dc satisfies never;
						return 20;
				}
			default:
				ctype satisfies never;
				throw new PersonaError("Should be unreachable");
		}
	}

	static getCardRollDC(cardData: CardData, roll: CardRoll) : number {
		switch (roll.rollType) {
			case "save":
				switch (roll.saveType) {
					case "normal": return 11;
					case "easy": return 6;
					case "hard": return 16;
					default: roll.saveType satisfies never;
						throw new PersonaError("Should be unreachable");
				}
			case "studentSkillCheck":
				switch (roll.DC.subtype) {
					case "static":
						return roll.DC.staticDC;
					case "base":
						return this.getBaseSkillDC(cardData);
					default:
						roll.DC.subtype satisfies never;

				}
			default: return 0;
		}
	}

	static async handleCardChoice(cardData: CardData, cardChoice: CardChoice) {
		const cardRoll = cardChoice.roll;
		const effectList  = cardChoice?.postEffects?.effects ?? [];
		switch (cardRoll.rollType) {
			case "none": {
				await this.applyEffects(effectList,cardData.situation, cardData.actor);
				break;
			}
			case "gmspecial":
				await this.applyEffects(effectList,cardData.situation, cardData.actor);
				break;
			case "studentSkillCheck": {
				const modifiers = this.getCardModifiers(cardData);
				modifiers.add("Roll Modifier", cardRoll.modifier);
				const DC = this.getCardRollDC(cardData, cardRoll);
				const link = this.lookupLink(cardData);
				const activityOrActor = "actor" in link ? link.actor: link.activity;
				const skill = this.resolvePrimarySecondarySocialStat(cardRoll.studentSkill, activityOrActor);
				const roll = await this.rollSocialStat(cardData.actor, skill, modifiers, `Card Roll (${skill} ${cardRoll.modifier || ""} vs DC ${DC})`,  cardData.situation);
				await roll.toModifiedMessage();
				const situation : Situation = {
					...cardData.situation,
					hit: roll.total >= DC,
					criticalHit: roll.total >= DC + 10,
					naturalSkillRoll: roll.natural,
					rollTotal: roll.total
				};
				await this.applyEffects(effectList, situation, cardData.actor);
				break;
			}
			case "save": {
				const saveResult = await PersonaCombat.rollSave(cardData.actor, {
					DC: this.getCardRollDC(cardData, cardRoll),
					label: "Card Roll (Saving Throw)",
				});
				const situation : Situation = {
					...cardData.situation,
					hit: saveResult.success,
					rollTotal: saveResult.total
				};
				await this.applyEffects(effectList,situation, cardData.actor);
				break;
			}
			default:
				cardRoll satisfies never;
		}
	}

	static async applyEffects(effects: ConditionalEffect[], situation: Situation, actor: PC) {
		const results = ArrayCorrector(effects ?? []).flatMap( eff=> getActiveConsequences(eff, situation, null));
		const processed= PersonaCombat.ProcessConsequences_simple(results);
		const result = new CombatResult();
		for (const c of processed.consequences) {
			result.addEffect(null, actor, c.cons);
		}
		await result.emptyCheck()
			?.autoApplyResult();
		// .toMessage("Social Roll Effects", actor);

	}

	static async makeCardRoll(ev: JQuery.ClickEvent) {
		if (!this.rollState)
			throw new PersonaError("No event state present, can't resume roll");
		const cardId = HTMLTools.getClosestData(ev, "cardId");
		const messageId = HTMLTools.getClosestData(ev, "messageId");
		const message = game.messages.get(messageId);
		if (!message) {
			throw new PersonaError(`Couldn't find messsage ${messageId}`);
		}
		const eventIndex = Number(HTMLTools.getClosestData(ev, "eventIndex"));
		const choiceIndex = Number(HTMLTools.getClosestData(ev, "choiceIndex"));
		const card = PersonaDB.allSocialCards().find(card=> card.id == cardId);

		if (!card) {
			throw new PersonaError(`Can't find card ${cardId}`);
		}
		const cardEvent = card.system.events[eventIndex];
		const choice = cardEvent.choices[choiceIndex];
		await this.handleCardChoice(this.rollState.cardData, choice);
		const content = $(message.content);
		content
			.closest(".social-card-event")
			.find(".event-choice")
			.each( function () {
				const index = Number(HTMLTools.getClosestData($(this), "choiceIndex"));
				if (index != choiceIndex) {
					$(this).remove();
				} else {
					$(this).find("button").remove();
					$(this).find(".event-choice").addClass("chosen");
				}
			});
		const html = content.html();
		await message.update( {"content": html});
		if (!this.rollState.continuation) {
			throw new PersonaError("No roll is currently ongoing, can't execute");
		}
		this.rollState.continuation();
	}


	static async #sendGMCardRequest(actor: PC, link: SocialLink | Activity) : Promise<SocialCard> {
		const gms = game.users.filter(x=> x.isGM);
		if (this.cardDrawPromise) {
			this.cardDrawPromise.rej("Second Draw");
			this.cardDrawPromise = null;
		}
		const promise : Promise<string> = new Promise( (res, rej) => {
			this.cardDrawPromise = { res, rej};
		});
		PersonaSockets.simpleSend("DRAW_CARD", {actorId: actor.id, linkId: link.id}, gms.map( x=> x.id));
		const cardId = await promise;
		const card = game.items.get(cardId) as SocialCard | undefined;
		if (!card) throw new PersonaError(`No card found for ${link.name}`);
		return card;
	}

	static async answerCardRequest(req: SocketMessage["DRAW_CARD"], socketPayload: SocketPayload<"DRAW_CARD">) {
		const actor = game.actors.get(req.actorId) as PC;
		const activity = (game.actors.get(req.linkId) ?? game.items.get(req.linkId)) as SocialLink | SocialCard;
		//typescript was being fussy and needed me to define a concrete type despuite it being legal to call set availability on either
		if (activity instanceof PersonaItem && activity.system.cardType == "job") {
			await activity.setAvailability(false);
		}
		if (activity instanceof PersonaActor) {
			await activity.setAvailability(false);
		}
		const card = await this.#drawSocialCard(actor, activity)
		const sendBack = [socketPayload.sender];
		// console.log(`Send back ${card.name}`);
		PersonaSockets.simpleSend("CARD_REPLY", {cardId: card.id}, sendBack);
	}

	static async getCardReply(req: SocketMessage["CARD_REPLY"]) {
		console.log(`got reply ${req.cardId}`);
		if (!this.cardDrawPromise) return;
		if (req.cardId) {
			this.cardDrawPromise.res(req.cardId);
		}
	}

	static async execSocialCardAction(eff: SocialCardActionEffect) {
		if (!this.rollState) {
			PersonaError.softFail(`Can't execute card action ${eff.action}. No roll state`);
			return;
		}
		switch (eff.action) {
			case "stop-execution":
				this.stopCardExecution();
				return;
			case "exec-event":
				this.forceEvent(eff.eventLabel);
				return;
			case "inc-events":
				this.addExtraEvent(eff.amount ?? 0);
				return;
			case "gain-money":
				await this.gainMoney(eff.amount ?? 0)
				return;
			case "modify-progress-tokens":
					await this.modifyProgress(eff.amount ?? 0);
				return;
			case "alter-student-skill":
					if (!eff.studentSkill) {
						PersonaError.softFail("No student skill given");
						return;
					}
				await this.alterStudentSkill( eff.studentSkill, eff.amount ?? 0);
				return;
			default:
					eff.action satisfies never;
				return;
		}

	}

	static async modifyProgress(amt: number) {
		if (!this.checkRollState("modify Progress tokens")) return;
		const linkId = this.rollState!.cardData.linkId;
		await this.rollState!.cardData.actor.socialLinkProgress(linkId, amt);
	}

	static checkRollState(operation: string = "perform Social Roll Operation") {
		if (this.rollState) {
			return true;
		}
		PersonaError.softFail(`Roll state doesn't exist can't ${operation}`);
		return false;
	}

	static async alterStudentSkill(skill: StudentSkill, amt: number) {
		if (!this.checkRollState("alter student skill")) return;
		await this.rollState!.cardData.actor.alterSocialSkill(skill, amt);
	}

	static async gainMoney(amt: number) {
		if (!this.rollState) {
			PersonaError.softFail(`Can't grant money. No Rollstate`);
			return;
		}
		await this.rollState.cardData.actor.gainMoney(amt, true);

	}

	static addExtraEvent(amount: number) {
		if (!this.rollState) {
			PersonaError.softFail(`Can't create more events as there is no RollState`);
			return;
		}
		this.rollState.cardData.eventsRemaining += amount;
	}

	static stopCardExecution() {
		this.rollState = null;
		this.cardDrawPromise= null;
	}

	static forceEvent(evLabel?: string) {
		console.log(`Entering Force Event : ${evLabel}`);
		if (!evLabel) return;
		if (!this.rollState) {
			PersonaError.softFail(`Can't force event ${evLabel} as there is no rollstate`);
			return;
		}
		console.log(`Forcing Event : ${evLabel}`);
		this.rollState.cardData.forceEventLabel = evLabel;
	}

} //end of class


type ActivityOptions = {
	noDegrade ?: boolean;

}

declare global {
	interface SocketMessage {
		"DEC_AVAILABILITY": string;
		"DRAW_CARD": {
			actorId: string,
			linkId: string
		};
		"CARD_REPLY": {
			cardId: string
		}
	}
}

Hooks.on("socketsReady", () => {
	console.log("Sockets set handler");
	PersonaSockets.setHandler("DRAW_CARD", PersonaSocial.answerCardRequest.bind(PersonaSocial));
	PersonaSockets.setHandler("CARD_REPLY", PersonaSocial.getCardReply.bind(PersonaSocial));
});

Hooks.on("socketsReady" , () => {PersonaSockets.setHandler("DEC_AVAILABILITY", ( task_id: string) => {
	if (!game.user.isGM) return;
	const link = game.actors.find(x=> x.id == task_id);
	if (link) {
		const actor = link as PersonaActor;
		if (actor.system.type == "npc" || actor.system.type == "pc") {
			(actor as SocialLink).setAvailability(false);
		}
		return;
	}
	const job = PersonaDB.allJobs().find( x=> x.id == task_id);
	if (job){
		//TODO: Degrade this if it's a job and not something else
		return;
	}
	throw new PersonaError(`Can't find Task ${task_id} to decremetn availability`);

});
});

//@ts-ignore
window.PersonaSocial = PersonaSocial

Hooks.on("updateActor", async (_actor: PersonaActor, changes) => {
	if ((changes as any)?.system?.weeklyAvailability) {
		(game.actors.contents as PersonaActor[])
			.filter(x=> x.system.type =="pc"
				&& x.sheet._state > 0)
			.forEach(x=> x.sheet.render(true));
	}
});

Hooks.on("updateItem", async (_item: PersonaItem, changes) => {
	if ((changes as any)?.system?.weeklyAvailability) {
		(game.actors.contents as PersonaActor[])
			.filter(x=> x.system.type =="pc"
				&& x.sheet._state > 0)
			.forEach(x=> x.sheet.render(true));
	}
});

Hooks.on("renderChatMessage", async (message: ChatMessage, html: JQuery ) => {
	if ((message?.author ?? message?.user) == game.user) {
		// html.find("button.social-roll").on ("click", PersonaSocial.execSocialCard.bind(PersonaSocial));
		html.find(".social-card-roll .make-roll").on("click", PersonaSocial.makeCardRoll.bind(PersonaSocial));
		html.find(".social-card-roll .next").on("click", PersonaSocial.makeCardRoll.bind(PersonaSocial));
	}
});


export type CardData = {
	card: SocialCard,
	actor: PC,
	linkId: string,
	activity: Activity | SocialLink,
	cameos: SocialLink[],
	perk: string,
	forceEventLabel: null | string,
	eventsChosen: number[],
	eventsRemaining: number,
	situation: Situation
};



