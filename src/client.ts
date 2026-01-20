import { config as dotEnvConfig } from "dotenv";
import {
  ActivityType,
  Client,
  ClientOptions,
  Collection,
  GatewayIntentBits,
} from "discord.js";
import path from "path";
import fs from "fs";
import { Interaction } from "discord.js";
dotEnvConfig();

class CodrClient extends Client {
  public commands: Collection<string, any>;

  constructor(options: ClientOptions) {
    super(options);

    this.commands = new Collection();

    const commandsPath = path.join(__dirname, "commands");
    this.loadCommands(commandsPath);
  }

  private loadCommands(dir: string): void {
    const items = fs.readdirSync(dir, { withFileTypes: true });

    for (const item of items) {
      const itemPath = path.join(dir, item.name);

      if (item.isDirectory()) {
        // Recursively load commands from subdirectories
        this.loadCommands(itemPath);
      } else if (item.name.endsWith(".js") || (item.name.endsWith(".ts") && !item.name.endsWith(".d.ts"))) {
        const command = require(itemPath);
        if (command.default?.data?.name) {
          this.commands.set(command.default.data.name, command.default);
        }
      }
    }
  }
}

const client = new CodrClient({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
  ],
});

export { client };
export default client;

client.once("ready", () => {
  const ACTIVITY = "/help | watching the fish in the sea";
  client.user?.setActivity(ACTIVITY, {
    type: ActivityType.Watching,
  });

  // Deploy commands - wrapped in try-catch for safety
  try {
    require("./deploy");
  } catch (error) {
    console.error("Error loading deploy module:", error);
  }
});

client.on("interactionCreate", async (interaction: Interaction) => {
  if (interaction.isCommand()) {
    const command = client.commands?.get(interaction.commandName);

    if (!command) return;

    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(`Error executing command "${interaction.commandName}":`, error);

      // Try to respond to the user
      try {
        const errorMessage = "There was an error while executing this command!";
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({ content: errorMessage, ephemeral: true });
        } else {
          await interaction.reply({ content: errorMessage, ephemeral: true });
        }
      } catch (replyError) {
        console.error("Failed to send error response:", replyError);
      }
    }
  }
  if (interaction.isModalSubmit()) {
    const command = client.commands?.get(interaction.customId);

    if (!command) return;

    try {
      await command.additionalInteractions.modal(interaction);
    } catch (error) {
      console.error(`Error executing modal "${interaction.customId}":`, error);

      try {
        const errorMessage = "There was an error while processing this form!";
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({ content: errorMessage, ephemeral: true });
        } else {
          await interaction.reply({ content: errorMessage, ephemeral: true });
        }
      } catch (replyError) {
        console.error("Failed to send error response:", replyError);
      }
    }
  }
});

client.login(process.env.TOKEN);
