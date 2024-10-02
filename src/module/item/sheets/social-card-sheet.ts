import { FREQUENCY } from "../../../config/frequency.js";
import { THRESHOLD_TYPE } from "../../../config/social-card-config.js";
import { PersonaSocialSheetBase } from "./social-sheet-base.js";
import { Opportunity } from "../../../config/social-card-config.js";
import { PersonaError } from "../../persona-error.js";
import { SocialCard } from "../persona-item.js";
import { HBS_TEMPLATES_DIR } from "../../../config/persona-settings.js";
import { PersonaDB } from "../../persona-db.js";
import { ArrayCorrector } from "../persona-item.js";
import { HTMLTools } from "../../utility/HTMLTools.js";
import { PERK_TYPES } from "../../../config/perk-types.js";
import { CAMEO_TYPES } from "../../../config/cameo-types.js";
import { SOCIAL_CARD_TYPES } from "../../../config/social-card-config.js";
import { SOCIAL_CARD_ROLL_TYPES } from "../../../config/social-card-config.js";
import { STUDENT_SKILLS } from "../../../config/student-skills.js";
import { PersonaEffectContainerBaseSheet } from "./effect-container.js";
import { DAYS } from "../../../config/days.js";
import { SAVE_TYPES_LOCALIZED } from "../../../config/save-types.js";

import { STUDENT_SKILLS_EXT } from "../../../config/student-skills.js";

const PRIMARY_SECONDARY = {
	"primary": "persona.term.primary",
	"secondary": "persona.term.secondary",
};

export class PersonaSocialCardSheet extends PersonaSocialSheetBase {
	declare item: SocialCard;

	override async getData() {
		const data = await super.getData();
		data.THRESHOLD_TYPE = THRESHOLD_TYPE;
		data.POWERSTUFF =  PersonaEffectContainerBaseSheet.powerStuff;
		data.CONST = {
			DAYS
		};
		data.SOCIAL_DATA = {
			ROLLTYPES : SOCIAL_CARD_ROLL_TYPES,
			STUDENT_SKILLS,
			STUDENT_SKILLS_EXT,
			SAVE_DIFFICULTY: SAVE_TYPES_LOCALIZED,
			ROLL_DC_TYPES: {"base": "Base", "static": "Static DC"},
			FREQUENCY: FREQUENCY,
		};
		// data.FREQUENCY = FREQUENCY;
		data.SOCIAL_CARD_TYPES = SOCIAL_CARD_TYPES;
		data.CAMEO_TYPES = CAMEO_TYPES;
		data.PERK_TYPES = PERK_TYPES;
		data.PRIMARY_SECONDARY = PRIMARY_SECONDARY;
		data.QUALIFIERS_NAME_LIST = PersonaDB.allSocialCards()
			.flatMap(card => card.system.qualifiers)
			.map(qual=> qual.relationshipName)
			.filter( (val, i, arr) => arr.indexOf(val) == i);
		return data;
	}

	get powerStuff() {
		const data = PersonaEffectContainerBaseSheet.powerStuff;
		return data;
	}

	static override get defaultOptions() {
		return foundry.utils.mergeObject(super.defaultOptions, {
			classes: ["persona", "sheet", "actor"],
			template: `${HBS_TEMPLATES_DIR}/social-card-sheet.hbs`,
			width: 800,
			height: 800,
			tabs: [{navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "combat"}]
		});
	}

	override activateListeners(html: JQuery<HTMLElement>) {
		super.activateListeners(html);
		html.find(".add-qualifier").on("click", this.addQualifier.bind(this));
		html.find(".delete-qualifier").on("click", this.deleteQualifier.bind(this));

		html.find(".add-opportunity").on("click", this.addOpportunity.bind(this));
		html.find(".del-opportunity").on("click", this.deleteOpportunity.bind(this));
		html.find(".add-event").on("click", this.addCardEvent.bind(this));
		html.find(".del-event").on("click", this.deleteCardEvent.bind(this));
		html.find(".add-choice").on("click", this.addChoice.bind(this));
		html.find(".del-choice").on("click", this.deleteChoice.bind(this));

	}

	async addOpportunity(_ev: JQuery.ClickEvent) {
		const card = this.item;
		let opList =card.system.opportunity_list;
		const newOpportunity : Opportunity = {
			name: "Unnamed Choice",
			choices: 1,
			//TODO: Add this to the actual opportunity sheet, right now doesn't have a conditions entry section
			conditions: [],
			text: "",
			postEffects: { effects: []},
			roll: {
				rollType: "none",
			}
		};
		opList.push( newOpportunity);
		await card.update({"system.opportunity_list": opList});
	}

	async deleteOpportunity(ev: JQuery.ClickEvent) {
		const indexStr = HTMLTools.getClosestData(ev, "opportunityIndex");
		const index = Number(indexStr);
		if (Number.isNaN(index)) {
			throw new PersonaError("Bad index on Delete opportunity");
		}
		const card = this.item;
		let opList =card.system.opportunity_list;
		opList.splice(index,1);
		await card.update({"system.opportunity_list": opList});
	}

	async addCardEvent( _ev: JQuery.ClickEvent) {
		await this.item.addCardEvent();
	}
	async deleteCardEvent( ev: JQuery.ClickEvent) {
		const eventIndex = Number(HTMLTools.getClosestData(ev, "eventIndex"));
		await this.item.deleteCardEvent(eventIndex);

	}

	async addChoice(ev: JQuery.ClickEvent) {
		const eventIndex = Number(HTMLTools.getClosestData(ev, "eventIndex"));
		await this.item.addEventChoice(eventIndex);

	}

	async deleteChoice(ev: JQuery.ClickEvent) {
		const eventIndex = Number(HTMLTools.getClosestData(ev, "eventIndex"));
		const choiceIndex = Number(HTMLTools.getClosestData(ev, "choiceIndex"));
		await this.item.deleteEventChoice(eventIndex,choiceIndex);
	}

	async addQualifier(_ev: JQuery.ClickEvent) {
		const qual = ArrayCorrector(this.item.system.qualifiers);
		qual.push({
			relationshipName: "",
			min: 0,
			max: 0
		});
		await this.item.update({"system.qualifiers": qual});
	}

	async deleteQualifier(ev: JQuery.ClickEvent) {
		const index : number = Number(HTMLTools.getClosestData(ev, "qualifierIndex"));
		console.log(`Deleting qualifier - ${index}`);
		if (Number.isNaN(index))  {
			throw new PersonaError("NaN index");
		}
		const qual = ArrayCorrector(this.item.system.qualifiers);
		qual.splice(index, 1);
		await this.item.update({"system.qualifiers": qual});
	}

} // end of class
