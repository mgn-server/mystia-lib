import {
  APIVersion,
  RESTPostAPIChannelMessageJSONBody,
} from "discord-api-types/v10";

export class BaseApi {
  token: string | null = null;
  api: string = "https://discord.com/api/v" + APIVersion;

  constructor(token: string) {
    this.token = token;
  }

  protected async get(endpoint: string, options?: RequestInit) {
    const request = await fetch(this.api + endpoint, {
      method: "GET",
      headers: {
        Authorization: `Bot ${this.token}`,
        ...options?.headers,
      },
      ...options,
    });
    return await request.json();
  }

  protected async post(endpoint: string, options?: RequestInit) {
    const request = await fetch(this.api + endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bot ${this.token}`,
        "Content-Type": "application/json",
        ...options?.headers,
      },
      ...options,
    });

    return await request.json();
  }
}

export class Api extends BaseApi {
  constructor(token: string) {
    super(token);
  }

  public async sendMessage(
    channel_id: string,
    options: RESTPostAPIChannelMessageJSONBody,
  ) {
    const response = await this.post(`/channels/${channel_id}/messages`, {
      body: JSON.stringify(options),
    });

    return response;
  }
}
