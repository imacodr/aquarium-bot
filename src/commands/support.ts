import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import { SUPPORT_SERVER_URL, DASHBOARD_URL } from "../config/constants";

export default {
  data: new SlashCommandBuilder()
    .setName("support")
    .setDescription("Get help and support for Aquarium"),

  async execute(interaction: ChatInputCommandInteraction) {
    const embed = new EmbedBuilder()
      .setColor(0x0ea5e9)
      .setTitle("Need Help?")
      .setDescription(
        "Join our support server to get help from the community and developers, " +
        "report bugs, suggest features, or just chat with other language learners!"
      )
      .addFields(
        {
          name: "Support Server",
          value: `[Join the Aquarium Discord](${SUPPORT_SERVER_URL})`,
          inline: true,
        },
        {
          name: "Dashboard",
          value: `[Open Dashboard](${DASHBOARD_URL})`,
          inline: true,
        },
        {
          name: "Common Questions",
          value:
            "**How do I verify?** Visit the dashboard and log in with Discord.\n" +
            "**Why was my message deleted?** You need to verify before using language channels.\n" +
            "**How do I change my language subscriptions?** Use `/preferences languages set`.",
        }
      )
      .setFooter({ text: "Aquarium - Language Immersion Bot" });

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setLabel("Join Support Server")
        .setStyle(ButtonStyle.Link)
        .setURL(SUPPORT_SERVER_URL)
        .setEmoji("💬"),
      new ButtonBuilder()
        .setLabel("Open Dashboard")
        .setStyle(ButtonStyle.Link)
        .setURL(DASHBOARD_URL)
        .setEmoji("🌐")
    );

    return interaction.reply({
      embeds: [embed],
      components: [row],
      ephemeral: true,
    });
  },
};
