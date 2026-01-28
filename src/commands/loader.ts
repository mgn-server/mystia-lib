import { readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { pathToFileURL } from "node:url";
import { Command, CommandHandler } from "./handler.js";
import { Client } from "../websocket.js";

/**
 * Command loader options
 */
export interface CommandLoaderOptions {
  /** Commands directory path */
  commandsPath: string;

  /** Whether to load commands from subdirectories */
  recursive?: boolean;

  /** File extensions to load */
  extensions?: string[];

  /** Whether to log loading progress */
  verbose?: boolean;
}

/**
 * Command Loader - Loads commands from file system
 */
export class CommandLoader {
  private client: Client;
  private commandHandler: CommandHandler;
  private loadedFiles: Set<string> = new Set();

  constructor(client: Client, commandHandler: CommandHandler) {
    this.client = client;
    this.commandHandler = commandHandler;
  }

  /**
   * Load all commands from a directory
   */
  async loadCommands(options: CommandLoaderOptions): Promise<void> {
    const {
      commandsPath,
      recursive = true,
      extensions = [".js", ".ts"],
      verbose = true,
    } = options;

    if (verbose) {
      this.client.log(`Loading commands from: ${commandsPath}`);
    }

    try {
      const files = this.getCommandFiles(commandsPath, recursive, extensions);

      let loaded = 0;
      let failed = 0;

      for (const file of files) {
        try {
          await this.loadCommandFile(file);
          loaded++;
        } catch (error) {
          failed++;
          this.client.log(`Failed to load command from ${file}: ${error}`);
        }
      }

      if (verbose) {
        this.client.log(`Loaded ${loaded} commands (${failed} failed)`);
      }
    } catch (error) {
      this.client.log(`Error loading commands: ${error}`);
      throw error;
    }
  }

  /**
   * Load a single command file
   */
  private async loadCommandFile(filePath: string): Promise<void> {
    try {
      const fileUrl = pathToFileURL(filePath).href;
      const module = await import(fileUrl);
      const CommandClass = module.default || module.Command;

      if (!CommandClass) {
        throw new Error("No command class found in file");
      }

      if (typeof CommandClass !== "function") {
        throw new Error("Command export is not a class");
      }

      const command = new CommandClass();
      if (!(command instanceof Command)) {
        throw new Error("Command class does not extend base Command class");
      }

      this.commandHandler.registerCommand(command);
      this.loadedFiles.add(filePath);
    } catch (error) {
      throw new Error(`Failed to load ${filePath}: ${error}`);
    }
  }

  /**
   * Get all command files from directory
   */
  private getCommandFiles(
    dir: string,
    recursive: boolean,
    extensions: string[],
  ): string[] {
    const files: string[] = [];
    try {
      const entries = readdirSync(dir);
      for (const entry of entries) {
        const fullPath = join(dir, entry);
        const stat = statSync(fullPath);
        if (stat.isDirectory() && recursive) {
          files.push(...this.getCommandFiles(fullPath, recursive, extensions));
        } else if (stat.isFile()) {
          const ext = extname(fullPath);
          if (extensions.includes(ext)) {
            files.push(fullPath);
          }
        }
      }
    } catch (error) {
      throw new Error(`Error reading directory ${dir}: ${error}`);
    }
    return files;
  }

  /**
   * Reload a command file
   */
  async reloadCommand(filePath: string): Promise<void> {
    if (!this.loadedFiles.has(filePath)) {
      throw new Error(`Command file not loaded: ${filePath}`);
    }
    delete require.cache[require.resolve(filePath)];
    await this.loadCommandFile(filePath);
    this.client.log(`Reloaded command from: ${filePath}`);
  }

  /**
   * Reload all commands
   */
  async reloadAllCommands(options: CommandLoaderOptions): Promise<void> {
    const allCommands = this.commandHandler.getAllCommands();
    for (const command of allCommands) {
      this.commandHandler.unregisterCommand(command.name);
    }

    this.loadedFiles.clear();

    await this.loadCommands(options);
  }

  /**
   * Get loaded file paths
   */
  getLoadedFiles(): string[] {
    return Array.from(this.loadedFiles);
  }
}

/**
 * Utility function to easily setup command handler
 */
export async function setupCommandHandler(
  client: Client,
  options: {
    commandsPath: string;
    ownerIds?: string[];
    loaderOptions?: Partial<CommandLoaderOptions>;
  },
): Promise<{ handler: CommandHandler; loader: CommandLoader }> {
  const handler = new CommandHandler(client, options.ownerIds ?? []);

  const loader = new CommandLoader(client, handler);

  await loader.loadCommands({
    commandsPath: options.commandsPath,
    ...options.loaderOptions,
  });

  return { handler, loader };
}
