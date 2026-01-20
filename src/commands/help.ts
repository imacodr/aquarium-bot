import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { LANGUAGES } from "../config/languages";
import { DASHBOARD_URL, SUPPORT_SERVER_URL } from "../config/constants";

export default {
  data: new SlashCommandBuilder()
    .setName("help")
    .setDescription("Learn how to use the language immersion bot"),

  async execute(interaction: ChatInputCommandInteraction) {
    const languageCount = Object.keys(LANGUAGES).length;

    const embed = new EmbedBuilder()
      .setColor(0x0ea5e9)
      .setTitle("💧 Aquarium")
      .setDescription(
        "Practice languages with your community! Messages sent in any language channel are automatically translated to all other channels."
      )
      .addFields(
        {
          name: "How It Works",
          value:
            "1. Verify your account via the web dashboard\n" +
            "2. Post in any language channel\n" +
            "3. Your message is translated to all other channels\n" +
            "4. Others can respond in their preferred language",
          inline: false,
        },
        {
          name: "Commands",
          value:
            "`/languages` - View available language channels\n" +
            "`/usage` - Check your translation usage\n" +
            "`/profile` - View your profile and achievements\n" +
            "`/leaderboard` - See top translators\n" +
            "`/preferences view` - View your settings\n" +
            "`/subscribe plans` - View subscription plans\n" +
            "`/support` - Get help and join our support server\n" +
            "`/help` - Show this message",
          inline: false,
        },
        {
          name: "Preferences",
          value:
            "`/preferences languages set` - Choose which language channels to see\n" +
            "`/preferences display mode` - Toggle detailed/compact display\n" +
            "`/preferences privacy leaderboard` - Hide from leaderboard\n" +
            "`/preferences notifications toggle` - Toggle DM notifications",
          inline: false,
        },
        {
          name: "Admin Commands",
          value:
            "`/immersion setup` - Set up language channels\n" +
            "`/immersion status` - View immersion status\n" +
            "`/immersion reset` - Remove immersion setup",
          inline: false,
        },
        {
          name: "Supported Languages",
          value: `${languageCount} languages: ${Object.values(LANGUAGES).map(l => l.emoji).join(" ")}`,
          inline: false,
        },
        {
          name: "Links",
          value: `[Dashboard](${DASHBOARD_URL}) · [Support Server](${SUPPORT_SERVER_URL})`,
          inline: false,
        }
      )
      .setFooter({ text: "Powered by DeepL" });

    return interaction.reply({
      embeds: [embed],
      ephemeral: true,
    });
  },
};
