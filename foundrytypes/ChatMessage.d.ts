declare class ChatMessage {
	static getSpeaker(spkOptions: SpeakerOptions) : SpeakerOptions;
	static async create(msgData: MessageData, options: MessageOptions = {}): Promise<ChatMessage>;
}

type MessageData = unknown;

type MessageOptions = Record<string, any>;



interface SpeakerOptions {
	alias?: string,
	token?: string,
	actor?: string,
}
