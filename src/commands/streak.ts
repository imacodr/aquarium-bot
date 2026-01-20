import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { prisma } from "../database/prisma";
import { ACHIEVEMENTS } from "../config/achievements";

const STREAK_EMOJIS = ["🔥", "⚡", "💪", "🌟", "🏆", "👑"];

function getStreakEmoji(streak: number): string {
  if (streak >= 100) return "👑";
  if (streak >= 30) return "🏆";
  if (streak >= 14) return "🌟";
  if (streak >= 7) return "💪";
  if (streak >= 3) return "⚡";
  return "🔥";
}

function getStreakMessage(streak: number): string {
  if (streak >= 100) return "LEGENDARY! You're absolutely unstoppable!";
  if (streak >= 30) return "A whole month! You're a language master!";
  if (streak >= 14) return "Two weeks strong! Keep it up!";
  if (streak >= 7) return "A full week! You're on fire!";
  if (streak >= 3) return "Nice streak! Keep the momentum going!";
  if (streak >= 1) return "Great start! Come back tomorrow!";
  return "Start translating to begin your streak!";
}

export default {
  data: new SlashCommandBuilder()
    .setName("streak")
    .setDescription("Check your translation streak and stats"),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild) {
      return interaction.reply({
        content: "This command can only be used in a server.",
        ephemeral: true,
      });
    }

    await interaction.deferReply({ ephemeral: true });

    try {
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
          content: "You need to verify your account first! Visit the dashboard to get started.",
        });
      }

      const streak = verifiedUser.currentStreak;
      const longestStreak = verifiedUser.longestStreak;
      const totalTranslations = verifiedUser.totalTranslations;
      const achievements: string[] = JSON.parse(verifiedUser.achievements || "[]");

      // Create progress bar for next streak milestone
      const streakMilestones = [3, 7, 14, 30, 100];
      const nextMilestone = streakMilestones.find((m) => m > streak) || 100;
      const prevMilestone = streakMilestones.filter((m) => m <= streak).pop() || 0;
      const progress = ((streak - prevMilestone) / (nextMilestone - prevMilestone)) * 100;
      const progressBar = createProgressBar(progress);

      // Get streak-related achievements
      const streakAchievements = ACHIEVEMENTS.filter(
        (a) => a.requirement.type === "streak" && achievements.includes(a.id)
      );

      const embed = new EmbedBuilder()
        .setColor(streak >= 7 ? 0xf97316 : 0x0ea5e9)
        .setTitle(`${getStreakEmoji(streak)} Your Translation Streak`)
        .setDescription(getStreakMessage(streak))
        .addFields(
          {
            name: "Current Streak",
            value: `**${streak}** day${streak !== 1 ? "s" : ""}`,
            inline: true,
          },
          {
            name: "Longest Streak",
            value: `**${longestStreak}** day${longestStreak !== 1 ? "s" : ""}`,
            inline: true,
          },
          {
            name: "Total Translations",
            value: `**${totalTranslations.toLocaleString()}**`,
            inline: true,
          },
          {
            name: `Progress to ${nextMilestone}-day streak`,
            value: progressBar,
            inline: false,
          }
        );

      if (streakAchievements.length > 0) {
        embed.addFields({
          name: "Streak Achievements",
          value: streakAchievements.map((a) => `${a.emoji} ${a.name}`).join(" • "),
          inline: false,
        });
      }

      // Add motivation based on streak status
      if (verifiedUser.lastActiveDate) {
        const lastActive = new Date(verifiedUser.lastActiveDate);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        lastActive.setHours(0, 0, 0, 0);

        const daysDiff = Math.floor(
          (today.getTime() - lastActive.getTime()) / (1000 * 60 * 60 * 24)
        );

        if (daysDiff === 0) {
          embed.setFooter({ text: "✅ You've translated today! Come back tomorrow to keep your streak." });
        } else if (daysDiff === 1) {
          embed.setFooter({ text: "⚠️ Translate today to keep your streak alive!" });
        } else {
          embed.setFooter({ text: "💔 Your streak has reset. Start a new one today!" });
        }
      }

      return interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error("Error fetching streak:", error);
      return interaction.editReply({
        content: "An error occurred while fetching your streak.",
      });
    }
  },
};

function createProgressBar(percent: number): string {
  const filled = Math.round(percent / 10);
  const empty = 10 - filled;
  return `${"█".repeat(filled)}${"░".repeat(empty)} ${Math.round(percent)}%`;
}
