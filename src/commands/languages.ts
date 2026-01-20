import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { prisma } from "../database/prisma";
import { LANGUAGES } from "../config/languages";

export default {
  data: new SlashCommandBuilder()
    .setName("languages")
    .setDescription("View available language channels"),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild) {
      return interaction.reply({
        content: "This command can only be used in a server.",
        ephemeral: true,
      });
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      const config = await prisma.guildConfig.findUnique({
        where: { guildId: interaction.guild.id },
      });

      // Build language list with channel mentions if set up
      const languageList = Object.values(LANGUAGES).map((lang) => {
        let channelId: string | null = null;

        if (config) {
          switch (lang.code) {
            case "EN": channelId = config.englishChannelId; break;
            case "ES": channelId = config.spanishChannelId; break;
            case "PT-BR": channelId = config.portugueseChannelId; break;
            case "FR": channelId = config.frenchChannelId; break;
            case "DE": channelId = config.germanChannelId; break;
            case "IT": channelId = config.italianChannelId; break;
            case "JA": channelId = config.japaneseChannelId; break;
            case "KO": channelId = config.koreanChannelId; break;
            case "ZH": channelId = config.chineseChannelId; break;
          }
        }

        const channelMention = channelId ? `<#${channelId}>` : "*not set up*";
        return `${lang.emoji} **${lang.name}** → ${channelMention}`;
      });

      const embed = new EmbedBuilder()
        .setColor(0x0ea5e9)
        .setTitle("Available Languages")
        .setDescription(
          config?.categoryId
            ? "Messages sent in any channel will be automatically translated to all other channels."
            : "Language immersion is not set up yet. An admin can use `/immersion setup` to get started."
        )
        .addFields({
          name: "Languages",
          value: languageList.join("\n"),
        })
        .setFooter({ text: `${Object.keys(LANGUAGES).length} languages supported` });

      return interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error("Error getting languages:", error);
      return interaction.editReply({
        content: "An error occurred while getting the language list.",
      });
    }
  },
};
