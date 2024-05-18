import { SocketManager } from "./socket-manager.js";


declare global {
	interface SocketMessage {
		"CHANNEL_MESSAGE":  ChannelMessagePayload
	}
	interface HOOKS {
"newRecieverChannel": (reciever: SocketChannel<any>) => void;
		"channelsReady": () => void;

	}
}

interface OpenChannel {
	"OPEN_CHANNEL" : undefined;
}

type ChannelMessagePayload = {
	channelMsgCode: (keyof ChannelMessage | keyof OpenChannel) & string;
	channelId: number;
	sessionCode: number;
	msgType: "initial" | "reply" | "open" | "close";
	data: ChannelMessage[string]["initial" | "reply"];
	sender: FoundryUser["id"];
	linkCode: SocketChannel<any>["linkCode"];

};


export type ChannelMessage =
	{
		[key: string]: {
			// initial: string,
			// reply: string
			initial: MsgObjectData,
			reply?:	MsgObjectData,
		}

	};

type MsgObjectData = undefined | string | number  |boolean | {[key:string] : MsgObjectData};


type HandlerFn<T extends ChannelMessage, K extends keyof T> = (data: T[K]["initial"]) => Promise <T[K]["reply"] | undefined>;



export class SocketChannel<MSGTYPE extends ChannelMessage> {
	closed= false;
	recipients: FoundryUser["id"][]= [];
	static socket: SocketManager;
	socket: SocketManager;
	id: number;
	linkCode: string;
	sessionCode: number = 0;
	static channels: SocketChannel<any>[] = [];
	awaiters: Map<SocketMessage["CHANNEL_MESSAGE"]["sessionCode"], {
		res: (reply: MSGTYPE[string]["initial" | "reply"]) => void ,
		rej: (reason: any) => void
	}> = new Map();
	handlers: Map<keyof MSGTYPE, HandlerFn<MSGTYPE, keyof MSGTYPE>> = new Map();

	constructor (numericId : number, linkCode: string, recipients: SocketChannel<MSGTYPE>["recipients"]) {
		this.id = numericId;
		this.socket = SocketChannel.socket;
		this.linkCode = linkCode;
		this.recipients = recipients;
		if (!this.socket) {
			throw new Error("Sockets not started and trying to make a channel");
		}
	}

	static init() {
		Hooks.on("socketsReady", (socketManager) => {
			this.socket = socketManager;
			socketManager.setHandler("CHANNEL_MESSAGE", this.onChannelMessage.bind(this));
			Hooks.callAll("channelsReady");
		});

	}

	setHandler<T extends keyof MSGTYPE>( msgCode: T, replyFn: HandlerFn<MSGTYPE, T>) {
		this.handlers.set(msgCode, replyFn);
	}

	static onChannelMessage( payload: SocketMessage["CHANNEL_MESSAGE"]) : void {
		switch (payload.msgType) {
			case "open":
				const reciever = this.socket.createChannel(payload.linkCode);
				Hooks.callAll("newRecieverChannel", reciever);
				console.debug("Opening Channel");
				break;
		}
		const channel = this.channels.find(ch => ch.linkCode == payload.linkCode);
		if (!channel) {
			console.warn(`Trying to send to non-existent link Code :${payload.linkCode}`);
			console.warn(payload);
			return;
		}
		channel.onChannelMessage(payload);
	}

	onChannelMessage( payload: SocketMessage["CHANNEL_MESSAGE"]) {
		const sessionCode = payload.sessionCode;
		switch (payload.msgType) {
			case "open":
				return;
			case "initial":
				this.#onInitialMsg(payload.channelMsgCode, payload.data, payload);
				break;
			case "reply":
				this.#onReplyMsg(payload.channelMsgCode, payload.data, payload.sessionCode);
				break;
			case "close":
				this.#closeSub();
				break;
			default:
				payload.msgType satisfies never;
				throw new Error(`Unknown Payload Msg Type : ${payload.msgType}`);
		}
	}

	async #onInitialMsg<T extends keyof MSGTYPE & string> (msgCode: T, data: MSGTYPE[T]["initial"], payload: ChannelMessagePayload) {
		const x = this.handlers.get(msgCode);
		if (!x) {
			console.warn(`No handler for ${String(msgCode)}`);
			return;
		}
		if (x) {
			const y = await x(data);
			if (y) {
				await this.#reply(msgCode, y, payload.sessionCode, payload.sender);
			}
		}
	}

	async #onReplyMsg<T extends keyof MSGTYPE & string> (msgCode: T, data: MSGTYPE[T]["reply"], sessionCode: ChannelMessagePayload["sessionCode"]) {
		const awaiter = this.awaiters.get(sessionCode);
		if (!awaiter) {
			console.warn(`No awaiter found for ${msgCode}, sessionId: ${sessionCode}`);
			return;
		}
		awaiter.res(data);
		this.awaiters.delete(sessionCode);
	}

	async sendInitial<T extends keyof MSGTYPE & string> (msgCode: T, initialMsg: MSGTYPE[T]["initial"]) : Promise<MSGTYPE[T]["reply"]> {
		const recipients = this.recipients;
		const sessionCode = this.sessionCode++;
		this.socket.simpleSend("CHANNEL_MESSAGE", {
			channelMsgCode: msgCode,
			channelId: this.id,
			data: initialMsg,
			sessionCode: sessionCode,
			msgType: "initial",
			sender: game.user.id,
			linkCode: this.linkCode
		}, recipients);
		return await new Promise( (res, rej) => {
			this.awaiters.set(sessionCode, {res,rej});
			setTimeout( () => {
				rej("Timeout");
			}, 8000);
		});
	}

	async #reply<T extends keyof MSGTYPE & string> (msgCode: T, reply: MSGTYPE[T]["reply"], sessionCode: ChannelMessagePayload["sessionCode"], target: FoundryUser["id"] ) {
		const recipients = this.recipients;
		this.socket.simpleSend("CHANNEL_MESSAGE", {
			channelMsgCode: msgCode,
			channelId: this.id,
			data: reply,
			sessionCode,
			msgType: "reply",
			sender: game.user.id,
			linkCode: this.linkCode
		}, [target]);
	}

	sendOpen() {
		this.socket.simpleSend("CHANNEL_MESSAGE", {
			channelMsgCode: "OPEN_CHANNEL",
			channelId: this.id,
			sessionCode: -1,
			msgType: "open",
			data: undefined,
			sender: game.user.id,
			linkCode: this.linkCode
		}, this.recipients);
	}

	sendClose() {
		this.socket.simpleSend("CHANNEL_MESSAGE", {
			channelMsgCode: "CLOSE_CHANNEL",
			channelId: this.id,
			sessionCode: -1,
			msgType: "close",
			data: undefined,
			sender: game.user.id,
			linkCode: this.linkCode
		}, this.recipients);
	}

	close() {
		this.sendClose();
		this.#closeSub();
	}

	#closeSub() {
		this.closed = true;
		this.awaiters.forEach( awaiter => {
			awaiter.rej("Channel closed");
		});
		this.awaiters.clear();
		this.recipients = [];
		this.handlers.clear();
		this.linkCode= "";
		this.sessionCode=-1;
		SocketChannel.channels = SocketChannel.channels.filter( x=> x.id == this.id);
	}

}

Hooks.on("ready", () => SocketChannel.init());

