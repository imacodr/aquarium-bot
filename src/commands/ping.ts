import { ButtonInteraction } from "discord.js";
import { CommandInteraction, SlashCommandBuilder } from "discord.js";

async function execute(interaction: CommandInteraction) {
  return interaction.reply({
    content: "Pong!",
  });
}

export default {
  data: new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Replies with Pong!"),

  execute: (interaction: CommandInteraction) => execute(interaction),
};
