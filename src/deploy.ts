import { REST, Routes } from "discord.js";
import fs from "fs";
import path from "path";

const commands = [];
const commandsPath = path.join(__dirname, "commands");
const commandFiles = fs
  .readdirSync(commandsPath)
  .filter((file) => file.endsWith(".ts") || file.endsWith(".js"));

// Place your client and guild ids here
const clientId = process.env.CLIENTID as string;
const guildId = process.env.GUILDID as string;

for (const file of commandFiles) {
  const command = require(`./commands/${file}`);
  //@ts-ignore
  commands.push(command.default.data.toJSON());
}

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
