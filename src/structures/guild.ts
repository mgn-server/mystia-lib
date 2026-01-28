/* eslint-disable @typescript-eslint/no-explicit-any */
import { Snowflake } from "discord-api-types/globals";
import { BaseStructure } from "./index.js";
import { APIGuild } from "discord-api-types/v10";
import { Client as WSClient } from "../websocket.js";

/**
 * Resolvable for guilds
 */
export class GuildResolvable extends BaseStructure {
  id: Snowflake;

  constructor(client: WSClient, guildId: Snowflake) {
    super(client);
    this.id = guildId;
  }

  /**
   * Fetch the full guild data
   */
  async fetch(): Promise<Guild> {
    const data = await this.api.getGuild(this.id);
    return new Guild(this.client, data);
  }

  /**
   * Get guild members
   */
  async getMembers(options?: {
    limit?: number;
    after?: Snowflake;
  }): Promise<any[]> {
    return this.api.listGuildMembers(this.id, options);
  }

  /**
   * Get a specific member
   */
  async getMember(userId: Snowflake): Promise<any> {
    return this.api.getGuildMember(this.id, userId);
  }

  /**
   * Ban a member
   */
  async ban(
    userId: Snowflake,
    options?: { delete_message_seconds?: number },
    reason?: string,
  ): Promise<void> {
    await this.api.createGuildBan(this.id, userId, options, reason);
  }

  /**
   * Unban a member
   */
  async unban(userId: Snowflake, reason?: string): Promise<void> {
    await this.api.removeGuildBan(this.id, userId, reason);
  }

  /**
   * Kick a member
   */
  async kick(userId: Snowflake, reason?: string): Promise<void> {
    await this.api.removeGuildMember(this.id, userId, reason);
  }
}

/**
 * Full Guild class with all data
 */
export class Guild extends GuildResolvable {
  name: string;
  icon: string | null;
  ownerId: Snowflake;
  memberCount?: number;

  private rawData: APIGuild;

  constructor(client: WSClient, data: APIGuild) {
    super(client, data.id);
    this.rawData = data;

    this.name = data.name;
    this.icon = data.icon;
    this.ownerId = data.owner_id;
    this.memberCount =
      "approximate_member_count" in data
        ? data.approximate_member_count
        : undefined;
  }

  /**
   * Get guild's icon URL
   */
  iconURL(options?: { size?: number; format?: string }): string | null {
    if (!this.icon) return null;
    const size = options?.size ?? 128;
    const format = options?.format ?? "png";
    return `https://cdn.discordapp.com/icons/${this.id}/${this.icon}.${format}?size=${size}`;
  }

  /**
   * Edit this guild
   */
  async edit(options: any, reason?: string): Promise<Guild> {
    const data = await this.api.modifyGuild(this.id, options, reason);
    return new Guild(this.client, data);
  }

  /**
   * Leave this guild
   */
  async leave(): Promise<void> {
    await this.api.leaveGuild(this.id);
  }
}
