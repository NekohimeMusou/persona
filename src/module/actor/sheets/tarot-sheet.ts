import { PersonaActor } from "../persona-actor";
import { PersonaActorSheetBase } from "./actor-sheet.base";
import { HBS_TEMPLATES_DIR } from "../../../config/persona-settings";

export class TarotSheet extends PersonaActorSheetBase {
	override actor: Subtype<PersonaActor, "tarot">;

	static override get defaultOptions() {
		return mergeObject(super.defaultOptions, {
			classes: ["persona", "sheet", "actor"],
			template: `${HBS_TEMPLATES_DIR}/tarot-sheet.hbs`,
			width: 800,
			height: 800,
			tabs: [{navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "main"}]
		});
	}

	override getData() {
		return super.getData();
	}

	override activateListeners(html: JQuery<HTMLElement>) {
		super.activateListeners(html);
	}

}

