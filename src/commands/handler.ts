/* eslint-disable @typescript-eslint/no-explicit-any */
import { Client, Message } from "../index.js";

/**
 * Command execution context
 */
export interface CommandContext {
  message: Message;
  args: string[];
  client: Client;
  commandName: string;
}

/**
 * Command options
 */
export interface CommandOptions {
  /** Command name */
  name: string;

  /** Command description */
  description: string;

  /** Command aliases */
  aliases?: string[];

  /** Command category */
  category?: string;

  /** Usage examples */
  usage?: string;

  /** Cooldown in seconds */
  cooldown?: number;

  /** Required permissions (user) */
  permissions?: string[];

  /** Required bot permissions */
  botPermissions?: string[];

  /** Guild only command */
  guildOnly?: boolean;

  /** DM only command */
  dmOnly?: boolean;

  /** Owner only command */
  ownerOnly?: boolean;

  /** NSFW only command */
  nsfw?: boolean;

  /** Arguments configuration */
  args?: ArgumentConfig[];

  /** Whether command is enabled */
  enabled?: boolean;
}

/**
 * Argument configuration
 */
export interface ArgumentConfig {
  name: string;
  type: "string" | "number" | "boolean" | "user" | "channel" | "role";
  required?: boolean;
  default?: any;
  description?: string;
}

/**
 * Command execution result
 */
export interface CommandExecutionResult {
  success: boolean;
  error?: string;
  cooldownTimeLeft?: number;
}

/**
 * Base Command class
 */
export abstract class Command {
  public name: string;
  public description: string;
  public aliases: string[];
  public category: string;
  public usage: string;
  public cooldown: number;
  public permissions: string[];
  public botPermissions: string[];
  public guildOnly: boolean;
  public dmOnly: boolean;
  public ownerOnly: boolean;
  public nsfw: boolean;
  public args: ArgumentConfig[];
  public enabled: boolean;

  constructor(options: CommandOptions) {
    this.name = options.name;
    this.description = options.description;
    this.aliases = options.aliases ?? [];
    this.category = options.category ?? "General";
    this.usage = options.usage ?? "";
    this.cooldown = options.cooldown ?? 0;
    this.permissions = options.permissions ?? [];
    this.botPermissions = options.botPermissions ?? [];
    this.guildOnly = options.guildOnly ?? false;
    this.dmOnly = options.dmOnly ?? false;
    this.ownerOnly = options.ownerOnly ?? false;
    this.nsfw = options.nsfw ?? false;
    this.args = options.args ?? [];
    this.enabled = options.enabled ?? true;
  }

  /**
   * Execute the command
   */
  abstract execute(context: CommandContext): Promise<void> | void;

  /**
   * Validate arguments
   */
  validateArgs(args: string[]): { valid: boolean; error?: string } {
    const requiredArgs = this.args.filter((arg) => arg.required);

    if (args.length < requiredArgs.length) {
      return {
        valid: false,
        error: `Missing required arguments. Usage: \`${this.usage}\``,
      };
    }

    return { valid: true };
  }
}

/**
 * Cooldown manager
 */
export class CooldownManager {
  private cooldowns: Map<string, Map<string, number>> = new Map();

  /**
   * Check if user is on cooldown
   */
  isOnCooldown(
    commandName: string,
    userId: string,
  ): { onCooldown: boolean; timeLeft?: number } {
    if (!this.cooldowns.has(commandName)) {
      return { onCooldown: false };
    }

    const timestamps = this.cooldowns.get(commandName)!;
    const now = Date.now();

    if (timestamps.has(userId)) {
      const expirationTime = timestamps.get(userId)!;

      if (now < expirationTime) {
        const timeLeft = (expirationTime - now) / 1000;
        return { onCooldown: true, timeLeft };
      }
    }

    return { onCooldown: false };
  }

  /**
   * Set cooldown for user
   */
  setCooldown(
    commandName: string,
    userId: string,
    cooldownSeconds: number,
  ): void {
    if (!this.cooldowns.has(commandName)) {
      this.cooldowns.set(commandName, new Map());
    }

    const timestamps = this.cooldowns.get(commandName)!;
    const expirationTime = Date.now() + cooldownSeconds * 1000;
    timestamps.set(userId, expirationTime);

    setTimeout(() => {
      timestamps.delete(userId);
    }, cooldownSeconds * 1000);
  }

  /**
   * Clear cooldown for user
   */
  clearCooldown(commandName: string, userId: string): void {
    if (this.cooldowns.has(commandName)) {
      this.cooldowns.get(commandName)!.delete(userId);
    }
  }

  /**
   * Clear all cooldowns for a command
   */
  clearCommandCooldowns(commandName: string): void {
    this.cooldowns.delete(commandName);
  }

  /**
   * Clear all cooldowns
   */
  clearAllCooldowns(): void {
    this.cooldowns.clear();
  }
}

/**
 * Command Handler
 */
export class CommandHandler {
  private client: Client;
  private commands: Map<string, Command> = new Map();
  private aliases: Map<string, string> = new Map();
  private categories: Map<string, Command[]> = new Map();
  private cooldowns: CooldownManager = new CooldownManager();
  private ownerIds: string[] = [];

  constructor(client: Client, ownerIds: string[] = []) {
    this.client = client;
    this.ownerIds = ownerIds;
  }

  /**
   * Register a command
   */
  registerCommand(command: Command): void {
    this.commands.set(command.name.toLowerCase(), command);

    for (const alias of command.aliases) {
      this.aliases.set(alias.toLowerCase(), command.name.toLowerCase());
    }

    if (!this.categories.has(command.category)) {
      this.categories.set(command.category, []);
    }
    this.categories.get(command.category)!.push(command);
    this.client.log(`Registered command: ${command.name}`);
  }

  /**
   * Unregister a command
   */
  unregisterCommand(commandName: string): boolean {
    const command = this.commands.get(commandName.toLowerCase());
    if (!command) return false;

    this.commands.delete(commandName.toLowerCase());

    for (const alias of command.aliases) {
      this.aliases.delete(alias.toLowerCase());
    }

    const categoryCommands = this.categories.get(command.category);
    if (categoryCommands) {
      const index = categoryCommands.indexOf(command);
      if (index > -1) {
        categoryCommands.splice(index, 1);
      }
    }

    this.client.log(`Unregistered command: ${commandName}`);
    return true;
  }

  /**
   * Get a command
   */
  getCommand(nameOrAlias: string): Command | undefined {
    const name = nameOrAlias.toLowerCase();
    const aliasTarget = this.aliases.get(name);
    return this.commands.get(aliasTarget ?? name);
  }

  /**
   * Get all commands
   */
  getAllCommands(): Command[] {
    return Array.from(this.commands.values());
  }

  /**
   * Get commands by category
   */
  getCommandsByCategory(category: string): Command[] {
    return this.categories.get(category) ?? [];
  }

  /**
   * Get all categories
   */
  getCategories(): string[] {
    return Array.from(this.categories.keys());
  }

  // Start of vibe coded coding (I was too lazy to think of things to implement)
  /**
   * Handle a message - NOVA FUNÇÃO MANUAL
   * O programador deve chamar isso explicitamente
   *
   * @example
   * client.on("messageCreate", async (message) => {
   *   await commandHandler.handleMessage(message);
   * });
   */
  /*
  async handleMessage(message: Message): Promise<CommandExecutionResult> {
    
    if (message.isBot) {
      return { success: false };
    }

    
    if (!message.content.startsWith(this.client.prefix)) {
      return { success: false };
    }

    
    const args = message.content.slice(this.client.prefix.length).trim().split(/\s+/);
    const commandName = args.shift()?.toLowerCase();

    if (!commandName) {
      return { success: false };
    }

    
    const command = this.getCommand(commandName);
    if (!command) {
      return { success: false };
    }

    
    if (!command.enabled) {
      await message.reply("❌ This command is currently disabled.");
      return { success: false, error: "Command disabled" };
    }

    try {
      
      const checkResult = await this.runChecks(command, message);
      if (!checkResult.passed) {
        await message.reply(`❌ ${checkResult.error}`);
        return { success: false, error: checkResult.error };
      }

      
      const argsValidation = command.validateArgs(args);
      if (!argsValidation.valid) {
        await message.reply(`❌ ${argsValidation.error}`);
        return { success: false, error: argsValidation.error };
      }

      
      const cooldownCheck = this.cooldowns.isOnCooldown(
        command.name,
        message.author.id,
      );
      if (cooldownCheck.onCooldown) {
        await message.reply(
          `⏱️ Please wait ${cooldownCheck.timeLeft?.toFixed(1)} more seconds before using this command again.`,
        );
        return {
          success: false,
          error: "On cooldown",
          cooldownTimeLeft: cooldownCheck.timeLeft,
        };
      }

      
      const context: CommandContext = {
        message,
        args,
        client: this.client,
        commandName: command.name,
      };

      await command.execute(context);

      
      if (command.cooldown > 0) {
        this.cooldowns.setCooldown(
          command.name,
          message.author.id,
          command.cooldown,
        );
      }

      this.client.log(
        `Command executed: ${command.name} by ${message.author.username}`,
      );

      return { success: true };
    } catch (error) {
      this.client.log(`Command error: ${command.name} - ${error}`);
      await message.reply(
        "❌ There was an error executing this command!",
      ).catch(() => {});
      
      return { success: false, error: String(error) };
    }
  }
*/
// End of vibe code lines
  /**
   * Parse a message to check if it's a command
   * Useful for checking before handling
   *
   * @example
   * const parsed = commandHandler.parseMessage(message);
   * if (parsed.isCommand) {
   *   console.log(`Command: ${parsed.commandName}`);
   *   await commandHandler.handleMessage(message);
   * }
   */
  parseMessage(message: Message): {
    isCommand: boolean;
    commandName?: string;
    command?: Command;
    args?: string[];
  } {
    if (!message.content.startsWith(this.client.prefix)) {
      return { isCommand: false };
    }

    const args = message.content
      .slice(this.client.prefix.length)
      .trim()
      .split(/\s+/);
    const commandName = args.shift()?.toLowerCase();

    if (!commandName) {
      return { isCommand: false };
    }

    const command = this.getCommand(commandName);

    return {
      isCommand: true,
      commandName,
      command,
      args,
    };
  }

  /**
   * Run all checks for a command
   */
  private async runChecks(
    command: Command,
    message: Message,
  ): Promise<{ passed: boolean; error?: string }> {
    if (command.ownerOnly && !this.ownerIds.includes(message.author.id)) {
      return { passed: false, error: "This command is owner only." };
    }

    if (command.guildOnly && !message.guildId) {
      return {
        passed: false,
        error: "This command can only be used in servers.",
      };
    }

    if (command.dmOnly && message.guildId) {
      return { passed: false, error: "This command can only be used in DMs." };
    }

    if (command.nsfw && message.guildId) {
      try {
        const channel = await message.channel.fetch();
        if (!channel.nsfw) {
          return {
            passed: false,
            error: "This command can only be used in NSFW channels.",
          };
        }
      } catch (e: any) {
        throw new Error(e);
      }
    }
    // TODO: Add permission checks (requires fetching member/channel permissions)
    // For now, permission checks are commented out but can be implemented
    return { passed: true };
  }

  /**
   * Reload a command
   */
  async reloadCommand(commandName: string): Promise<boolean> {
    const command = this.getCommand(commandName);
    if (!command) return false;
    this.unregisterCommand(command.name);
    return true;
  }

  /**
   * Get cooldown manager
   */
  getCooldownManager(): CooldownManager {
    return this.cooldowns;
  }
}
