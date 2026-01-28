# Mystia

A lightweight, type-safe Discord API wrapper built from scratch with TypeScript.

## ⚠️ Work in Progress

This library is currently under development. Features may be incomplete or subject to change.

## Features

- ✅ Full TypeScript support with comprehensive type definitions
- ✅ WebSocket Gateway connection with automatic reconnection
- ✅ Complete REST API wrapper with rate limiting
- ✅ Message-based command handler system
- ✅ Structured message, channel, guild, and user objects
- 🚧 Voice connection support (in development)
- ✅ Event-driven architecture
- ✅ Built-in error handling and logging

## Installation

```bash
npm install mystia
```

## Quick Start

### Basic Bot

```typescript
import { Client, Intents } from "mystia";

const client = new Client({
  token: "YOUR_BOT_TOKEN",
  intents: Intents.GUILDS | Intents.GUILD_MESSAGES | Intents.MESSAGE_CONTENT,
  debug: true,
});

client.on("ready", (user) => {
  console.log(`Logged in as ${user.tag}`);
});

client.on("messageCreate", async (message) => {
  if (message.content === "!ping") {
    await message.reply("Pong!");
  }
});

client.run();
```

### Using Command Handler

```typescript
import {
  Client,
  Command,
  CommandContext,
  setupCommandHandler,
  Intents,
} from "mystia";

// Create a command
class PingCommand extends Command {
  constructor() {
    super({
      name: "ping",
      description: "Replies with Pong!",
      aliases: ["p"],
      cooldown: 3,
    });
  }

  async execute(context: CommandContext) {
    await context.message.reply("Pong! 🏓");
  }
}

// Setup client
const client = new Client({
  token: "YOUR_BOT_TOKEN",
  prefix: "!",
  intents: Intents.GUILDS | Intents.GUILD_MESSAGES | Intents.MESSAGE_CONTENT,
});

// Setup command handler
setupCommandHandler(client, {
  commandsPath: "./commands",
  ownerIds: ["YOUR_USER_ID"],
}).then(({ handler }) => {
  // Manually register commands
  handler.registerCommand(new PingCommand());

  // Handle messages
  client.on("messageCreate", async (message) => {
    const parsed = handler.parseMessage(message);
    if (parsed.isCommand && parsed.command) {
      // Execute command logic here
    }
  });
});

client.run();
```

## API Documentation

### Client

The main client class for connecting to Discord.

#### Constructor Options

```typescript
interface WSClientOptions {
  token: string; // Bot token
  prefix?: string; // Command prefix (default: '!')
  intents: number; // Gateway intents
  maxReconnectAttempts?: number; // Max reconnection attempts (default: 5)
  reconnectDelay?: number; // Delay between reconnects in ms (default: 1000)
  debug?: boolean; // Enable debug logging (default: false)
  gatewayUrl?: string; // Custom gateway URL
}
```

#### Events

- `ready` - Emitted when the client is ready
- `messageCreate` - Emitted when a message is created
- `messageUpdate` - Emitted when a message is updated
- `messageDelete` - Emitted when a message is deleted
- `guildCreate` - Emitted when the bot joins a guild
- `channelCreate` - Emitted when a channel is created
- `interactionCreate` - Emitted when an interaction is created
- `error` - Emitted when an error occurs
- `debug` - Emitted for debug messages (when debug mode is enabled)

### Intents

Pre-defined intent combinations:

```typescript
Intents.GUILDS; // Basic guild events
Intents.GUILD_MESSAGES; // Message events
Intents.MESSAGE_CONTENT; // Message content (privileged)
Intents.GUILD_MEMBERS; // Member events (privileged)
Intents.UNPRIVILEGED; // All unprivileged intents
Intents.PRIVILEGED; // All privileged intents
Intents.ALL; // All intents
```

### Message Object

```typescript
class Message {
  id: string;
  content: string;
  author: User;
  channel: ChannelResolvable;
  guild: GuildResolvable | null;

  // Methods
  reply(content: string | object): Promise<Message>;
  edit(content: string | object): Promise<Message>;
  delete(reason?: string): Promise<void>;
  react(emoji: string): Promise<void>;
  pin(reason?: string): Promise<void>;
  unpin(reason?: string): Promise<void>;
}
```

### Channel Object

```typescript
class Channel {
  id: string;
  name?: string;
  type: number;

  // Methods
  send(content: string | object): Promise<Message>;
  edit(options: object, reason?: string): Promise<Channel>;
  delete(reason?: string): Promise<void>;
  bulkDelete(messages: string[] | number, reason?: string): Promise<void>;
  startTyping(): Promise<void>;
}
```

### Guild Object

```typescript
class Guild {
  id: string;
  name: string;
  ownerId: string;

  // Methods
  fetch(): Promise<Guild>;
  getMembers(options?: object): Promise<any[]>;
  getMember(userId: string): Promise<any>;
  ban(userId: string, options?: object, reason?: string): Promise<void>;
  kick(userId: string, reason?: string): Promise<void>;
}
```

### Command System

#### Creating Commands

```typescript
import { Command, CommandContext } from "mystia";

class MyCommand extends Command {
  constructor() {
    super({
      name: "mycommand",
      description: "My custom command",
      aliases: ["mc", "mycmd"],
      category: "General",
      cooldown: 5, // Cooldown in seconds
      guildOnly: false, // Only works in guilds
      ownerOnly: false, // Only owner can use
      permissions: [], // Required permissions
      args: [
        // Argument configuration
        {
          name: "text",
          type: "string",
          required: true,
          description: "Text to echo",
        },
      ],
    });
  }

  async execute(context: CommandContext) {
    const { message, args } = context;
    await message.reply(`You said: ${args.join(" ")}`);
  }
}
```

#### Command Handler

```typescript
import { setupCommandHandler } from "mystia";

const handler = await setupCommandHandler(client, {
  commandsPath: path.join(__dirname, "commands"),
  ownerIds: [""],
});

// Register command
handler.registerCommand(new MyCommand());

// Get command
const command = handler.getCommand("mycommand");

// Parse message
const parsed = handler.parseMessage(message);

// Get all commands
const allCommands = handler.getAllCommands();
```

### API Client

Direct access to Discord REST API:

```typescript
// Send message
await client.api.sendMessage(channelId, { content: "Hello!" });

// Get message
const message = await client.api.getMessage(channelId, messageId);

// Edit message
await client.api.editMessage(channelId, messageId, { content: "Updated!" });

// Delete message
await client.api.deleteMessage(channelId, messageId);

// Get guild
const guild = await client.api.getGuild(guildId);

// Create role
const role = await client.api.createGuildRole(guildId, {
  name: "New Role",
  color: 0xff0000,
});
```

### Voice (Experimental)

```typescript
import { VoiceClient } from "mystia";

const client = new VoiceClient({
  token: "YOUR_BOT_TOKEN",
  intents: Intents.GUILDS | Intents.GUILD_VOICE_STATES,
});

// Join voice channel
const connection = await client.joinVoiceChannel({
  guildId: "guild-id",
  channelId: "channel-id",
  selfMute: false,
  selfDeaf: false,
});

// Leave voice channel
await client.leaveVoiceChannel("guild-id");
```

## Examples

### Complete Bot with Command Handler (JavaScript)

Here's a complete example showing how to set up a bot with the command handler:

**Project Structure:**

```
my-bot/
├── commands/
│   └── ping.js
├── .env
├── index.js
└── package.json
```

**index.js:**

```javascript
require("dotenv").config();

const path = require("node:path");
const { Client, Intents, setupCommandHandler, delay } = require("mystia");

const client = new Client({
  token: process.env.TOKEN,
  intents: Intents.ALL,
  prefix: "!",
});

async function initBot() {
  const { handler, loader } = await setupCommandHandler(client, {
    commandsPath: path.join(__dirname, "commands"),
    ownerIds: ["YOUR_USER_ID"],
  });

  client.on("ready", async (user) => {
    console.log(`Bot ready! Logged in as ${user.tag}`);
  });

  client.on("messageCreate", async (message) => {
    if (message.author.bot) return;

    const parsed = handler.parseMessage(message);
    if (!parsed.isCommand) return;

    if (!parsed.command) {
      const msg = await message.reply("This command doesn't exist.");
      await delay(2000);
      await msg.delete();
      return;
    }

    await parsed.command.execute({
      message,
      args: parsed.args,
      client,
      commandName: parsed.command.name,
    });
  });

  client.on("debug", console.info);
  client.run();
}

initBot();

process.on("uncaughtException", console.error);
process.on("unhandledRejection", console.error);
```

**commands/ping.js:**

```javascript
const { Command } = require("mystia");

class Ping extends Command {
  constructor() {
    super({
      name: "ping",
      description: "Replies with Pong!",
      aliases: ["pg", "pong"],
    });
  }

  async execute(data) {
    await data.message.reply("Pong! 🏓");
  }
}

module.exports = Ping;
```

**.env:**

```env
TOKEN=your_bot_token_here
```

**package.json:**

```json
{
  "name": "my-mystia-bot",
  "version": "1.0.0",
  "main": "index.js",
  "type": "commonjs",
  "dependencies": {
    "mystia": "^1.0.0",
    "dotenv": "^17.2.3"
  }
}
```

### Echo Bot (TypeScript)

```typescript
import { Client, Intents } from "mystia";

const client = new Client({
  token: process.env.BOT_TOKEN!,
  intents: Intents.GUILDS | Intents.GUILD_MESSAGES | Intents.MESSAGE_CONTENT,
  prefix: "!",
});

client.on("ready", (user) => {
  console.log(`${user.tag} is online!`);
});

client.on("messageCreate", async (message) => {
  if (message.isBot) return;

  if (message.content.startsWith("!echo ")) {
    const text = message.content.slice(6);
    await message.reply(text);
  }
});

client.run();
```

### Moderation Bot

```typescript
client.on("messageCreate", async (message) => {
  if (!message.guild) return;

  if (message.content === "!purge 10") {
    await message.channel.bulkDelete(10);
    await message.reply("Deleted 10 messages!");
  }

  if (message.content.startsWith("!ban ")) {
    const userId = message.content.split(" ")[1];
    await message.guild.ban(userId, undefined, "Banned by moderator");
    await message.reply("User banned!");
  }
});
```

### More Command Examples

**Info Command:**

```javascript
const { Command } = require("mystia");

class Info extends Command {
  constructor() {
    super({
      name: "info",
      description: "Shows bot information",
      category: "Utility",
    });
  }

  async execute({ message, client }) {
    const guilds = await client.api.getCurrentUserGuilds();
    await message.reply({
      embeds: [
        {
          title: "Bot Information",
          fields: [
            { name: "Servers", value: guilds.length.toString(), inline: true },
            {
              name: "Uptime",
              value: process.uptime().toFixed(0) + "s",
              inline: true,
            },
          ],
          color: 0x5865f2,
        },
      ],
    });
  }
}

module.exports = Info;
```

**User Info Command:**

```javascript
const { Command } = require("mystia");

class UserInfo extends Command {
  constructor() {
    super({
      name: "userinfo",
      description: "Shows user information",
      aliases: ["ui", "user"],
      guildOnly: true,
    });
  }

  async execute({ message, args }) {
    const userId = args[0] || message.author.id;
    const user = await message.client.api.getUser(userId);

    await message.reply({
      embeds: [
        {
          title: `User Info: ${user.username}`,
          thumbnail: {
            url: user.avatar
              ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`
              : null,
          },
          fields: [
            { name: "ID", value: user.id },
            { name: "Tag", value: `${user.username}#${user.discriminator}` },
            { name: "Bot", value: user.bot ? "Yes" : "No" },
          ],
        },
      ],
    });
  }
}

module.exports = UserInfo;
```

## Error Handling

```typescript
client.on("error", (error) => {
  console.error("Client error:", error);
});

// API errors
try {
  await client.api.sendMessage("invalid-id", { content: "test" });
} catch (error) {
  if (error instanceof DiscordAPIError) {
    console.log("API Error:", error.message);
    console.log("Status:", error.status);
    console.log("Code:", error.code);
  }
}
```

## Rate Limiting

The library automatically handles rate limiting with per-route buckets:

```typescript
// Rate limits are handled automatically
await client.api.sendMessage(channelId, { content: "Message 1" });
await client.api.sendMessage(channelId, { content: "Message 2" });
// If rate limited, requests will throw RateLimitError
```

## Development Status

- ✅ Gateway connection
- ✅ REST API
- ✅ Message/Channel/Guild structures
- ✅ Command handler
- ✅ Rate limiting
- 🚧 Voice connections (in progress)
- 📝 Slash commands (planned)
- 📝 Sharding (planned)

## Contributing

Contributions are welcome! This project is a learning exercise, so feel free to suggest improvements or report issues.

## License

ISC

## Acknowledgments

Built with:

- [discord-api-types](https://github.com/discordjs/discord-api-types) for TypeScript type definitions
- [ws](https://github.com/websockets/ws) for WebSocket connections

---

**Note**: This library is a personal project and not affiliated with Discord. It's built from scratch as a learning experience and alternative implementation.
