import { REST, Routes } from "discord.js";
import fs from "fs";
import path from "path";

const commands: any[] = [];
const commandsPath = path.join(__dirname, "commands");

// Place your client and guild ids here
const clientId = process.env.CLIENTID as string;
const guildId = process.env.GUILDID as string;

function loadCommands(dir: string): void {
  const items = fs.readdirSync(dir, { withFileTypes: true });

  for (const item of items) {
    const itemPath = path.join(dir, item.name);

    if (item.isDirectory()) {
      loadCommands(itemPath);
    } else if (item.name.endsWith(".ts") || item.name.endsWith(".js")) {
      const command = require(itemPath);
      if (command.default?.data?.toJSON) {
        commands.push(command.default.data.toJSON());
      }
    }
  }
}

loadCommands(commandsPath);

const rest = new REST({ version: "10" }).setToken(process.env.TOKEN as string);

(async () => {
  try {
    console.log("Started refreshing application (/) commands.");

    await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
      body: commands,
    });

    console.log("Successfully reloaded application (/) commands.");
  } catch (error) {
    console.error(error);
  }
})();
