/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * In development — I'm trying to get this work
 */

import { EventEmitter } from "node:events";
import WebSocket from "ws";
import {
  Snowflake,
  GatewayVoiceStateUpdateDispatchData,
  GatewayVoiceServerUpdateDispatchData,
} from "discord-api-types/v10";

/**
 * Voice connection states
 */
export enum VoiceConnectionStatus {
  SIGNALLING = "signalling",
  CONNECTING = "connecting",
  CONNECTED = "connected",
  DISCONNECTED = "disconnected",
  DESTROYED = "destroyed",
}

/**
 * Voice connection events
 */
export interface VoiceConnectionEvents {
  stateChange: [
    oldState: VoiceConnectionStatus,
    newState: VoiceConnectionStatus,
  ];
  ready: [void];
  error: [error: Error];
  disconnect: [void];
  speaking: [userId: Snowflake, speaking: boolean];
  debug: [message: string];
}

/**
 * Voice connection options
 */
export interface VoiceConnectionOptions {
  guildId: Snowflake;
  channelId: Snowflake;
  selfMute?: boolean;
  selfDeaf?: boolean;
  debug?: boolean;
}

/**
 * Voice UDP connection details
 */
interface VoiceUDPConnection {
  ip: string;
  port: number;
  ssrc: number;
  modes: string[];
}

/**
 * Manages a voice connection to a Discord voice channel
 */
export class VoiceConnection extends EventEmitter<VoiceConnectionEvents> {
  public guildId: Snowflake;
  public channelId: Snowflake;
  public selfMute: boolean;
  public selfDeaf: boolean;

  private status: VoiceConnectionStatus = VoiceConnectionStatus.SIGNALLING;
  private ws: WebSocket | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private sessionId: string | null = null;
  private token: string | null = null;
  private endpoint: string | null = null;
  private udpConnection: VoiceUDPConnection | null = null;
  private debugMode: boolean;

  private ssrc: number | null = null;
  private secretKey: Uint8Array | null = null;

  constructor(options: VoiceConnectionOptions) {
    super();

    this.guildId = options.guildId;
    this.channelId = options.channelId;
    this.selfMute = options.selfMute ?? false;
    this.selfDeaf = options.selfDeaf ?? false;
    this.debugMode = options.debug ?? false;
  }

  /**
   * Set voice server information (called by main gateway)
   */
  setServerUpdate(data: GatewayVoiceServerUpdateDispatchData): void {
    this.token = data.token;
    this.endpoint = data.endpoint;

    this.log(`Received voice server update: ${this.endpoint}`);
    if (this.sessionId && this.endpoint && this.token) {
      this.connectToVoiceWebSocket();
    }
  }

  /**
   * Set voice state information (called by main gateway)
   */
  setStateUpdate(data: GatewayVoiceStateUpdateDispatchData): void {
    this.sessionId = data.session_id;

    this.log(`Received voice state update: session ${this.sessionId}`);

    if (this.sessionId && this.endpoint && this.token) {
      this.connectToVoiceWebSocket();
    }
  }

  /**
   * Connect to Discord voice WebSocket
   */
  private connectToVoiceWebSocket(): void {
    if (!this.endpoint || !this.token || !this.sessionId) {
      throw new Error("Missing voice connection data");
    }

    this.updateStatus(VoiceConnectionStatus.CONNECTING);

    const wsUrl = `wss://${this.endpoint}?v=8`;
    this.log(`Connecting to voice WebSocket: ${wsUrl}`);

    this.ws = new WebSocket(wsUrl);
    this.ws.on("open", () => {
      this.log("Voice WebSocket opened");
      this.identify();
    });

    this.ws.on("message", (data) => {
      this.handleVoiceMessage(data);
    });

    this.ws.on("close", (code, reason) => {
      this.log(`Voice WebSocket closed: ${code} - ${reason.toString()}`);
      this.cleanup();
      this.updateStatus(VoiceConnectionStatus.DISCONNECTED);
      this.emit("disconnect");
    });

    this.ws.on("error", (error) => {
      this.log(`Voice WebSocket error: ${error.message}`);
      this.emit("error", error);
    });
  }

  /**
   * Handle incoming voice WebSocket messages
   */
  private handleVoiceMessage(data: WebSocket.Data): void {
    try {
      const payload = JSON.parse(data.toString());
      const { op, d } = payload;

      this.log(`Received voice opcode ${op}`);

      switch (op) {
        case 2:
          this.handleReady(d);
          break;

        case 4:
          this.handleSessionDescription(d);
          break;

        case 5:
          this.handleSpeaking(d);
          break;

        case 6:
          this.log("Received heartbeat ACK");
          break;

        case 8:
          this.handleHello(d);
          break;

        case 9:
          this.log("Voice session resumed");
          break;

        default:
          this.log(`Unknown voice opcode: ${op}`);
          break;
      }
    } catch (error) {
      this.emit("error", error as Error);
    }
  }

  /**
   * Send identify payload to voice server
   */
  private identify(): void {
    if (!this.ws || !this.token || !this.sessionId) return;

    const identifyPayload = {
      op: 0,
      d: {
        server_id: this.guildId,
        user_id: this.sessionId.split(":")[0],
        session_id: this.sessionId,
        token: this.token,
      },
    };

    this.log("Sending voice IDENTIFY");
    this.ws.send(JSON.stringify(identifyPayload));
  }

  /**
   * Handle HELLO opcode - start heartbeating
   */
  private handleHello(data: any): void {
    const { heartbeat_interval } = data;

    this.log(`Starting voice heartbeat with interval: ${heartbeat_interval}ms`);

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeat();
    }, heartbeat_interval);

    this.sendHeartbeat();
  }

  /**
   * Send heartbeat to voice server
   */
  private sendHeartbeat(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const heartbeatPayload = {
      op: 3,
      d: Date.now(),
    };

    this.log("Sending voice heartbeat");
    this.ws.send(JSON.stringify(heartbeatPayload));
  }

  /**
   * Handle READY opcode - UDP connection info
   */
  private handleReady(data: any): void {
    this.ssrc = data.ssrc;
    this.udpConnection = {
      ip: data.ip,
      port: data.port,
      ssrc: data.ssrc,
      modes: data.modes,
    };

    this.log(
      `Voice ready! SSRC: ${this.ssrc}, IP: ${this.udpConnection.ip}:${this.udpConnection.port}`,
    );

    const mode = this.udpConnection.modes.includes("xsalsa20_poly1305")
      ? "xsalsa20_poly1305"
      : this.udpConnection.modes[0];

    this.selectProtocol(mode);
  }

  /**
   * Select voice protocol and encryption mode
   */
  private selectProtocol(mode: string): void {
    if (!this.ws || !this.udpConnection) return;

    const selectProtocolPayload = {
      op: 1,
      d: {
        protocol: "udp",
        data: {
          address: this.udpConnection.ip,
          port: this.udpConnection.port,
          mode: mode,
        },
      },
    };

    this.log(`Selecting protocol: ${mode}`);
    this.ws.send(JSON.stringify(selectProtocolPayload));
  }

  /**
   * Handle SESSION_DESCRIPTION opcode - encryption key
   */
  private handleSessionDescription(data: any): void {
    this.secretKey = new Uint8Array(data.secret_key);

    this.log("Received session description with secret key");

    this.updateStatus(VoiceConnectionStatus.CONNECTED);
    this.emit("ready");
  }

  /**
   * Handle SPEAKING opcode - user speaking status
   */
  private handleSpeaking(data: any): void {
    const { user_id, speaking } = data;
    this.emit("speaking", user_id, speaking !== 0);
  }

  /**
   * Set speaking state
   */
  setSpeaking(speaking: boolean): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const speakingPayload = {
      op: 5,
      d: {
        speaking: speaking ? 1 : 0,
        delay: 0,
        ssrc: this.ssrc,
      },
    };

    this.log(`Setting speaking: ${speaking}`);
    this.ws.send(JSON.stringify(speakingPayload));
  }

  /**
   * Update connection status
   */
  private updateStatus(newStatus: VoiceConnectionStatus): void {
    const oldStatus = this.status;
    this.status = newStatus;

    if (oldStatus !== newStatus) {
      this.log(`Status changed: ${oldStatus} -> ${newStatus}`);
      this.emit("stateChange", oldStatus, newStatus);
    }
  }

  /**
   * Cleanup resources
   */
  private cleanup(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Disconnect from voice channel
   */
  disconnect(): void {
    this.log("Disconnecting from voice");
    this.cleanup();
    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws.close();
      this.ws = null;
    }

    this.updateStatus(VoiceConnectionStatus.DISCONNECTED);
    this.emit("disconnect");
  }

  /**
   * Destroy the voice connection completely
   */
  destroy(): void {
    this.disconnect();
    this.updateStatus(VoiceConnectionStatus.DESTROYED);
    this.removeAllListeners();
  }

  /**
   * Get current connection status
   */
  get connectionStatus(): VoiceConnectionStatus {
    return this.status;
  }

  /**
   * Check if connected
   */
  get isConnected(): boolean {
    return this.status === VoiceConnectionStatus.CONNECTED;
  }

  /**
   * Get UDP connection info (for audio streaming)
   */
  get udpInfo(): VoiceUDPConnection | null {
    return this.udpConnection;
  }

  /**
   * Get SSRC for this connection
   */
  get connectionSSRC(): number | null {
    return this.ssrc;
  }

  /**
   * Get secret key for encryption
   */
  get encryptionKey(): Uint8Array | null {
    return this.secretKey;
  }

  /**
   * Debug logging
   */
  private log(message: string): void {
    if (this.debugMode) {
      this.emit("debug", `[VOICE] ${message}`);
    }
  }
}

/**
 * Voice connection manager - manages multiple voice connections
 */
export class VoiceConnectionManager {
  private connections: Map<Snowflake, VoiceConnection> = new Map();

  /**
   * Create or get a voice connection for a guild
   */
  getOrCreate(options: VoiceConnectionOptions): VoiceConnection {
    const existing = this.connections.get(options.guildId);

    if (existing) {
      if (existing.channelId !== options.channelId) {
        existing.channelId = options.channelId;
      }
      return existing;
    }

    const connection = new VoiceConnection(options);
    this.connections.set(options.guildId, connection);

    connection.once("disconnect", () => {
      this.connections.delete(options.guildId);
    });

    return connection;
  }

  /**
   * Get an existing connection
   */
  get(guildId: Snowflake): VoiceConnection | undefined {
    return this.connections.get(guildId);
  }

  /**
   * Disconnect from a guild
   */
  disconnect(guildId: Snowflake): void {
    const connection = this.connections.get(guildId);
    if (connection) {
      connection.disconnect();
      this.connections.delete(guildId);
    }
  }

  /**
   * Disconnect from all guilds
   */
  disconnectAll(): void {
    for (const connection of this.connections.values()) {
      connection.disconnect();
    }
    this.connections.clear();
  }

  /**
   * Get all active connections
   */
  getAllConnections(): VoiceConnection[] {
    return Array.from(this.connections.values());
  }

  /**
   * Get connection count
   */
  get size(): number {
    return this.connections.size;
  }
}
