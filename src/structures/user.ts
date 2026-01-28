/* eslint-disable @typescript-eslint/no-explicit-any */
import { Snowflake } from "discord-api-types/globals";
import { BaseStructure, Message, ChannelResolvable } from "./index.js";
import {
  APIUser,
  RESTPostAPIChannelMessageJSONBody,
} from "discord-api-types/v10";
import { Client as WSClient } from "../websocket.js";

/**
 * Resolvable for users
 */
export class UserResolvable extends BaseStructure {
  id: Snowflake;

  constructor(client: WSClient, userId: Snowflake) {
    super(client);
    this.id = userId;
  }

  /**
   * Fetch the full user data
   */
  async fetch(): Promise<User> {
    const data = await this.api.getUser(this.id);
    return new User(this.client, data);
  }

  /**
   * Send a DM to this user
   */
  async send(
    content: string | RESTPostAPIChannelMessageJSONBody,
  ): Promise<Message> {
    const dmChannel = await this.api.createDM(this.id);
    const channelResolvable = new ChannelResolvable(this.client, dmChannel.id);
    return channelResolvable.send(content);
  }
}

/**
 * Full User class with all data
 */
export class User extends UserResolvable {
  username: string;
  discriminator: string;
  avatar: string | null;
  bot?: boolean;
  system?: boolean;

  private rawData: APIUser;

  constructor(client: WSClient, data: APIUser) {
    super(client, data.id);
    this.rawData = data;

    this.username = data.username;
    this.discriminator = data.discriminator;
    this.avatar = data.avatar;
    this.bot = data.bot;
    this.system = data.system;
  }

  /**
   * Get user's tag (username#discriminator)
   */
  get tag(): string {
    return `${this.username}#${this.discriminator}`;
  }

  /**
   * Get user's avatar URL
   */
  avatarURL(options?: { size?: number; format?: string }): string | null {
    if (!this.avatar)
      return `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(this.id) >> 22n) % 6}`;
    const size = options?.size ?? 128;
    const format = options?.format ?? "png";
    return `https://cdn.discordapp.com/avatars/${this.id}/${this.avatar}.${format}?size=${size}`;
  }
}
