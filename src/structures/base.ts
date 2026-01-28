import { Api, Client } from "../index.js";

export class BaseStructure {
  protected client: Client;
  protected api: Api;

  constructor(client: Client) {
    this.client = client;
    this.api = client.api;
  }
}
