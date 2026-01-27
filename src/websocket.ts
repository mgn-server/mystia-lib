/* eslint-disable  @typescript-eslint/no-explicit-any */
import EventEmitter from "node:events";
import WebSocket from "ws";
import {
  APIBaseMessage,
  APIUser,
  GatewayMessageEventExtraFields,
  GatewayReadyDispatchData,
  GatewayReceivePayload,
  GatewaySendPayload,
  PresenceUpdateStatus,
} from "discord-api-types/v10";
import { Api } from "./api.js";

export interface Events {
  resumed: [void];
  ready: [user: APIUser];
  messageCreate: [message: GatewayMessageEventExtraFields & APIBaseMessage];
}
export class WSClient extends EventEmitter<Events> {
  token: string = "";
  ws: WebSocket | null = null;
  intents: number = 0;
  user: APIUser | null = null;
  api: Api = new Api(this.token);
  private gateway = "wss://gateway.discord.gg/?v=10&encoding=json";
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private sessionId: string | null = null;
  private sequence: number | null = null;
  private resumeGatewayUrl: string | null = null;
  private heartbeatAck: boolean = true;

  constructor(token: string, intents: number) {
    super();
    if (typeof token === "undefined") throw new Error("Token is missing.");
    if (typeof intents === "undefined") throw new Error("Intents are missing.");
    this.token = token;
    this.intents = intents;
    this.api = new Api(this.token);
  }
  run(): void {
    this.ws = new WebSocket(this.gateway);

    this.ws.on("open", () => {
      this.emit("debug", "[DEBUG] Stable connection...");
    });

    this.ws.on("message", (data) => {
      this.handleMessage(data);
    });

    this.ws.on("close", (code: number, reason: Buffer) => {
      this.emit(
        "debug",
        `[DEBUG] WebSocket closed: ${code} - ${reason.toString()}`,
      );
      this.cleanup();
      this.emit("disconnect", code, reason.toString());
    });

    this.ws.on("error", (error: Error) => {
      this.emit("error", error);
    });
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
          this.emit(
            "debug",
            `Received HELLO, heartbeat interval: ${d.heartbeat_interval}ms`,
          );
          this.startHeartbeat(d.heartbeat_interval);
          this.identify();
          break;

        case 0:
          this.handleDispatch(t!, d);
          break;

        case 1:
          this.emit("debug", "Server requested heartbeat");
          this.sendHeartbeat();
          break;

        case 7:
          this.emit("debug", "Server requested reconnect");
          this.reconnect();
          break;

        case 9:
          this.emit("debug", `Invalid session, resumable: ${d}`);
          this.sessionId = null;
          this.sequence = null;

          if (d) {
            setTimeout(() => this.resume(), 1000 + Math.random() * 4000);
          } else {
            setTimeout(() => this.identify(), 1000 + Math.random() * 4000);
          }
          break;

        case 11:
          this.heartbeatAck = true;
          this.emit("debug", "Received heartbeat ACK");
          break;

        default:
          this.emit("debug", `Unknown opcode: ${op}`);
      }
    } catch (error) {
      this.emit("error", new Error(`Failed to parse message: ${error}`));
    }
  }
  /*private handleMessage(data: WebSocket.Data): void {
        try {
            const payload: DiscordPayload = JSON.parse(data.toString());
            const { op, d, s, t } = payload;
            if (s !== null && s !== undefined) {
                this.sequence = s;
            }

            switch (op) {
                case 10:
                    this.emit('debug', `[DEBUG] Received HELLO, heartbeat interval: ${d.heartbeat_interval}ms`);
                    this.startHeartbeat(d.heartbeat_interval);
                    this.identify();
                    break;
                case 0:
                    this.handleDispatch(t!, d);
                    break;
                case 1:
                    this.emit('debug', '[DEBUG] Server requested heartbeat');
                    this.sendHeartbeat();
                    break;

                case 7:
                    this.emit('debug', '[DEBUG] Server requested reconnect');
                    this.reconnect();
                    break;
                case 9:
                    this.emit('debug', `[DEBUG] Invalid session, resumable: ${d}`);
                    this.sessionId = null;
                    this.sequence = null;

                    if (d) {

                        setTimeout(() => this.resume(), 1000 + Math.random() * 4000);
                    } else {

                        setTimeout(() => this.identify(), 1000 + Math.random() * 4000);
                    }
                    break;
                case 11:
                    this.heartbeatAck = true;
                    this.emit('debug', '[DEBUG] Received heartbeat ACK');
                    break;
                default:
                    this.emit('debug', `[DEBUG] Unknown opcode: ${op}`);
            }
        } catch (error) {
            this.emit('error', new Error(`Failed to parse message: ${error}`));
        }
    }*/
  private handleDispatch(eventName: string, data: any): void {
    this.emit("debug", `[DEBUG] Dispatching event: ${eventName}`);
    switch (eventName) {
      case "READY": {
        const readyData = data as GatewayReadyDispatchData;
        this.sessionId = readyData.session_id;
        this.resumeGatewayUrl = readyData.resume_gateway_url;
        this.user = readyData.user;
        this.emit("ready", readyData.user);
        break;
      }
      case "RESUMED": {
        this.emit("debug", "Session resumed successfully");
        this.emit("resumed");
        break;
      }
      case "MESSAGE_CREATE":
        this.emit(
          "messageCreate",
          data as GatewayMessageEventExtraFields & APIBaseMessage,
        );
        break;

      case "MESSAGE_UPDATE":
        this.emit("messageUpdate", data);
        break;

      case "MESSAGE_DELETE":
        this.emit("messageDelete", data);
        break;

      case "GUILD_CREATE":
        this.emit("guildCreate", data);
        break;

      case "GUILD_UPDATE":
        this.emit("guildUpdate", data);
        break;

      case "GUILD_DELETE":
        this.emit("guildDelete", data);
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

      case "CHANNEL_CREATE":
        this.emit("channelCreate", data);
        break;
      case "CHANNEL_UPDATE":
        this.emit("channelUpdate", data);
        break;

      case "CHANNEL_DELETE":
        this.emit("channelDelete", data);
        break;

      case "INTERACTION_CREATE":
        this.emit("interactionCreate", data);
        break;

      default:
        this.emit("raw", eventName, data);
        break;
    }
  }
  private identify(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.emit("debug", "[DEBUG] Cannot identify: WebSocket not open");
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
          device: "",
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
    this.emit("debug", "[DEBUG] Sending IDENTIFY");
    this.ws.send(JSON.stringify(identifyPayload));
  }
  private resume(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.emit("debug", "[DEBUG] Cannot resume: WebSocket not open");
      return;
    }

    if (!this.sessionId || this.sequence === null) {
      this.emit(
        "debug",
        "[DEBUG] Cannot resume: Missing session_id or sequence",
      );
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

    this.emit("debug", "[DEBUG] Sending RESUME");
    this.ws.send(JSON.stringify(resumePayload));
  }
  private startHeartbeat(interval: number): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    this.emit(
      "debug",
      `[DEBUG] Starting heartbeat with interval: ${interval}ms`,
    );
    setTimeout(() => this.sendHeartbeat(), interval * Math.random());

    this.heartbeatInterval = setInterval(() => {
      if (!this.heartbeatAck) {
        this.emit(
          "debug",
          "[DEBUG] Heartbeat ACK not received, reconnecting...",
        );
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

    this.emit("debug", `[DEBUG] Sending heartbeat (seq: ${this.sequence})`);
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
    this.emit("debug", "[DEBUG] Reconnecting...");
    this.cleanup();
    this.run();
  }
  disconnect(): void {
    this.emit("debug", "[DEBUG] Disconnecting...");
    this.cleanup();

    if (this.ws) {
      this.ws.close(1000, "Client disconnect");
      this.ws = null;
    }

    this.sessionId = null;
    this.sequence = null;
    this.user = null;
    this.resumeGatewayUrl = null;
  }
  get isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
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
