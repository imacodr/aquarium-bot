import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { prisma } from "../database/prisma";
import { getTierLimits, getTierName } from "../config/subscriptions";
import { DASHBOARD_URL } from "../config/constants";

export default {
  data: new SlashCommandBuilder()
    .setName("usage")
    .setDescription("View your translation usage and limits"),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild) {
      return interaction.reply({
        content: "This command can only be used in a server.",
        ephemeral: true,
      });
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      // Get guild config for subscription tier
      const config = await prisma.guildConfig.findUnique({
        where: { guildId: interaction.guild.id },
      });

      if (!config?.categoryId) {
        return interaction.editReply({
          content: "Language immersion is not set up in this server.",
        });
      }

      // Get user's verification and usage
      const verifiedUser = await prisma.verifiedUser.findUnique({
        where: {
          discordId_guildId: {
            discordId: interaction.user.id,
            guildId: interaction.guild.id,
          },
        },
      });

      if (!verifiedUser) {
        return interaction.editReply({
          content: `You're not verified yet. [Click here to verify](${DASHBOARD_URL})`,
        });
      }

      const limits = getTierLimits(config.subscriptionTier);
      const tierName = getTierName(config.subscriptionTier);

      // Calculate percentages
      const userPercent = (verifiedUser.monthlyCharacterUsage / limits.perUser) * 100;
      const guildPercent = (config.monthlyCharacterUsage / limits.perGuild) * 100;

      // Calculate reset date
      const now = new Date();
      const nextReset = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      const daysUntilReset = Math.ceil((nextReset.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      // Create progress bar
      const createBar = (percent: number): string => {
        const filled = Math.min(Math.round(percent / 10), 10);
        const empty = 10 - filled;
        return "█".repeat(filled) + "░".repeat(empty);
      };

      const getStatusColor = (percent: number): number => {
        if (percent >= 90) return 0xef4444; // Red
        if (percent >= 70) return 0xf59e0b; // Yellow
        return 0x22c55e; // Green
      };

      const embed = new EmbedBuilder()
        .setColor(getStatusColor(Math.max(userPercent, guildPercent)))
        .setTitle("Translation Usage")
        .setDescription(`Server plan: **${tierName}**`)
        .addFields(
          {
            name: "Your Usage",
            value: `${createBar(userPercent)} ${userPercent.toFixed(1)}%\n${verifiedUser.monthlyCharacterUsage.toLocaleString()} / ${limits.perUser.toLocaleString()} characters`,
            inline: false,
          },
          {
            name: "Server Usage",
            value: `${createBar(guildPercent)} ${guildPercent.toFixed(1)}%\n${config.monthlyCharacterUsage.toLocaleString()} / ${limits.perGuild.toLocaleString()} characters`,
            inline: false,
          },
          {
            name: "Reset",
            value: `${daysUntilReset} day${daysUntilReset === 1 ? "" : "s"} until reset`,
            inline: true,
          }
        )
        .setFooter({ text: "Usage resets on the 1st of each month" })
        .setTimestamp();

      // Add upgrade hint if on free tier and usage is high
      if (config.subscriptionTier === "free" && (userPercent >= 50 || guildPercent >= 50)) {
        embed.addFields({
          name: "Need more?",
          value: `[Upgrade your plan](${DASHBOARD_URL}/subscribe) for higher limits!`,
          inline: false,
        });
      }

      return interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error("Error getting usage:", error);
      return interaction.editReply({
        content: "An error occurred while getting your usage.",
      });
    }
  },
};
