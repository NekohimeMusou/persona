import { PersonaError } from "../persona-error.js";
import { HTMLTools } from "../utility/HTMLTools.js";
import { SEARCH_ACTIONS } from "../../config/search-actions.js";
import { SearchAction } from "../../config/search-actions.js";
import { HBS_TEMPLATES_DIR } from "../../config/persona-settings.js";
import { PC } from "../actor/persona-actor.js";
import { PersonaSockets } from "../persona.js";
import { PersonaActor } from "../actor/persona-actor.js";
import { UniversalActorAccessor } from "../utility/db-accessor.js";
import { TensionPool } from "./tension-pool.js";



export class SearchMenu {
	private static dialog: Dialog | undefined = undefined;
	static progress = {
		treasuresFound: 0,
		hazardFound: false,
		secretFound: false
	} ;
	static promises : undefined | {
		resolve: (data: SearchResult[] | PromiseLike<SearchResult[]>) => void;
		reject: (reason: any) => void;
	};
	static data: null | SearchUpdate = null;

	static isOpen() : boolean {
		return !!this.dialog;
	}

	static async start() : Promise<void> {
		this.progress = {
			treasuresFound: 0,
			hazardFound: false,
			secretFound: false
		}
		const searchOptions =  await this.searchOptionsDialog();
		while (true) {
			const results = await this.openSearchWindow(searchOptions);
			if (results.some( res => res.declaration == "leave")) {
				this.leaveRoom(searchOptions);
				break;
			}
			await this.execSearch(results, searchOptions);
		}

	}

	static leaveRoom(_options: SearchOptions) {
		const _progress = this.progress;
		ui.notifications.notify("left the room");
	}

	static async execSearch(results : SearchResult[], options: SearchOptions) {
		let rolls : Roll[] = [];
		ui.notifications.notify("executing search");
		const guards = results.filter( x=> x.declaration == "guard").length;
		for (const searcher of results) {
			switch (searcher.declaration) {
				case "search": {
					const roll = new Roll("1d6");
					searcher.result = await this.processSearchRoll([roll], options);
					rolls.push(roll);
					break;
				}
				case "careful-search": {
					const roll = new Roll("1d6");
					const roll2 = new Roll("1d10");
					searcher.result = await this.processSearchRoll([roll, roll2], options);
					rolls.push(roll, roll2);
					break;
				}
				case "guard":
					searcher.result = "nothing";
					break;
			}
			switch (searcher.result) {
				case "hazard":
					this.progress.hazardFound = true;
					if (options.stopOnHazard)
						return;
					break;
				case "secret":
					this.progress.secretFound = true;
					break;
				case "treasure":
					options.treasureRemaining-= 1;
					this.progress.treasuresFound +=1 ;
					break;

			}
		}
		const [roll, result] = await this.tensionPool(guards);
		rolls.push(roll);
		const html  =await renderTemplate(`${HBS_TEMPLATES_DIR}/search-result.hbs`, {tensionRoll : roll, results, options, tensionResult: result} );
		const msg = ChatMessage.create({
			speaker: {
				scene: undefined,
				actor: undefined,
				token: undefined,
				alias: "Search Results"
			},
			content: html,
			type: CONST.CHAT_MESSAGE_TYPES.ROLL,
			rolls,
		})
		return msg;
	}

		static async processSearchRoll(rolls: Roll[], options: SearchOptions) : Promise<NonNullable<SearchResult["result"]>> {
			for (const roll of rolls) {
				await roll.roll();
			}
			const val = Math.max( ...rolls.map (x=> x.total))
			switch (val) {
				case 1:return options.isHazard ? "hazard" : "nothing";
				case 2: return "nothing";
				case 3: return options.isSecret ? "secret" : "nothing";
				case 4:
					return options.treasureRemaining >= 3 ? "treasure" : "nothing";
				case 5:
					return options.treasureRemaining >= 2 ? "treasure" : "nothing";
				case 6:
					return options.treasureRemaining >= 1 ? "treasure" : "nothing";
				default: return "nothing";
			}

		}

		static async tensionPool(guards: number) : Promise<[Roll, "ambush" | "battle" |"reaper" | "none"]> {
			const tensionPool= TensionPool.inc();

			const roll = new Roll(`${tensionPool}d6`);
			roll.roll();
			if (!roll.dice.some(dice => dice.values.some(v => v == 1)))
			return [roll, "none"];
			if (TensionPool.isMaxed() && roll.dice[0].values.filter( v=> v == 1 || v== 2))  {
				return [roll, "reaper"];
			}
			if (roll.dice[0].values.filter( x=> x == 1 || x== 2).length > guards)
			return [roll, "ambush"];
			return [roll, "battle"];
		}

		static async searchOptionsDialog() : Promise<SearchOptions> {
			let options = {
				treasureRemaining: 3,
				stopOnHazard: false,
				isHazard: false,
				isSecret: false
			};
			const html = await renderTemplate(`${HBS_TEMPLATES_DIR}/dialogs/searchOptions.hbs`, {options});
			return await new Promise( (res , rej) => {
				const dialog = new Dialog( {
					title: "Search Options",
					content: html,
					close: () => rej ("Closed"),
					buttons: {
						submit: {
							label: "Submit",
							callback: (html: string) => {
								console.log(html);
								options.isSecret = $(html).find("#isSecret").is(":checked");
								options.isHazard = $(html).find("#isHazard").is(":checked");
								options.stopOnHazard = $(html).find("#stopOnHazard").is(":checked");
								options.treasureRemaining = Number($(html).find(".treasureRemaining").val());
								res(options);
							}
						}
					}
				}, {});
				dialog.render(true);
			});
		}

		static async openSearchWindow(options: SearchOptions): Promise<SearchResult[]> {
			if (!game.user.isGM){
				ui.notifications.error("Only the GM can call this function");
				return [];
			}
			let searchUpdate: SearchUpdate ={
				results: this.generateOriginalSearchResults(),
				options
			};
			this.onSearchUpdate(searchUpdate);
			return new Promise( (res, rej) => {
				this.promises = {
					resolve: res,
					reject: rej,
				};
			});
		}

		private static generateOriginalSearchResults() : SearchResult[] {
			return (game.scenes.active.tokens.contents as TokenDocument<PersonaActor>[])
				.filter( x=> x.actor
					&& x.actor.system.type == "pc"
					&& x.actor.focii.length > 0 //check to eliminate crunched party token
				)
				.flatMap( tok=> {
					const actor = tok.actor! as PC;
					const activePlayers = game.users.contents
						.filter( user => user.active && !user.isGM);
					const owner = activePlayers
						.find( user => user.character == actor)
						?? activePlayers.find( user=> actor.testUserPermission(user, "OWNER")) 
						?? game.users.find(x=> x.isGM && x.active);
					if (!owner) return [];
					const ret : SearchResult = {
						searcher: {
							actor: {
								token: undefined,
								actorId: actor.id,
							},
							name: actor.displayedName,
							ownerId: owner.id,
							ownerName: owner.name,
						},
						declaration: "undecided"
					}
					return [ret];
				});
		}

		private static sendUpdate() {
			if (this.data)
				PersonaSockets.simpleSend("SEARCH_UPDATE", this.data, game.users.contents.filter(x=> x.active).map( x=> x.id));
		}

		static async onSearchUpdate(updateData  : SearchUpdate, send: boolean  = true) {
			this.data = updateData;
			if (!this.isOpen()) {
				this.openDialog(updateData);
			} else {
				this.updateDialog();
			}
			if (send)
				this.sendUpdate();
		}

		private static async openDialog( updateData: SearchUpdate) : Promise<Dialog> {
			const html = await this.renderTemplate();
			this.dialog = new Dialog( {
				title: "Search Actions",
				content: html,
				render: (html) => this.setListeners(html),
				buttons: {},
				close: () => this.isOpen() ? this.openDialog(this.data!) : this.closeDialog(),
			}, {});
			this.dialog.render(true);
			this.data = updateData;
			return this.dialog;
		}

		static closeDialog() {
			this.data = null;
			this.dialog = undefined;
		}

		private static async updateDialog() {
			if (!this.dialog) throw new PersonaError("Dialog isn't open!");
			if (!this.data) throw new PersonaError("Can't find Data");
			ui.notifications.notify("Updating Dialog");
			const html = await this.renderTemplate();
			this.dialog.element.find(".dialog-content").children().replaceWith(html);
			this.setListeners(this.dialog.element);
			if ( this.checkResolution())
				this.close();
		}

		private static checkResolution() : boolean{
			if (!this.data) return false;
			const results = this.data.results;
			if (results.some (res => res.declaration == "undecided" || res.declaration == "disconnected")){ 
				return false;
			}
			const leavers = results.filter(res => res.declaration == "leave");
			if (leavers.length > 0) {
				return leavers.length >= results.length / 2;
			}
			return true;
		}

		static close() {
			if (!this.promises && game.user.isGM)
				throw new PersonaError("No promise data found!")
			if (!this.data)
				throw new PersonaError("No data found!")
			if (this.promises) {
				this.promises.resolve(this.data.results);
				this.promises = undefined;
			}
			const dialog = this.dialog;
			this.dialog = undefined;
			this.data = null;
			if (dialog)
				dialog.close();
		}

		private static async renderTemplate() : Promise<string> {
			const updateData = this.data!;
			const html = await renderTemplate( `${HBS_TEMPLATES_DIR}/dialogs/search-dialog.hbs`, {data: updateData, SEARCH_ACTIONS});
			return html;
		}

		private static setListeners(html: string | JQuery<HTMLElement>) {
			if (typeof html == "string")
				html = $(html);
			html.find(".action-choice").on("change", ev=> {
				ev.preventDefault();
				ev.stopPropagation();
				const target = $(ev.currentTarget);
				const actorId = HTMLTools.getClosestData(ev, "actorId");
				const newAction = String(target.val());
				if (!this.data) {
					throw new PersonaError(`No Data Found`);
				}
				const sdata = this.data.results.find( res => res.searcher.actor.actorId == actorId);
				if (!sdata) {
					throw new PersonaError(`Can't find actor ${actorId}`);
				}
				sdata.declaration = newAction as SearchAction;
				this.onSearchUpdate(this.data);
			});
		}


		static onUserConnect(_user: FoundryUser) {
			if (this.isOpen() && this.data) {
				this.onSearchUpdate(this.data);
			}
		}

		static onUserDisconnect(user: FoundryUser) {
			if (this.isOpen() && this.data) {
				const results = this.data.results;
				results.filter( item => item.searcher.ownerId == user.id)
					.forEach( item => item.declaration = "disconnected");
				this.onSearchUpdate(this.data);
			}
		}

	} // end of class

	Hooks.on("userConnected", (user: FoundryUser, isConnectionEvent: boolean) => {
		if (game.user.isGM && SearchMenu.isOpen()) {
			if (isConnectionEvent) {
				SearchMenu.onUserConnect(user);
			} else {
				SearchMenu.onUserDisconnect(user);
			}
		}
	});


	type SearchOptions = {
		treasureRemaining: number;
		stopOnHazard?: boolean;
		isHazard: boolean;
		isSecret: boolean;
	};

	type SearchResult = {
		searcher : SearcherData;
		result?: "nothing" | "treasure" | "hazard" | "secret";
		roll?: number;
		declaration: SearchAction ;
	};

	type SearcherData = {
		actor: UniversalActorAccessor<PersonaActor>;
		name: string;
		ownerId: string;
		ownerName: string;
	}

	type SearchUpdate = {
		results: SearchResult[];
		options: SearchOptions;
	};

	Hooks.on("socketsReady", () => PersonaSockets.setHandler("SEARCH_UPDATE", (x: SearchUpdate) => SearchMenu.onSearchUpdate( x, false))
	);


	declare global {
		export interface SocketMessage {
			"SEARCH_UPDATE": SearchUpdate;
		}
	}
