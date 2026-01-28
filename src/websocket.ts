/* eslint-disable @typescript-eslint/no-explicit-any */
import EventEmitter from "node:events";
import WebSocket from "ws";
import {
  ApplicationCommandType,
  GatewayReadyDispatchData,
  GatewayReceivePayload,
  GatewaySendPayload,
  PresenceUpdateStatus,
  Snowflake,
} from "discord-api-types/v10";
import { Api } from "./api.js";
import {
  Message,
  Channel,
  Guild,
  User,
  VoiceConnectionManager,
  VoiceConnection,
} from "./structures/index.js";
import path from "node:path";
import { readdirSync } from "node:fs";

export interface Events {
  debug: [message: string];
  error: [error: Error];
  disconnect: [code: number, reason: string];
  resumed: [void];
  ready: [user: User];

  messageCreate: [message: Message];
  messageUpdate: [message: Message];
  messageDelete: [data: { id: string; channelId: string; guildId?: string }];
  guildCreate: [guild: Guild];
  guildUpdate: [guild: Guild];
  guildDelete: [guild: { id: string; unavailable?: boolean }];
  channelCreate: [channel: Channel];
  channelUpdate: [channel: Channel];
  channelDelete: [channel: Channel];
  guildMemberAdd: [member: any];
  guildMemberUpdate: [member: any];
  guildMemberRemove: [member: any];
  interactionCreate: [interaction: any];
  messageReactionAdd: [reaction: any];
  messageReactionRemove: [reaction: any];
  messageReactionRemoveAll: [data: any];
  messageReactionRemoveEmoji: [data: any];
  typingStart: [typing: any];
  voiceStateUpdate: [voiceState: any];
  presenceUpdate: [presence: any];
  guildBanAdd: [ban: any];
  guildBanRemove: [ban: any];
  guildRoleCreate: [role: any];
  guildRoleUpdate: [role: any];
  guildRoleDelete: [role: any];
  inviteCreate: [invite: any];
  inviteDelete: [invite: any];
  webhooksUpdate: [data: any];
  stageInstanceCreate: [stageInstance: any];
  stageInstanceUpdate: [stageInstance: any];
  stageInstanceDelete: [stageInstance: any];
  threadCreate: [thread: any];
  threadUpdate: [thread: any];
  threadDelete: [thread: any];
  threadListSync: [data: any];
  threadMemberUpdate: [member: any];
  threadMembersUpdate: [data: any];
  guildScheduledEventCreate: [event: any];
  guildScheduledEventUpdate: [event: any];
  guildScheduledEventDelete: [event: any];
  guildScheduledEventUserAdd: [data: any];
  guildScheduledEventUserRemove: [data: any];
  integrationCreate: [integration: any];
  integrationUpdate: [integration: any];
  integrationDelete: [integration: any];
  autoModerationRuleCreate: [rule: any];
  autoModerationRuleUpdate: [rule: any];
  autoModerationRuleDelete: [rule: any];
  autoModerationActionExecution: [execution: any];
  raw: [eventName: string, data: any];
}

export interface WSClientOptions {
  token: string;
  prefix?: string;
  intents: number;
  maxReconnectAttempts?: number;
  reconnectDelay?: number;
  debug?: boolean;
  gatewayUrl?: string;
}

/**
 * Options for joining a voice channel
 */
export interface JoinVoiceChannelOptions {
  guildId: Snowflake;
  channelId: Snowflake;
  selfMute?: boolean;
  selfDeaf?: boolean;
}
export interface MessageCommand {
  data: {
    name: string;
    description: string;
    aliases?: string[];
  };
  execute: (message: Message) => void;
}
export class Client extends EventEmitter<Events> {
  public token: string;
  public ws: WebSocket | null = null;
  public intents: number;
  public user: User | null = null;
  public api: Api;
  public slash: Map<string, ApplicationCommandType> = new Map();
  public commands: Map<string, MessageCommand> = new Map();
  public prefix: string = "!";

  private gateway: string;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private sessionId: string | null = null;
  private sequence: number | null = null;
  private resumeGatewayUrl: string | null = null;
  private heartbeatAck: boolean = true;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number;
  private reconnectDelay: number;
  protected debugMode: boolean;

  constructor(options: WSClientOptions) {
    super();

    if (!options.token) {
      throw new Error("Token is required.");
    }
    if (options.intents === undefined) {
      throw new Error("Intents are required.");
    }

    this.prefix = options.prefix ?? "!";
    this.token = options.token;
    this.intents = options.intents;
    this.maxReconnectAttempts = options.maxReconnectAttempts ?? 5;
    this.reconnectDelay = options.reconnectDelay ?? 1000;
    this.debugMode = options.debug ?? false;
    this.gateway =
      options.gatewayUrl ?? "wss://gateway.discord.gg/?v=10&encoding=json";
    this.api = new Api(this.token);
  }

  run(): void {
    this.ws = new WebSocket(this.resumeGatewayUrl ?? this.gateway);

    this.ws.on("open", () => {
      this.log("Stable connection established");
      this.reconnectAttempts = 0;
    });

    this.ws.on("message", (data) => {
      this.handleMessage(data);
    });

    this.ws.on("close", (code: number, reason: Buffer) => {
      this.log(`WebSocket closed: ${code} - ${reason.toString()}`);
      this.cleanup();
      this.emit("disconnect", code, reason.toString());

      if (this.shouldReconnect(code)) {
        this.attemptReconnect();
      }
    });

    this.ws.on("error", (error: Error) => {
      this.emit("error", error);
    });
  }

  log(message: string): void {
    if (this.debugMode) {
      this.emit("debug", `[DEBUG] ${message}`);
    }
  }

  private shouldReconnect(code: number): boolean {
    const nonRecoverableCodes = [4004, 4010, 4011, 4012, 4013, 4014];
    return (
      !nonRecoverableCodes.includes(code) &&
      this.reconnectAttempts < this.maxReconnectAttempts
    );
  }

  private attemptReconnect(): void {
    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

    this.log(
      `Attempting reconnect ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`,
    );

    setTimeout(() => {
      if (this.sessionId && this.sequence !== null) {
        this.log("Attempting to resume session");
        this.run();
      } else {
        this.log("Starting new session");
        this.run();
      }
    }, delay);
  }

  private handleMessage(data: WebSocket.Data): void {
    try {
      const payload: GatewayReceivePayload = JSON.parse(data.toString());
      const { op, d, s, t } = payload;

      if (s !== null && s !== undefined) {
        this.sequence = s;
      }

      switch (op) {
        case 10:
          this.log(
            `Received HELLO, heartbeat interval: ${d.heartbeat_interval}ms`,
          );
          this.startHeartbeat(d.heartbeat_interval);

          if (this.sessionId && this.sequence !== null) {
            this.resume();
          } else {
            this.identify();
          }
          break;

        case 0:
          this.handleDispatch(t!, d);
          break;

        case 1:
          this.log("Server requested heartbeat");
          this.sendHeartbeat();
          break;

        case 7:
          this.log("Server requested reconnect");
          this.reconnect();
          break;

        case 9:
          this.log("Invalid session");
          this.sessionId = null;
          this.sequence = null;
          setTimeout(() => this.identify(), 1000 + Math.random() * 4000);
          break;

        case 11:
          this.heartbeatAck = true;
          this.log("Received heartbeat ACK");
          break;

        default:
          this.log(`Unknown opcode: ${op}`);
          break;
      }
    } catch (error) {
      this.emit("error", error as Error);
    }
  }

  private handleDispatch(eventName: string, data: any): void {
    this.emit("raw", eventName, data);

    switch (eventName) {
      case "READY": {
        const readyData = data as GatewayReadyDispatchData;
        this.sessionId = readyData.session_id;
        this.resumeGatewayUrl = readyData.resume_gateway_url;
        this.user = new User(this, readyData.user);
        this.log(`Ready! Logged in as ${this.user.tag}`);
        this.emit("ready", this.user);
        break;
      }

      case "RESUMED":
        this.log("Session resumed");
        this.emit("resumed");
        break;

      case "MESSAGE_CREATE":
        this.emit("messageCreate", new Message(this, data));
        break;

      case "MESSAGE_UPDATE":
        this.emit("messageUpdate", new Message(this, data));
        break;

      case "MESSAGE_DELETE":
        this.emit("messageDelete", {
          id: data.id,
          channelId: data.channel_id,
          guildId: data.guild_id,
        });
        break;

      case "GUILD_CREATE":
        this.emit("guildCreate", new Guild(this, data));
        break;

      case "GUILD_UPDATE":
        this.emit("guildUpdate", new Guild(this, data));
        break;

      case "GUILD_DELETE":
        this.emit("guildDelete", {
          id: data.id,
          unavailable: data.unavailable,
        });
        break;

      case "CHANNEL_CREATE":
        this.emit("channelCreate", new Channel(this, data));
        break;

      case "CHANNEL_UPDATE":
        this.emit("channelUpdate", new Channel(this, data));
        break;

      case "CHANNEL_DELETE":
        this.emit("channelDelete", new Channel(this, data));
        break;

      case "GUILD_MEMBER_ADD":
        this.emit("guildMemberAdd", data);
        break;

      case "GUILD_MEMBER_UPDATE":
        this.emit("guildMemberUpdate", data);
        break;

      case "GUILD_MEMBER_REMOVE":
        this.emit("guildMemberRemove", data);
        break;

      case "INTERACTION_CREATE":
        this.emit("interactionCreate", data);
        break;

      case "MESSAGE_REACTION_ADD":
        this.emit("messageReactionAdd", data);
        break;

      case "MESSAGE_REACTION_REMOVE":
        this.emit("messageReactionRemove", data);
        break;

      case "MESSAGE_REACTION_REMOVE_ALL":
        this.emit("messageReactionRemoveAll", data);
        break;

      case "MESSAGE_REACTION_REMOVE_EMOJI":
        this.emit("messageReactionRemoveEmoji", data);
        break;

      case "TYPING_START":
        this.emit("typingStart", data);
        break;

      case "VOICE_STATE_UPDATE":
        this.emit("voiceStateUpdate", data);
        break;

      case "PRESENCE_UPDATE":
        this.emit("presenceUpdate", data);
        break;

      case "GUILD_BAN_ADD":
        this.emit("guildBanAdd", data);
        break;

      case "GUILD_BAN_REMOVE":
        this.emit("guildBanRemove", data);
        break;

      case "GUILD_ROLE_CREATE":
        this.emit("guildRoleCreate", data);
        break;

      case "GUILD_ROLE_UPDATE":
        this.emit("guildRoleUpdate", data);
        break;

      case "GUILD_ROLE_DELETE":
        this.emit("guildRoleDelete", data);
        break;

      default:
        this.log(`Unhandled event: ${eventName}`);
        break;
    }
  }

  private identify(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.log("Cannot identify: WebSocket not open");
      return;
    }

    const identifyPayload: GatewaySendPayload = {
      op: 2,
      d: {
        token: this.token,
        intents: this.intents,
        properties: {
          os: process.platform,
          browser: "mystia-client",
          device: "mystia-client",
        },
        compress: false,
        large_threshold: 250,
        presence: {
          status: PresenceUpdateStatus.Online,
          since: 0,
          afk: false,
          activities: [],
        },
      },
    };

    this.log("Sending IDENTIFY");
    this.ws.send(JSON.stringify(identifyPayload));
  }

  private resume(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.log("Cannot resume: WebSocket not open");
      return;
    }

    if (!this.sessionId || this.sequence === null) {
      this.log("Cannot resume: Missing session_id or sequence");
      this.identify();
      return;
    }

    const resumePayload: GatewaySendPayload = {
      op: 6,
      d: {
        token: this.token,
        session_id: this.sessionId,
        seq: this.sequence,
      },
    };

    this.log("Sending RESUME");
    this.ws.send(JSON.stringify(resumePayload));
  }

  private startHeartbeat(interval: number): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    this.log(`Starting heartbeat with interval: ${interval}ms`);
    setTimeout(() => this.sendHeartbeat(), interval * Math.random());

    this.heartbeatInterval = setInterval(() => {
      if (!this.heartbeatAck) {
        this.log("Heartbeat ACK not received, reconnecting...");
        this.reconnect();
        return;
      }

      this.heartbeatAck = false;
      this.sendHeartbeat();
    }, interval);
  }

  private sendHeartbeat(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    const heartbeatPayload: GatewaySendPayload = {
      op: 1,
      d: this.sequence,
    };

    this.log(`Sending heartbeat (seq: ${this.sequence})`);
    this.ws.send(JSON.stringify(heartbeatPayload));
  }

  private cleanup(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    this.heartbeatAck = true;
  }

  private reconnect(): void {
    this.log("Reconnecting...");
    this.cleanup();

    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws.close();
    }

    this.run();
  }

  updatePresence(presence: {
    status: PresenceUpdateStatus;
    activities?: any[];
    afk?: boolean;
    since?: number;
  }): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.log("Cannot update presence: WebSocket not open");
      return;
    }

    const presencePayload: GatewaySendPayload = {
      op: 3,
      d: {
        status: presence.status,
        activities: presence.activities ?? [],
        afk: presence.afk ?? false,
        since: presence.since ?? 0,
      },
    };

    this.log("Updating presence");
    this.ws.send(JSON.stringify(presencePayload));
  }

  disconnect(): void {
    this.log("Disconnecting...");
    this.cleanup();

    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws.close(1000, "Client disconnect");
      this.ws = null;
    }

    this.sessionId = null;
    this.sequence = null;
    this.user = null;
    this.resumeGatewayUrl = null;
    this.reconnectAttempts = 0;
  }

  get isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  get sessionInfo(): {
    sessionId: string | null;
    sequence: number | null;
    resumeGatewayUrl: string | null;
  } {
    return {
      sessionId: this.sessionId,
      sequence: this.sequence,
      resumeGatewayUrl: this.resumeGatewayUrl,
    };
  }
  public handleCommands(dir: string) {
    const foldersPath = path.join(__dirname, dir);
    const commandFolders = readdirSync(foldersPath);
    for (const folder of commandFolders) {
      const commandsPath = path.join(foldersPath, folder);
      const commandFiles = readdirSync(commandsPath).filter((file) =>
        file.endsWith(".js"),
      );
      for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath);

        if ("data" in command && "execute" in command) {
          this.commands.set(command.data.name, command);
        } else {
          console.log(
            `[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`,
          );
        }
      }
    }
  }
}

/**
 * In development — Trying to get this work (voice connection timeout error)
 * WebSocket client with voice support
 */
export class VoiceClient extends Client {
  public voice: VoiceConnectionManager;

  constructor(options: WSClientOptions) {
    super(options);
    this.voice = new VoiceConnectionManager();
    this.on("raw", (eventName, data) => {
      if (eventName === "VOICE_STATE_UPDATE") {
        this.handleVoiceStateUpdate(data);
      } else if (eventName === "VOICE_SERVER_UPDATE") {
        this.handleVoiceServerUpdate(data);
      }
    });
  }

  /**
   * Join a voice channel
   * @example
   * const connection = await client.joinVoiceChannel({
   *   guildId: "123",
   *   channelId: "456",
   *   selfMute: false,
   *   selfDeaf: false
   * });
   */
  async joinVoiceChannel(
    options: JoinVoiceChannelOptions,
  ): Promise<VoiceConnection> {
    const connection = this.voice.getOrCreate({
      ...options,
      debug: this.debugMode,
    });

    this.sendVoiceStateUpdate({
      guild_id: options.guildId,
      channel_id: options.channelId,
      self_mute: options.selfMute ?? false,
      self_deaf: options.selfDeaf ?? false,
    });

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Voice connection timeout"));
      }, 10000);

      connection.once("ready", () => {
        clearTimeout(timeout);
        resolve(connection);
      });

      connection.once("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  /**
   * Leave a voice channel
   * @example
   * await client.leaveVoiceChannel("123");
   */
  async leaveVoiceChannel(guildId: Snowflake): Promise<void> {
    const connection = this.voice.get(guildId);

    if (connection) {
      this.sendVoiceStateUpdate({
        guild_id: guildId,
        channel_id: null,
        self_mute: false,
        self_deaf: false,
      });

      connection.disconnect();
    }
  }

  /**
   * Leave all voice channels
   */
  async leaveAllVoiceChannels(): Promise<void> {
    const connections = this.voice.getAllConnections();

    for (const connection of connections) {
      await this.leaveVoiceChannel(connection.guildId);
    }
  }

  /**
   * Get voice connection for a guild
   */
  getVoiceConnection(guildId: Snowflake): VoiceConnection | undefined {
    return this.voice.get(guildId);
  }

  /**
   * Check if bot is in a voice channel in a guild
   */
  isInVoiceChannel(guildId: Snowflake): boolean {
    const connection = this.voice.get(guildId);
    return connection?.isConnected ?? false;
  }

  /**
   * Send voice state update to Discord gateway
   */
  private sendVoiceStateUpdate(data: {
    guild_id: Snowflake;
    channel_id: Snowflake | null;
    self_mute: boolean;
    self_deaf: boolean;
  }): void {
    if (!this.ws || this.ws.readyState !== 1) {
      throw new Error("WebSocket not connected");
    }

    const payload = {
      op: 4,
      d: data,
    };

    this.log(`Sending voice state update: ${JSON.stringify(data)}`);
    this.ws.send(JSON.stringify(payload));
  }

  /**
   * Handle VOICE_STATE_UPDATE event
   */
  private handleVoiceStateUpdate(data: any): void {
    if (data.user_id === this.user?.id) {
      this.log(`Voice state update for our bot`);

      const connection = this.voice.get(data.guild_id);
      if (connection) {
        connection.setStateUpdate(data);
      }
    }
  }

  /**
   * Handle VOICE_SERVER_UPDATE event
   */
  private handleVoiceServerUpdate(data: any): void {
    this.log(`Voice server update for guild ${data.guild_id}`);

    const connection = this.voice.get(data.guild_id);
    if (connection) {
      connection.setServerUpdate(data);
    }
  }

  /**
   * Override disconnect to also disconnect voice
   */
  override disconnect(): void {
    this.voice.disconnectAll();
    super.disconnect();
  }
  /**
   * Log helper (for voice)
   */
  override log(message: string): void {
    if (this.debugMode) {
      this.emit("debug", `[VOICE] ${message}`);
    }
  }
}

export enum Intents {
  GUILDS = 1 << 0,
  GUILD_MEMBERS = 1 << 1,
  GUILD_MODERATION = 1 << 2,
  GUILD_EXPRESSIONS = 1 << 3,
  GUILD_INTEGRATIONS = 1 << 4,
  GUILD_WEBHOOKS = 1 << 5,
  GUILD_INVITES = 1 << 6,
  GUILD_VOICE_STATES = 1 << 7,
  GUILD_PRESENCES = 1 << 8,
  GUILD_MESSAGES = 1 << 9,
  GUILD_MESSAGE_REACTIONS = 1 << 10,
  GUILD_MESSAGE_TYPING = 1 << 11,
  DIRECT_MESSAGES = 1 << 12,
  DIRECT_MESSAGE_REACTIONS = 1 << 13,
  DIRECT_MESSAGE_TYPING = 1 << 14,
  MESSAGE_CONTENT = 1 << 15,
  GUILD_SCHEDULED_EVENTS = 1 << 16,
  AUTO_MODERATION_CONFIGURATION = 1 << 20,
  AUTO_MODERATION_EXECUTION = 1 << 21,
  GUILD_MESSAGE_POLLS = 1 << 24,
  DIRECT_MESSAGE_POLLS = 1 << 25,

  UNPRIVILEGED = GUILDS |
    GUILD_MODERATION |
    GUILD_EXPRESSIONS |
    GUILD_INTEGRATIONS |
    GUILD_WEBHOOKS |
    GUILD_INVITES |
    GUILD_VOICE_STATES |
    GUILD_MESSAGES |
    GUILD_MESSAGE_REACTIONS |
    GUILD_MESSAGE_TYPING |
    DIRECT_MESSAGES |
    DIRECT_MESSAGE_REACTIONS |
    DIRECT_MESSAGE_TYPING |
    GUILD_SCHEDULED_EVENTS |
    AUTO_MODERATION_CONFIGURATION |
    AUTO_MODERATION_EXECUTION |
    GUILD_MESSAGE_POLLS |
    DIRECT_MESSAGE_POLLS,

  PRIVILEGED = GUILD_MEMBERS | GUILD_PRESENCES | MESSAGE_CONTENT,
  ALL = UNPRIVILEGED | PRIVILEGED,
}
