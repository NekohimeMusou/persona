import { PersonaActor } from "../persona-actor";
import { HBS_TEMPLATES_DIR } from "../../../config/persona-settings.js";

export class NPCSheet extends ActorSheet<PersonaActor> {

	static override get defaultOptions() {
		return mergeObject(super.defaultOptions, {
			classes: ["persona", "sheet", "actor"],
			template: `${HBS_TEMPLATES_DIR}/npc-sheet.hbs`,
			width: 800,
			height: 800,
			tabs: [{navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "main"}]
		});
	}

	override getData() {
		return super.getData();
	}

	override activateListeners(html: HTMLElement) {
		super.activateListeners(html);

	}

}

