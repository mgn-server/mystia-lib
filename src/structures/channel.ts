/* eslint-disable @typescript-eslint/no-explicit-any */
import { Snowflake } from "discord-api-types/globals";
import {
  APIChannel,
  RESTPostAPIChannelMessageJSONBody,
} from "discord-api-types/v10";
import { Message, BaseStructure, GuildResolvable } from "./index.js";
import { Client as WSClient } from "../websocket.js";

/**
 * Resolvable for channels
 */
export class ChannelResolvable extends BaseStructure {
  id: Snowflake;
  protected cachedData?: APIChannel;

  constructor(client: WSClient, channelId: Snowflake) {
    super(client);
    this.id = channelId;
  }

  /**
   * Send a message to this channel
   * @example
   * await channel.send("Hello!");
   * await channel.send({ content: "Hello!", embeds: [...] });
   */
  async send(
    content: string | RESTPostAPIChannelMessageJSONBody,
  ): Promise<Message> {
    const body: RESTPostAPIChannelMessageJSONBody =
      typeof content === "string" ? { content } : content;
    const data = await this.api.sendMessage(this.id, body);
    return new Message(this.client, data);
  }

  /**
   * Fetch the full channel data
   */
  async fetch(): Promise<Channel> {
    const data = await this.api.getChannel(this.id);
    return new Channel(this.client, data);
  }

  /**
   * Bulk delete messages
   */
  async bulkDelete(
    messages: Snowflake[] | number,
    reason?: string,
  ): Promise<void> {
    if (typeof messages === "number") {
      const fetchedMessages = await this.api.getMessages(this.id, {
        limit: messages,
      });
      const messageIds = fetchedMessages.map((m) => m.id);
      await this.api.bulkDeleteMessages(this.id, messageIds, reason);
    } else {
      await this.api.bulkDeleteMessages(this.id, messages, reason);
    }
  }

  /**
   * Start typing indicator
   */
  async startTyping(): Promise<void> {
    await this.api.triggerTyping(this.id);
  }

  /**
   * Get messages in this channel
   */
  async getMessages(options?: {
    limit?: number;
    before?: Snowflake;
    after?: Snowflake;
    around?: Snowflake;
  }): Promise<Message[]> {
    const messages = await this.api.getMessages(this.id, options);
    return messages.map((m) => new Message(this.client, m));
  }
}

/**
 * Full Channel class with all data
 */
export class Channel extends ChannelResolvable {
  name?: string | null;
  type: number;
  guildId?: Snowflake;
  position?: number;
  topic?: string | null;
  nsfw?: boolean;
  lastMessageId?: Snowflake | null;

  private rawData: APIChannel;

  constructor(client: WSClient, data: APIChannel) {
    super(client, data.id);
    this.rawData = data;
    this.cachedData = data;

    this.name = "name" in data ? data.name : undefined;
    this.type = data.type;
    this.guildId = "guild_id" in data ? data.guild_id : undefined;
    this.position = "position" in data ? data.position : undefined;
    this.topic = "topic" in data ? data.topic : undefined;
    this.nsfw = "nsfw" in data ? data.nsfw : undefined;
    this.lastMessageId =
      "last_message_id" in data ? data.last_message_id : undefined;
  }

  /**
   * Edit this channel
   */
  async edit(options: any, reason?: string): Promise<Channel> {
    const data = await this.api.modifyChannel(this.id, options, reason);
    return new Channel(this.client, data);
  }

  /**
   * Delete this channel
   */
  async delete(reason?: string): Promise<void> {
    await this.api.deleteChannel(this.id, reason);
  }

  /**
   * Get the guild this channel belongs to
   */
  get guild(): GuildResolvable | null {
    return this.guildId ? new GuildResolvable(this.client, this.guildId) : null;
  }
}
