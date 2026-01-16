import { config as dotEnvConfig } from "dotenv";
import {
  ActivityType,
  Client,
  ClientOptions,
  Collection,
  GatewayIntentBits,
} from "discord.js";
// @ts-ignore
import path from "path";
import fs from "fs";
import { Interaction } from "discord.js";
dotEnvConfig();

class codrClient extends Client {
  public commands: Collection<string, any>;

  constructor(options: ClientOptions) {
    super(options);

    this.commands = new Collection();

    const commandsPath = path.join(__dirname, "commands");
    const commandFiles = fs
      .readdirSync(commandsPath)
      .filter((file) => file.endsWith(".js") || file.endsWith(".ts"));

    for (const file of commandFiles) {
      const filePath = path.join(commandsPath, file);
      const command = require(filePath);
      this.commands.set(command.default.data.name, command.default);
    }
  }
}

const client = new codrClient({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
  ],
});

client.once("ready", () => {
  const ACTIVITY = "for /help";
  client.user?.setActivity(ACTIVITY, {
    type: ActivityType.Watching,
  });
  require("./deploy");
});

client.on("interactionCreate", async (interaction: Interaction) => {
  if (interaction.isCommand()) {
    const command = client.commands?.get(interaction.commandName);

    if (!command) return;

    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(error);
      await interaction.reply({
        content: "There was an error while executing this command!",
        ephemeral: true,
      });
    }
  }
  if (interaction.isModalSubmit()) {
    const command = client.commands?.get(interaction.customId);

    if (!command) return;

    try {
      await command.additionalInteractions.modal(interaction);
    } catch (error) {
      console.error(error);
      await interaction.reply({
        content: "There was an error while executing this command!",
        ephemeral: true,
      });
    }
  }
});

client.login(process.env.TOKEN);
