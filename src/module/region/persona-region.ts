import { PersonaSockets } from "../persona.js";
import { Metaverse } from "../metaverse.js";
import { PersonaError } from "../persona-error.js";
import { localize } from "../persona.js"
import { UniversalModifier } from "../item/persona-item.js";
import { PersonaActor } from "../actor/persona-actor.js";
import { PersonaSettings } from "../../config/persona-settings.js";
import { PersonaDB } from "../persona-db.js";

declare global {
	interface SocketMessage {
"SEARCH_REQUEST" : {regionId: string};
	}
}

const PLAYER_VISIBLE_MOD_LIST = [
	"treasure-poor", //1d10 treasure
	"treasure-rich", //1d20+5 treasure
	"treasure-ultra", //1d10+15 treasure
	"hazard-on-2",
	"no-tension-roll",// don't roll tension after
	"safe",//can't search and no random encounter rolls
	"bonus-on-6" //+5 treasure on 6 search
] as const;

const SPECIAL_MOD_LIST = [
	...PLAYER_VISIBLE_MOD_LIST,
	"stop-on-hazard",
] as const;

type SpecialMod = typeof SPECIAL_MOD_LIST[number];

const SPECIAL_MODS = Object.fromEntries(
	SPECIAL_MOD_LIST.map( x=> [x, `persona.specialRoomMods.${x}`])
);

const SECRET_CHOICES_LIST = [
	"found",
	"none",
	"hidden",
	"found-repeatable",
	"hidden-repeatable",
] as const;

type SecretChoice = typeof SECRET_CHOICES_LIST[number];

const SECRET_CHOICES = Object.fromEntries(
	SECRET_CHOICES_LIST.map( x=> [x, `persona.secretChoices.${x}`])
);

type RegionData = {
	ignore: boolean,
	secret: SecretChoice,
	hazard: SecretChoice,
	secretDetails: string,
	hazardDetails: string,
	treasures: {
		found: number,
		max: number,
	},
	roomEffects: Item["id"][],
	pointsOfInterest: string[],
	specialMods: SpecialMod[],
	concordiaPresence: number,
	secretNotes: string,
}

export class PersonaRegion extends RegionDocument {

	defaultRegionData() : RegionData {
		return {
			ignore: false,
			secret: "none",
			hazard: "none",
			secretDetails: "",
			hazardDetails: "",
			treasures : {
				found: 0,
				max: 1,
			},
			roomEffects: [],
			pointsOfInterest: [],
			specialMods: [],
			concordiaPresence: 0,
			secretNotes: "",
		}

	}
	get regionData(): RegionData {
		return this.getFlag("persona", "RegionData") ?? this.defaultRegionData();
	}


	hasModifier(mod: SpecialMod) : boolean {
		return this.regionData.specialMods.includes(mod);
	}

	get secret(): string {
		return localize(
			SECRET_CHOICES[ this.regionData.secret ?? "none"]
		);
	}

	get hazard(): string {
		return localize(
			SECRET_CHOICES[ this.regionData.hazard ?? "none"]
		);
	}

	get concordiaPresence(): number {
		return this.regionData.concordiaPresence ?? 0;
	}

	get isSafe() : boolean {
		return this.hasModifier("safe");
	}

	async secretFound() {
		return await this.secretHazardFound("secret");
	}

	async hazardFound() {
		return await this.secretHazardFound("hazard");
	}

	async secretHazardFound(field: "secret" | "hazard") {
		const regionData = this.regionData;
		const fieldValue = regionData[field];
		switch (fieldValue) {
			case "found":
				return;
			case "hidden":
				regionData[field] = "found";
				break;
			case "none":
				PersonaError.softFail("Found hazard but there is none to find?");
				return;
			case "found-repeatable":
				break;
			case "hidden-repeatable":
				regionData[field] = "found-repeatable";
				break;
			default:
				fieldValue satisfies never;
				return;
		}
		await this.setRegionData(regionData);
	}

	async treasureFound(searchRoll: number): Promise<Roll | undefined> {
		const regionData = this.regionData;
		if (this.treasuresRemaining <= 0) {
			PersonaError.softFail("Can't find a treasure in room with no treasure left");
			return undefined;
		}
		regionData.treasures.found += 1;
		await this.setRegionData(regionData);
		return this.#treasureRoll(searchRoll);
	}

	async #treasureRoll(searchRoll: number) : Promise<Roll> {
		const mods = this.regionData.specialMods;
		let expr : string;
		switch (true) {
			case mods.includes("treasure-poor"):
				expr = "1d10";
				break;
			case mods.includes("treasure-rich"):
				expr = "1d20+5";
				break;
			case mods.includes("treasure-ultra"):
				expr = "1d10+15";
				break;
			case mods.includes("bonus-on-6") && searchRoll == 6:
				expr = "1d20+5";
				break;
			default:
				expr = "1d20";
				break;
		}
		const roll = new Roll(expr);
		await roll.evaluate();
		return roll;
	}

	get treasuresRemaining(): number {
		const t= this.regionData.treasures;
		return t.max - t.found;
	}

	get roomEffects(): UniversalModifier[] {
		return this.regionData.roomEffects.flatMap ( id=> {
			if (!id) return [];
			const mod = PersonaDB.getRoomModifiers().find(x=> x.id == id);
			if (mod) return [mod];
			else return [];
		});
	}

	get specialMods() : string[] {
		return this.regionData.specialMods
			.filter( x=> x && (game.user.isGM || PLAYER_VISIBLE_MOD_LIST.includes(x as any)))
			.map( x=> game.i18n.localize(SPECIAL_MODS[x]));
	}

	get pointsOfInterest(): string[] {
		return this.regionData.pointsOfInterest
			.filter(x=> x);
	}

	async onEnterRegion(token: TokenDocument<PersonaActor>) {
		console.debug(`Region Entered: ${this.name}`);
		if (token.actor?.type != "pc") return;
		const tokens = Array.from(this.tokens);
		if (tokens.some(t => t.actor?.system.type == "shadow" && !t.hidden) ) return;
		const presence = this.regionData.concordiaPresence ?? 0;
		if (presence > 0) {
			await Metaverse.concordiaPresenceRoll(presence, this.name);

		}
	}

	async setRegionData(data: RegionData) {
		await this.setFlag("persona", "RegionData", data);
	}

	formEntryField(field: keyof RegionData) {
		let element = $("<div>");
		element.append($("<label>").text(
			game.i18n.localize(`persona.roomAttribute.${field}`)
		));
		const fieldClass = `field-${field}`;
		switch (field) {
			case "ignore": {
				const val = this.regionData[field];
				let check = $(`<input type="checkbox">`)
				.prop("checked", val)
				.addClass(fieldClass)
				.on("change", this.#refreshRegionData.bind(this))
				element.append(check);
				break;
			}
			case "secretDetails":
			case "hazardDetails": {
				const val = this.regionData[field];
				const input = $(`<input type="text">`).val(val ?? "").addClass(fieldClass)
				.on("change", this.#refreshRegionData.bind(this))
				element.append(input);
				break;
			}
			case "secret":
			case "hazard": {
				const val = this.regionData[field];
				let select = $("<select>")
				.addClass(fieldClass)
				.on("change", this.#refreshRegionData.bind(this))
				;
				const options = Object.entries(SECRET_CHOICES)
				.map( ([k,v]) => {
					const item = $("<option>").val(k).text(game.i18n.localize(v));
					if (k == val) {
						item.prop("selected", true);
					}
					return item;
				});
				for (const i of options) {
					select.append(i);
				}
				element.append(select);
				break;
			}
			case "treasures": {
				const val = this.regionData[field];
				const subdiv = $("<div>");
				subdiv.append($("<label>").text("Found"));
				subdiv.append(
					$(`<input type="number">`).addClass(`${fieldClass}-found`).val(val.found ?? 0)
					.on("change", this.#refreshRegionData.bind(this))

				);
				subdiv.append($("<label>").text("Max"));
				subdiv.append(
					$(`<input type="number">`).addClass(`${fieldClass}-max`).val(val.max ?? 0)
					.on("change", this.#refreshRegionData.bind(this))
				);
				element.append(subdiv);
				break;
			}
			case "roomEffects": {
				const val = this.regionData[field];
				for (const i of [0,1,2,3]) {
					element.append(this.#roomEffectSelector(val.at(i), fieldClass));
				}
				break;
			}
			case "pointsOfInterest": {
				const val = this.regionData[field];
				for (const i of [0,1,2,3]) {
					element.append(
						$(`<input type="text">`).val(val.at(i) ?? "").addClass(fieldClass)
						.on("change", this.#refreshRegionData.bind(this))

					);
				}
				break;
			}
			case "specialMods": {
				const val = this.regionData[field];
				for (const i of [0,1,2,3]) {
					const select = $("<select>")
						.addClass(fieldClass)
						.on("change", this.#refreshRegionData.bind(this))
					;
					const emptyOption = $("<option>").val("").text("-");
					select.append(emptyOption);
					for (const [k,v] of Object.entries(SPECIAL_MODS)) {
						const mod = $("<option>").val(k).text(v).prop("selected", val.at(i) == k);
						select.append(mod);
					}
					element.append(select);
				}
				break;
			}
			case "concordiaPresence": {
				const val = this.regionData[field];
				element.append(
					$(`<input type="number">`).addClass(`${fieldClass}`).val(val ?? 0)
					.on("change", this.#refreshRegionData.bind(this))
				);
				break;
			}
			case "secretNotes": {
				const val = this.regionData[field];
				element.append(
					$(`<textarea>`).addClass(`${fieldClass}`)
					.val(val ?? "")
					.on("change", this.#refreshRegionData.bind(this))
				);
				break;
			}
			default:
				field satisfies never;
				return $("<div>").text("ERROR");
		}
		return element;
	}

	#roomEffectSelector(selected : string | undefined, classString: string) {
		const select = $("<select>").addClass(classString)
			.on("change", this.#refreshRegionData.bind(this))
		;
		const emptyOption = $("<option>").val("").text("-");
		select.append(emptyOption);
		const options = PersonaDB.getRoomModifiers().map(
			item => $("<option>").val(item.id).text(item.name).prop("selected", item.id == selected)
		);
		for (const i of options) {
			select.append(i);
		}
		return select;
	}

	#refreshRegionData(event: JQuery.ChangeEvent) {
		const topLevel  = $(event.currentTarget).closest(".tab.region-identity");
		const data = this.regionData;
		for( const key of Object.keys(data)) {
			const k = key as keyof RegionData;
			const fieldClass = `field-${k}`;
			switch (k) {
				case "ignore":
					const input = topLevel.find(`.${fieldClass}`).prop("checked");
					(data[k] as any) = input;
					break;
				case "secretDetails":
				case "hazardDetails":
				case "secret":
				case "hazard":
				case "secretNotes":
				case "concordiaPresence": {
					const input = topLevel.find(`.${fieldClass}`).val();
					if (input != undefined) {
						(data[k] as any) = input;
					}
					break;
				}
				case "roomEffects":
				case "pointsOfInterest":
				case "specialMods": {
					const inputs = topLevel.find(`.${fieldClass}`)
					.map( function () {
						return $(this).val();
					})
					.toArray();
					if (inputs != undefined) {
						(data[k] as any) = inputs;
					}
					break;
				}
				case "treasures": {
					const max = Number(topLevel.find(`.${fieldClass}-max`).val());
					const found = Number(topLevel.find(`.${fieldClass}-found`).val());
					data[k]= {
						found,
						max
					}
					break;
				}
				default:
					k satisfies never;
			}
		}
		this.setRegionData(data);
	}


	formFields() {
		const data = this.regionData;
		const div = $("<div>");
		const fields= Object.keys(data).map( k=> this.formEntryField(k as keyof RegionData));
		for (const f of fields) {
			div.append(f);
		}
		return div;
	}

}

//Append Region Configuraton dialog
Hooks.on("renderRegionConfig", async (app, html) => {
	let appendPoint = $(html).find(".tab.region-identity");
	if (appendPoint.length != 1) {
		throw new Error(`Append Point Length equals ${appendPoint.length}`);
	}
	const region = app.document as PersonaRegion;
	appendPoint.append($("<hr>"))
		.append(region.formFields());

	//@ts-ignore
	app.setPosition({ height: 'auto' });
});

Hooks.on("updateRegion", async (region) => {
	const lastRegion = PersonaSettings.get("lastRegionExplored");
	if (region.id == lastRegion) {
		updateRegionDisplay(region as PersonaRegion);
	}
});

Hooks.on("updateToken", (token, changes) => {
	const actor = token.actor as PersonaActor;
	if (!actor) return;
	if (token.hidden) return;
	if (actor.system.type != "pc" || !actor.hasPlayerOwner) {
		return;
	}
	if ((changes.x ?? changes.y) == undefined)
		return;
	const scene = token.parent;
	if (!scene) return;
	const region = scene.regions.find( (region : PersonaRegion) => region.tokens.has(token) && !region?.regionData?.ignore)
	if (!region || game?.combat?.active) {
		clearRegionDisplay();
		return;
	}
	updateRegionDisplay(region as PersonaRegion);
	const lastRegion = PersonaSettings.get("lastRegionExplored");
	if (lastRegion != region.id) {
		if (game.user.isGM) {
			PersonaSettings.set("lastRegionExplored", region.id);
			(region as PersonaRegion).onEnterRegion(token);
		}
	}

});

Hooks.on("updateCombat", (_combat) => {
	clearRegionDisplay();
});


async function clearRegionDisplay() {
	const infoPanel = $(document).find(".region-info-panel");
	if (infoPanel.length) {
		infoPanel.remove();
	}
}

async function updateRegionDisplay (region: PersonaRegion) {
	const html = await renderTemplate("systems/persona/other-hbs/region-panel.hbs", {region, data: region.regionData});
	let infoPanel = $(document).find(".region-info-panel");
	if (infoPanel.length ==0) {
		infoPanel = $("<section>").addClass("region-info-panel");
		infoPanel.insertAfter("#interface #ui-middle");
		// $(document).find("#ui-right").prepend(infoPanel);
	}
	infoPanel.empty();
	infoPanel.html(html);
	infoPanel.find(".search-button").on("click", searchButton);
}

async function searchButton(_ev: JQuery.ClickEvent) {
	if (game.user.isGM) {
		await Metaverse.searchRoom();
		return;
	}
	const region = Metaverse.getRegion();
	if (!region) {
		throw new PersonaError("Can't find region");
	}
	const data = {regionId: region.id};
	PersonaSockets.simpleSend("SEARCH_REQUEST", data, game.users.filter(x=> x.isGM && x.active).map(x=> x.id));
}

Hooks.on("socketsReady", () => {
	PersonaSockets.setHandler("SEARCH_REQUEST", async function (data) {
		const region = game.scenes.current.regions.find( r=> data.regionId == r.id);
		if (!region) throw new PersonaError(`Can't find region ${data.regionId}`);
		await Metaverse.searchRegion(region as PersonaRegion);
	});

});
