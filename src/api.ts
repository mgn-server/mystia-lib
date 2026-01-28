/* eslint-disable  @typescript-eslint/no-explicit-any */
import {
  APIVersion,
  RESTPostAPIChannelMessageJSONBody,
  RESTGetAPIChannelMessageResult,
  RESTPatchAPIChannelMessageJSONBody,
  RESTPostAPIChannelMessageResult,
  RESTPatchAPIChannelMessageResult,
  RESTPostAPIGuildEmojiJSONBody,
  RESTPatchAPIGuildEmojiJSONBody,
  RESTPostAPIGuildRoleJSONBody,
  RESTPatchAPIGuildRoleJSONBody,
  RESTPatchAPIGuildJSONBody,
  RESTGetAPIUserResult,
  RESTGetAPIGuildResult,
  RESTGetAPIChannelResult,
  RESTPatchAPICurrentUserJSONBody,
  RESTPostAPIGuildChannelJSONBody,
  RESTPatchAPIChannelJSONBody,
  RESTPostAPICurrentUserCreateDMChannelResult,
  Snowflake,
  RESTPatchAPIGuildMemberJSONBody,
} from "discord-api-types/v10";
import * as packageJson from "../package.json" with { type: "json" };

/**
 * Rate limit bucket for managing API rate limits
 */
interface RateLimitBucket {
  limit: number;
  remaining: number;
  reset: number;
  resetAfter: number;
}

/**
 * Options for API requests
 */
export interface ApiRequestOptions extends RequestInit {
  /** Request body */
  body?: any;
  /** Query parameters to append to the URL */
  query?: Record<string, string | number | boolean>;
  /** Whether to parse response as JSON (default: true) */
  parseJson?: boolean;
  /** Reason for audit log */
  reason?: string;
}

/**
 * Error thrown when an API request fails
 */
export class DiscordAPIError extends Error {
  constructor(
    message: string,
    public code: number,
    public status: number,
    public method: string,
    public url: string,
    public response?: any,
  ) {
    super(message);
    this.name = "DiscordAPIError";
  }
}

/**
 * Error thrown when rate limited
 */
export class RateLimitError extends Error {
  constructor(
    message: string,
    public retryAfter: number,
    public global: boolean,
  ) {
    super(message);
    this.name = "RateLimitError";
  }
}

/**
 * Base API client with rate limiting and error handling
 */
export class BaseApi {
  protected token: string;
  protected api: string = `https://discord.com/api/v${APIVersion}`;
  protected rateLimits: Map<string, RateLimitBucket> = new Map();
  protected globalRateLimit: number | null = null;

  constructor(token: string) {
    if (!token) {
      throw new Error("Token is required");
    }
    this.token = token;
  }

  /**
   * Build query string from object
   */
  protected buildQuery(
    params?: Record<string, string | number | boolean>,
  ): string {
    if (!params || Object.keys(params).length === 0) return "";

    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      query.append(key, String(value));
    }
    return `?${query.toString()}`;
  }

  /**
   * Get rate limit bucket key from endpoint
   */
  protected getBucketKey(method: string, endpoint: string): string {
    return `${method}:${endpoint.split("?")[0]}`;
  }

  /**
   * Check if we're rate limited for this bucket
   */
  protected async checkRateLimit(bucketKey: string): Promise<void> {
    if (this.globalRateLimit && Date.now() < this.globalRateLimit) {
      const waitTime = this.globalRateLimit - Date.now();
      throw new RateLimitError(
        `Global rate limit hit. Retry after ${waitTime}ms`,
        waitTime,
        true,
      );
    }

    const bucket = this.rateLimits.get(bucketKey);
    if (bucket && bucket.remaining === 0 && Date.now() < bucket.reset) {
      const waitTime = bucket.reset - Date.now();
      throw new RateLimitError(
        `Rate limit hit for bucket ${bucketKey}. Retry after ${waitTime}ms`,
        waitTime,
        false,
      );
    }
  }

  /**
   * Update rate limit information from response headers
   */
  protected updateRateLimit(bucketKey: string, headers: Headers): void {
    const limit = headers.get("x-ratelimit-limit");
    const remaining = headers.get("x-ratelimit-remaining");
    const reset = headers.get("x-ratelimit-reset");
    const resetAfter = headers.get("x-ratelimit-reset-after");
    const global = headers.get("x-ratelimit-global");

    if (global === "true") {
      const retryAfter = parseFloat(headers.get("retry-after") || "0");
      this.globalRateLimit = Date.now() + retryAfter * 1000;
    }

    if (limit && remaining && reset) {
      this.rateLimits.set(bucketKey, {
        limit: parseInt(limit),
        remaining: parseInt(remaining),
        reset: parseInt(reset) * 1000,
        resetAfter: parseFloat(resetAfter || "0") * 1000,
      });
    }
  }

  /**
   * Make an HTTP request to the Discord API
   */
  protected async request<T = any>(
    method: string,
    endpoint: string,
    options?: ApiRequestOptions,
  ): Promise<T> {
    const url = this.api + endpoint + this.buildQuery(options?.query);
    const bucketKey = this.getBucketKey(method, endpoint);

    await this.checkRateLimit(bucketKey);

    const headers: Record<string, string> = {
      Authorization: `Bot ${this.token}`,
      "User-Agent": `DiscordBot (https://github.com/mgn-server, ${packageJson.version})`,
      ...(options?.headers as Record<string, string>),
    };

    if (options?.reason) {
      headers["X-Audit-Log-Reason"] = encodeURIComponent(options.reason);
    }

    if (
      options?.body &&
      typeof options.body === "object" &&
      !(options.body instanceof FormData)
    ) {
      headers["Content-Type"] = "application/json";
    }

    const response = await fetch(url, {
      method,
      headers,
      ...options,
      body:
        options?.body &&
        typeof options.body === "object" &&
        !(options.body instanceof FormData)
          ? JSON.stringify(options.body)
          : options?.body,
    });

    this.updateRateLimit(bucketKey, response.headers);

    if (!response.ok) {
      let errorData: any;
      try {
        errorData = await response.json();
      } catch {
        errorData = { message: response.statusText };
      }

      if (response.status === 429) {
        const retryAfter = parseFloat(
          response.headers.get("retry-after") || "0",
        );
        const global = response.headers.get("x-ratelimit-global") === "true";
        throw new RateLimitError(
          errorData.message || "Rate limited",
          retryAfter * 1000,
          global,
        );
      }

      throw new DiscordAPIError(
        errorData.message || "Unknown error",
        errorData.code || 0,
        response.status,
        method,
        url,
        errorData,
      );
    }

    if (response.status === 204) {
      return undefined as T;
    }

    if (options?.parseJson === false) {
      return response as T;
    }

    return (await response.json()) as any;
  }

  /**
   * GET request
   */
  protected async get<T = any>(
    endpoint: string,
    options?: ApiRequestOptions,
  ): Promise<T> {
    return this.request<T>("GET", endpoint, options);
  }

  /**
   * POST request
   */
  protected async post<T = any>(
    endpoint: string,
    options?: ApiRequestOptions,
  ): Promise<T> {
    return this.request<T>("POST", endpoint, options);
  }

  /**
   * PATCH request
   */
  protected async patch<T = any>(
    endpoint: string,
    options?: ApiRequestOptions,
  ): Promise<T> {
    return this.request<T>("PATCH", endpoint, options);
  }

  /**
   * PUT request
   */
  protected async put<T = any>(
    endpoint: string,
    options?: ApiRequestOptions,
  ): Promise<T> {
    return this.request<T>("PUT", endpoint, options);
  }

  /**
   * DELETE request
   */
  protected async delete<T = any>(
    endpoint: string,
    options?: ApiRequestOptions,
  ): Promise<T> {
    return this.request<T>("DELETE", endpoint, options);
  }
}

/**
 * Full Discord API client with all methods
 */
export class Api extends BaseApi {
  constructor(token: string) {
    super(token);
  }

  /**
   * Send a message to a channel
   */
  async sendMessage(
    channelId: Snowflake,
    options: RESTPostAPIChannelMessageJSONBody,
  ): Promise<RESTPostAPIChannelMessageResult> {
    return this.post(`/channels/${channelId}/messages`, {
      body: options,
    });
  }

  /**
   * Get a specific message
   */
  async getMessage(
    channelId: Snowflake,
    messageId: Snowflake,
  ): Promise<RESTGetAPIChannelMessageResult> {
    return this.get(`/channels/${channelId}/messages/${messageId}`);
  }

  /**
   * Edit a message
   */
  async editMessage(
    channelId: Snowflake,
    messageId: Snowflake,
    options: RESTPatchAPIChannelMessageJSONBody,
  ): Promise<RESTPatchAPIChannelMessageResult> {
    return this.patch(`/channels/${channelId}/messages/${messageId}`, {
      body: options,
    });
  }

  /**
   * Delete a message
   */
  async deleteMessage(
    channelId: Snowflake,
    messageId: Snowflake,
    reason?: string,
  ): Promise<void> {
    return this.delete(`/channels/${channelId}/messages/${messageId}`, {
      reason,
    });
  }

  /**
   * Bulk delete messages (2-100 messages, not older than 2 weeks)
   */
  async bulkDeleteMessages(
    channelId: Snowflake,
    messageIds: Snowflake[],
    reason?: string,
  ): Promise<void> {
    if (messageIds.length < 2 || messageIds.length > 100) {
      throw new Error("Must provide between 2 and 100 message IDs");
    }

    return this.post(`/channels/${channelId}/messages/bulk-delete`, {
      body: { messages: messageIds },
      reason,
    });
  }

  /**
   * Get channel messages
   */
  async getMessages(
    channelId: Snowflake,
    options?: {
      around?: Snowflake;
      before?: Snowflake;
      after?: Snowflake;
      limit?: number;
    },
  ): Promise<RESTGetAPIChannelMessageResult[]> {
    return this.get(`/channels/${channelId}/messages`, {
      query: options as any,
    });
  }

  /**
   * Crosspost a message to following channels
   */
  async crosspostMessage(
    channelId: Snowflake,
    messageId: Snowflake,
  ): Promise<RESTPostAPIChannelMessageResult> {
    return this.post(`/channels/${channelId}/messages/${messageId}/crosspost`);
  }

  /**
   * Add a reaction to a message
   */
  async addReaction(
    channelId: Snowflake,
    messageId: Snowflake,
    emoji: string,
  ): Promise<void> {
    const encodedEmoji = encodeURIComponent(emoji);
    return this.put(
      `/channels/${channelId}/messages/${messageId}/reactions/${encodedEmoji}/@me`,
    );
  }

  /**
   * Remove own reaction
   */
  async removeOwnReaction(
    channelId: Snowflake,
    messageId: Snowflake,
    emoji: string,
  ): Promise<void> {
    const encodedEmoji = encodeURIComponent(emoji);
    return this.delete(
      `/channels/${channelId}/messages/${messageId}/reactions/${encodedEmoji}/@me`,
    );
  }

  /**
   * Remove a user's reaction
   */
  async removeUserReaction(
    channelId: Snowflake,
    messageId: Snowflake,
    emoji: string,
    userId: Snowflake,
  ): Promise<void> {
    const encodedEmoji = encodeURIComponent(emoji);
    return this.delete(
      `/channels/${channelId}/messages/${messageId}/reactions/${encodedEmoji}/${userId}`,
    );
  }

  /**
   * Remove all reactions from a message
   */
  async removeAllReactions(
    channelId: Snowflake,
    messageId: Snowflake,
  ): Promise<void> {
    return this.delete(
      `/channels/${channelId}/messages/${messageId}/reactions`,
    );
  }

  /**
   * Remove all reactions for a specific emoji
   */
  async removeAllReactionsForEmoji(
    channelId: Snowflake,
    messageId: Snowflake,
    emoji: string,
  ): Promise<void> {
    const encodedEmoji = encodeURIComponent(emoji);
    return this.delete(
      `/channels/${channelId}/messages/${messageId}/reactions/${encodedEmoji}`,
    );
  }

  /**
   * Get a channel
   */
  async getChannel(channelId: Snowflake): Promise<RESTGetAPIChannelResult> {
    return this.get(`/channels/${channelId}`);
  }

  /**
   * Modify a channel
   */
  async modifyChannel(
    channelId: Snowflake,
    options: RESTPatchAPIChannelJSONBody,
    reason?: string,
  ): Promise<RESTGetAPIChannelResult> {
    return this.patch(`/channels/${channelId}`, {
      body: options,
      reason,
    });
  }

  /**
   * Delete a channel
   */
  async deleteChannel(
    channelId: Snowflake,
    reason?: string,
  ): Promise<RESTGetAPIChannelResult> {
    return this.delete(`/channels/${channelId}`, { reason });
  }

  /**
   * Trigger typing indicator
   */
  async triggerTyping(channelId: Snowflake): Promise<void> {
    return this.post(`/channels/${channelId}/typing`);
  }

  /**
   * Get pinned messages
   */
  async getPinnedMessages(
    channelId: Snowflake,
  ): Promise<RESTGetAPIChannelMessageResult[]> {
    return this.get(`/channels/${channelId}/pins`);
  }

  /**
   * Pin a message
   */
  async pinMessage(
    channelId: Snowflake,
    messageId: Snowflake,
    reason?: string,
  ): Promise<void> {
    return this.put(`/channels/${channelId}/pins/${messageId}`, { reason });
  }

  /**
   * Unpin a message
   */
  async unpinMessage(
    channelId: Snowflake,
    messageId: Snowflake,
    reason?: string,
  ): Promise<void> {
    return this.delete(`/channels/${channelId}/pins/${messageId}`, { reason });
  }

  /**
   * Get a guild
   */
  async getGuild(
    guildId: Snowflake,
    withCounts?: boolean,
  ): Promise<RESTGetAPIGuildResult> {
    return this.get(`/guilds/${guildId}`, {
      query: withCounts ? { with_counts: true } : undefined,
    });
  }

  /**
   * Modify a guild
   */
  async modifyGuild(
    guildId: Snowflake,
    options: RESTPatchAPIGuildJSONBody,
    reason?: string,
  ): Promise<RESTGetAPIGuildResult> {
    return this.patch(`/guilds/${guildId}`, {
      body: options,
      reason,
    });
  }

  /**
   * Delete/leave a guild
   */
  async deleteGuild(guildId: Snowflake): Promise<void> {
    return this.delete(`/guilds/${guildId}`);
  }

  /**
   * Get guild channels
   */
  async getGuildChannels(
    guildId: Snowflake,
  ): Promise<RESTGetAPIChannelResult[]> {
    return this.get(`/guilds/${guildId}/channels`);
  }

  /**
   * Create guild channel
   */
  async createGuildChannel(
    guildId: Snowflake,
    options: RESTPostAPIGuildChannelJSONBody,
    reason?: string,
  ): Promise<RESTGetAPIChannelResult> {
    return this.post(`/guilds/${guildId}/channels`, {
      body: options,
      reason,
    });
  }

  /**
   * Get guild member
   */
  async getGuildMember(guildId: Snowflake, userId: Snowflake): Promise<any> {
    return this.get(`/guilds/${guildId}/members/${userId}`);
  }

  /**
   * List guild members
   */
  async listGuildMembers(
    guildId: Snowflake,
    options?: { limit?: number; after?: Snowflake },
  ): Promise<any[]> {
    return this.get(`/guilds/${guildId}/members`, {
      query: options as any,
    });
  }

  /**
   * Search guild members
   */
  async searchGuildMembers(
    guildId: Snowflake,
    query: string,
    limit?: number,
  ): Promise<any[]> {
    return this.get(`/guilds/${guildId}/members/search`, {
      query: { query, limit } as any,
    });
  }

  /**
   * Modify guild member
   */
  async modifyGuildMember(
    guildId: Snowflake,
    userId: Snowflake,
    options: RESTPatchAPIGuildMemberJSONBody,
    reason?: string,
  ): Promise<any> {
    return this.patch(`/guilds/${guildId}/members/${userId}`, {
      body: options,
      reason,
    });
  }

  /**
   * Add role to guild member
   */
  async addGuildMemberRole(
    guildId: Snowflake,
    userId: Snowflake,
    roleId: Snowflake,
    reason?: string,
  ): Promise<void> {
    return this.put(`/guilds/${guildId}/members/${userId}/roles/${roleId}`, {
      reason,
    });
  }

  /**
   * Remove role from guild member
   */
  async removeGuildMemberRole(
    guildId: Snowflake,
    userId: Snowflake,
    roleId: Snowflake,
    reason?: string,
  ): Promise<void> {
    return this.delete(`/guilds/${guildId}/members/${userId}/roles/${roleId}`, {
      reason,
    });
  }

  /**
   * Remove (kick) guild member
   */
  async removeGuildMember(
    guildId: Snowflake,
    userId: Snowflake,
    reason?: string,
  ): Promise<void> {
    return this.delete(`/guilds/${guildId}/members/${userId}`, { reason });
  }

  /**
   * Get guild bans
   */
  async getGuildBans(guildId: Snowflake): Promise<any[]> {
    return this.get(`/guilds/${guildId}/bans`);
  }

  /**
   * Get guild ban
   */
  async getGuildBan(guildId: Snowflake, userId: Snowflake): Promise<any> {
    return this.get(`/guilds/${guildId}/bans/${userId}`);
  }

  /**
   * Ban user from guild
   */
  async createGuildBan(
    guildId: Snowflake,
    userId: Snowflake,
    options?: { delete_message_days?: number; delete_message_seconds?: number },
    reason?: string,
  ): Promise<void> {
    return this.put(`/guilds/${guildId}/bans/${userId}`, {
      body: options,
      reason,
    });
  }

  /**
   * Unban user from guild
   */
  async removeGuildBan(
    guildId: Snowflake,
    userId: Snowflake,
    reason?: string,
  ): Promise<void> {
    return this.delete(`/guilds/${guildId}/bans/${userId}`, { reason });
  }

  /**
   * Get guild roles
   */
  async getGuildRoles(guildId: Snowflake): Promise<any[]> {
    return this.get(`/guilds/${guildId}/roles`);
  }

  /**
   * Create guild role
   */
  async createGuildRole(
    guildId: Snowflake,
    options: RESTPostAPIGuildRoleJSONBody,
    reason?: string,
  ): Promise<any> {
    return this.post(`/guilds/${guildId}/roles`, {
      body: options,
      reason,
    });
  }

  /**
   * Modify guild role
   */
  async modifyGuildRole(
    guildId: Snowflake,
    roleId: Snowflake,
    options: RESTPatchAPIGuildRoleJSONBody,
    reason?: string,
  ): Promise<any> {
    return this.patch(`/guilds/${guildId}/roles/${roleId}`, {
      body: options,
      reason,
    });
  }

  /**
   * Delete guild role
   */
  async deleteGuildRole(
    guildId: Snowflake,
    roleId: Snowflake,
    reason?: string,
  ): Promise<void> {
    return this.delete(`/guilds/${guildId}/roles/${roleId}`, { reason });
  }

  /**
   * Get current user
   */
  async getCurrentUser(): Promise<RESTGetAPIUserResult> {
    return this.get("/users/@me");
  }

  /**
   * Get a user
   */
  async getUser(userId: Snowflake): Promise<RESTGetAPIUserResult> {
    return this.get(`/users/${userId}`);
  }

  /**
   * Modify current user
   */
  async modifyCurrentUser(
    options: RESTPatchAPICurrentUserJSONBody,
  ): Promise<RESTGetAPIUserResult> {
    return this.patch("/users/@me", {
      body: options,
    });
  }

  /**
   * Get current user guilds
   */
  async getCurrentUserGuilds(options?: {
    before?: Snowflake;
    after?: Snowflake;
    limit?: number;
  }): Promise<any[]> {
    return this.get("/users/@me/guilds", {
      query: options as any,
    });
  }

  /**
   * Leave a guild
   */
  async leaveGuild(guildId: Snowflake): Promise<void> {
    return this.delete(`/users/@me/guilds/${guildId}`);
  }

  /**
   * Create DM channel
   */
  async createDM(
    recipientId: Snowflake,
  ): Promise<RESTPostAPICurrentUserCreateDMChannelResult> {
    return this.post("/users/@me/channels", {
      body: { recipient_id: recipientId },
    });
  }

  /**
   * Get guild emojis
   */
  async getGuildEmojis(guildId: Snowflake): Promise<any[]> {
    return this.get(`/guilds/${guildId}/emojis`);
  }

  /**
   * Get guild emoji
   */
  async getGuildEmoji(guildId: Snowflake, emojiId: Snowflake): Promise<any> {
    return this.get(`/guilds/${guildId}/emojis/${emojiId}`);
  }

  /**
   * Create guild emoji
   */
  async createGuildEmoji(
    guildId: Snowflake,
    options: RESTPostAPIGuildEmojiJSONBody,
    reason?: string,
  ): Promise<any> {
    return this.post(`/guilds/${guildId}/emojis`, {
      body: options,
      reason,
    });
  }

  /**
   * Modify guild emoji
   */
  async modifyGuildEmoji(
    guildId: Snowflake,
    emojiId: Snowflake,
    options: RESTPatchAPIGuildEmojiJSONBody,
    reason?: string,
  ): Promise<any> {
    return this.patch(`/guilds/${guildId}/emojis/${emojiId}`, {
      body: options,
      reason,
    });
  }

  /**
   * Delete guild emoji
   */
  async deleteGuildEmoji(
    guildId: Snowflake,
    emojiId: Snowflake,
    reason?: string,
  ): Promise<void> {
    return this.delete(`/guilds/${guildId}/emojis/${emojiId}`, { reason });
  }

  /**
   * Get invite
   */
  async getInvite(
    inviteCode: string,
    options?: { with_counts?: boolean; with_expiration?: boolean },
  ): Promise<any> {
    return this.get(`/invites/${inviteCode}`, {
      query: options as any,
    });
  }

  /**
   * Delete invite
   */
  async deleteInvite(inviteCode: string, reason?: string): Promise<any> {
    return this.delete(`/invites/${inviteCode}`, { reason });
  }

  /**
   * Get channel invites
   */
  async getChannelInvites(channelId: Snowflake): Promise<any[]> {
    return this.get(`/channels/${channelId}/invites`);
  }

  /**
   * Create channel invite
   */
  async createChannelInvite(
    channelId: Snowflake,
    options?: any,
    reason?: string,
  ): Promise<any> {
    return this.post(`/channels/${channelId}/invites`, {
      body: options,
      reason,
    });
  }

  /**
   * Start thread from message
   */
  async startThreadFromMessage(
    channelId: Snowflake,
    messageId: Snowflake,
    options: { name: string; auto_archive_duration?: number },
    reason?: string,
  ): Promise<any> {
    return this.post(`/channels/${channelId}/messages/${messageId}/threads`, {
      body: options,
      reason,
    });
  }

  /**
   * Start thread without message
   */
  async startThread(
    channelId: Snowflake,
    options: any,
    reason?: string,
  ): Promise<any> {
    return this.post(`/channels/${channelId}/threads`, {
      body: options,
      reason,
    });
  }

  /**
   * Join thread
   */
  async joinThread(channelId: Snowflake): Promise<void> {
    return this.put(`/channels/${channelId}/thread-members/@me`);
  }

  /**
   * Leave thread
   */
  async leaveThread(channelId: Snowflake): Promise<void> {
    return this.delete(`/channels/${channelId}/thread-members/@me`);
  }

  /**
   * Add thread member
   */
  async addThreadMember(
    channelId: Snowflake,
    userId: Snowflake,
  ): Promise<void> {
    return this.put(`/channels/${channelId}/thread-members/${userId}`);
  }

  /**
   * Remove thread member
   */
  async removeThreadMember(
    channelId: Snowflake,
    userId: Snowflake,
  ): Promise<void> {
    return this.delete(`/channels/${channelId}/thread-members/${userId}`);
  }

  /**
   * Get channel webhooks
   */
  async getChannelWebhooks(channelId: Snowflake): Promise<any[]> {
    return this.get(`/channels/${channelId}/webhooks`);
  }

  /**
   * Get guild webhooks
   */
  async getGuildWebhooks(guildId: Snowflake): Promise<any[]> {
    return this.get(`/guilds/${guildId}/webhooks`);
  }

  /**
   * Get webhook
   */
  async getWebhook(webhookId: Snowflake): Promise<any> {
    return this.get(`/webhooks/${webhookId}`);
  }

  /**
   * Create webhook
   */
  async createWebhook(
    channelId: Snowflake,
    options: { name: string; avatar?: string },
    reason?: string,
  ): Promise<any> {
    return this.post(`/channels/${channelId}/webhooks`, {
      body: options,
      reason,
    });
  }

  /**
   * Modify webhook
   */
  async modifyWebhook(
    webhookId: Snowflake,
    options: any,
    reason?: string,
  ): Promise<any> {
    return this.patch(`/webhooks/${webhookId}`, {
      body: options,
      reason,
    });
  }

  /**
   * Delete webhook
   */
  async deleteWebhook(webhookId: Snowflake, reason?: string): Promise<void> {
    return this.delete(`/webhooks/${webhookId}`, { reason });
  }

  /**
   * Execute webhook
   */
  async executeWebhook(
    webhookId: Snowflake,
    webhookToken: string,
    options: any,
    wait?: boolean,
  ): Promise<any> {
    return this.post(`/webhooks/${webhookId}/${webhookToken}`, {
      body: options,
      query: wait ? { wait: true } : undefined,
    });
  }
}
