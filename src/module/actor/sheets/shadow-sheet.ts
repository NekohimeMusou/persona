import { HTMLTools } from "../../utility/HTMLTools.js";
import { SHADOW_ROLE } from "../../../config/shadow-types.js";
import { HBS_TEMPLATES_DIR } from "../../../config/persona-settings.js";
import { PersonaActor } from "../persona-actor.js";
import { CombatantSheetBase } from "./combatant-sheet.js";

export class ShadowSheet extends CombatantSheetBase {
	override actor: Subtype<PersonaActor, "shadow">;

	static override get defaultOptions() {
		return foundry.utils.mergeObject(super.defaultOptions, {
			classes: ["persona", "sheet", "actor"],
			template: `${HBS_TEMPLATES_DIR}/shadow-sheet.hbs`,
			width: 800,
			height: 800,
			tabs: [{navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "main"}]
		});
	}

	override async getData() {
		const data = await super.getData();
		data.SHADOW_ROLE = SHADOW_ROLE;
		return data;

	}

	override activateListeners(html: JQuery<HTMLElement>) {
		super.activateListeners(html);
		html.find('.addShadowPower').on("click", this.onAddPower.bind(this));
		html.find('.addShadowFocus').on("click", this.onAddFocus.bind(this));
		html.find(".recost-power").on("click", this.onRecostPower.bind(this));

	}

	async onAddPower( _ev: Event) {
		await this.actor.createEmbeddedDocuments( "Item", [{
			name: "New Power",
			type: "power",
		}]);
	}

	async onAddFocus(_ev: Event) {
		await this.actor.createEmbeddedDocuments( "Item", [{
			name: "New Focus",
			type: "focus",
		}]);
	}

	async onRecostPower(event: JQuery.ClickEvent) {
		const powerId = HTMLTools.getClosestData(event, "powerId");
		const power = this.actor.powers.find(power => power.id == powerId);
		if (!power) return;
		this.actor.setDefaultShadowCosts(power);
	}

}

