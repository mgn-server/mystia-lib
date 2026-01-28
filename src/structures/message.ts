/* eslint-disable @typescript-eslint/no-explicit-any */
import { Snowflake } from "discord-api-types/globals";
import {
  APIEmbed,
  APIMessage,
  APIReaction,
  APIUser,
  GatewayMessageEventExtraFields,
  RESTPatchAPIChannelMessageJSONBody,
  RESTPostAPIChannelMessageJSONBody,
} from "discord-api-types/v10";
import { BaseStructure, ChannelResolvable, GuildResolvable } from "./index.js";
import { Client as WSClient } from "../websocket.js";

/**
 * Represents a Discord Message with convenient methods
 */
export class Message extends BaseStructure {
  id: Snowflake;
  channelId: Snowflake;
  guildId?: Snowflake;
  author: APIUser;
  content: string;
  timestamp: string;
  editedTimestamp: string | null;
  tts: boolean;
  mentionEveryone: boolean;
  mentions: APIUser[];
  mentionRoles: Snowflake[];
  attachments: any[];
  embeds: APIEmbed[];
  reactions?: APIReaction[];
  pinned: boolean;
  type: number;

  private rawData: APIMessage;

  constructor(
    client: WSClient,
    data: GatewayMessageEventExtraFields & APIMessage,
  ) {
    super(client);
    this.rawData = data;

    this.id = data.id;
    this.channelId = data.channel_id;
    this.guildId = data.guild_id;
    this.author = data.author;
    this.content = data.content;
    this.timestamp = data.timestamp;
    this.editedTimestamp = data.edited_timestamp;
    this.tts = data.tts;
    this.mentionEveryone = data.mention_everyone;
    this.mentions = data.mentions;
    this.mentionRoles = data.mention_roles;
    this.attachments = data.attachments;
    this.embeds = data.embeds;
    this.reactions = data.reactions;
    this.pinned = data.pinned;
    this.type = data.type;
  }

  /**
   * Reply to this message
   * @example
   * await message.reply("Hello!");
   * await message.reply({ content: "Hello!", embeds: [...] });
   */
  async reply(
    content: string | RESTPostAPIChannelMessageJSONBody,
  ): Promise<Message> {
    const body: RESTPostAPIChannelMessageJSONBody =
      typeof content === "string"
        ? {
            content,
            message_reference: { message_id: this.id },
          }
        : {
            ...content,
            message_reference: { message_id: this.id },
          };
    const data = await this.api.sendMessage(this.channelId, body);
    return new Message(this.client, data);
  }

  /**
   * Edit this message
   * @example
   * await message.edit("Updated content");
   * await message.edit({ content: "Updated", embeds: [...] });
   */
  async edit(
    content: string | RESTPatchAPIChannelMessageJSONBody,
  ): Promise<Message> {
    const body: RESTPatchAPIChannelMessageJSONBody =
      typeof content === "string" ? { content } : content;
    const data = await this.api.editMessage(this.channelId, this.id, body);
    return new Message(this.client, data);
  }

  /**
   * Delete this message
   * @example
   * await message.delete();
   * await message.delete("Spam");
   */
  async delete(reason?: string): Promise<void> {
    await this.api.deleteMessage(this.channelId, this.id, reason);
  }

  /**
   * Pin this message
   */
  async pin(reason?: string): Promise<void> {
    await this.api.pinMessage(this.channelId, this.id, reason);
  }

  /**
   * Unpin this message
   */
  async unpin(reason?: string): Promise<void> {
    await this.api.unpinMessage(this.channelId, this.id, reason);
  }

  /**
   * Add a reaction to this message
   * @example
   * await message.react("👍");
   * await message.react("customEmoji:123456789");
   */
  async react(emoji: string): Promise<void> {
    await this.api.addReaction(this.channelId, this.id, emoji);
  }

  /**
   * Remove a reaction from this message
   */
  async removeReaction(emoji: string, userId?: Snowflake): Promise<void> {
    if (userId) {
      await this.api.removeUserReaction(this.channelId, this.id, emoji, userId);
    } else {
      await this.api.removeOwnReaction(this.channelId, this.id, emoji);
    }
  }

  /**
   * Get the channel this message was sent in
   */
  get channel(): ChannelResolvable {
    return new ChannelResolvable(this.client, this.channelId);
  }

  /**
   * Get the guild this message was sent in (if in a guild)
   */
  get guild(): GuildResolvable | null {
    return this.guildId ? new GuildResolvable(this.client, this.guildId) : null;
  }

  /**
   * Fetch the full message data
   */
  async fetch(): Promise<Message> {
    const data = await this.api.getMessage(this.channelId, this.id);
    return new Message(this.client, data);
  }

  /**
   * Check if the message author is a bot
   */
  get isBot(): boolean {
    return this.author.bot ?? false;
  }

  /**
   * Get the URL to this message
   */
  get url(): string {
    return this.guildId
      ? `https://discord.com/channels/${this.guildId}/${this.channelId}/${this.id}`
      : `https://discord.com/channels/@me/${this.channelId}/${this.id}`;
  }
}
