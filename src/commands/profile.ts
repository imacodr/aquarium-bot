import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  User,
} from "discord.js";
import { prisma } from "../database/prisma";
import { ACHIEVEMENTS, getAchievementById } from "../config/achievements";

const RANK_TITLES = [
  { threshold: 5000, title: "Language Legend", emoji: "👑" },
  { threshold: 1000, title: "Polyglot Master", emoji: "🎓" },
  { threshold: 500, title: "Polyglot Apprentice", emoji: "📚" },
  { threshold: 100, title: "Conversationalist", emoji: "💬" },
  { threshold: 10, title: "Beginner", emoji: "🌱" },
  { threshold: 0, title: "Newcomer", emoji: "👋" },
];

function getRankTitle(translations: number): { title: string; emoji: string } {
  for (const rank of RANK_TITLES) {
    if (translations >= rank.threshold) {
      return rank;
    }
  }
  return RANK_TITLES[RANK_TITLES.length - 1];
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default {
  data: new SlashCommandBuilder()
    .setName("profile")
    .setDescription("View your translation profile and achievements")
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("View another user's profile (optional)")
        .setRequired(false)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild) {
      return interaction.reply({
        content: "This command can only be used in a server.",
        ephemeral: true,
      });
    }

    await interaction.deferReply();

    const targetUser = interaction.options.getUser("user") || interaction.user;
    const isSelf = targetUser.id === interaction.user.id;

    try {
      const verifiedUser = await prisma.verifiedUser.findUnique({
        where: {
          discordId_guildId: {
            discordId: targetUser.id,
            guildId: interaction.guild.id,
          },
        },
      });

      if (!verifiedUser) {
        return interaction.editReply({
          content: isSelf
            ? "You need to verify your account first! Visit the dashboard to get started."
            : `${targetUser.username} hasn't verified their account yet.`,
        });
      }

      const achievements: string[] = JSON.parse(verifiedUser.achievements || "[]");
      const rank = getRankTitle(verifiedUser.totalTranslations);

      // Get server rank
      const allUsers = await prisma.verifiedUser.findMany({
        where: { guildId: interaction.guild.id },
        orderBy: { totalTranslations: "desc" },
        select: { discordId: true },
      });
      const serverRank = allUsers.findIndex((u) => u.discordId === targetUser.id) + 1;

      // Build achievement display
      const earnedAchievements = achievements
        .map((id) => getAchievementById(id))
        .filter((a) => a !== undefined);

      const achievementsByType = {
        translations: earnedAchievements.filter((a) => a!.requirement.type === "translations"),
        streak: earnedAchievements.filter((a) => a!.requirement.type === "streak"),
        characters: earnedAchievements.filter((a) => a!.requirement.type === "characters"),
      };

      // Calculate progress to next achievements
      const nextAchievements = ACHIEVEMENTS.filter(
        (a) => !achievements.includes(a.id)
      ).slice(0, 3);

      const embed = new EmbedBuilder()
        .setColor(0x0ea5e9)
        .setTitle(`${rank.emoji} ${targetUser.username}'s Profile`)
        .setThumbnail(targetUser.displayAvatarURL({ size: 128 }))
        .setDescription(`**${rank.title}**\nServer Rank: #${serverRank}`)
        .addFields(
          {
            name: "📊 Stats",
            value: [
              `**Translations:** ${verifiedUser.totalTranslations.toLocaleString()}`,
              `**Current Streak:** ${verifiedUser.currentStreak} day${verifiedUser.currentStreak !== 1 ? "s" : ""} 🔥`,
              `**Longest Streak:** ${verifiedUser.longestStreak} day${verifiedUser.longestStreak !== 1 ? "s" : ""}`,
              `**Characters:** ${verifiedUser.monthlyCharacterUsage.toLocaleString()} this month`,
            ].join("\n"),
            inline: true,
          },
          {
            name: "🏆 Achievements",
            value: `**${achievements.length}** / ${ACHIEVEMENTS.length} unlocked`,
            inline: true,
          }
        );

      // Add achievement sections if any earned
      if (achievementsByType.translations.length > 0) {
        embed.addFields({
          name: "📝 Translation Achievements",
          value: achievementsByType.translations.map((a) => `${a!.emoji} ${a!.name}`).join(" • "),
          inline: false,
        });
      }

      if (achievementsByType.streak.length > 0) {
        embed.addFields({
          name: "🔥 Streak Achievements",
          value: achievementsByType.streak.map((a) => `${a!.emoji} ${a!.name}`).join(" • "),
          inline: false,
        });
      }

      if (achievementsByType.characters.length > 0) {
        embed.addFields({
          name: "✍️ Character Achievements",
          value: achievementsByType.characters.map((a) => `${a!.emoji} ${a!.name}`).join(" • "),
          inline: false,
        });
      }

      // Show next achievements to unlock
      if (nextAchievements.length > 0 && isSelf) {
        const nextList = nextAchievements.map((a) => {
          let progress = 0;
          let current = 0;
          switch (a.requirement.type) {
            case "translations":
              current = verifiedUser.totalTranslations;
              break;
            case "streak":
              current = verifiedUser.currentStreak;
              break;
            case "characters":
              current = verifiedUser.monthlyCharacterUsage;
              break;
          }
          progress = Math.min(100, Math.round((current / a.requirement.value) * 100));
          return `${a.emoji} **${a.name}** — ${progress}%`;
        });

        embed.addFields({
          name: "🎯 Next Achievements",
          value: nextList.join("\n"),
          inline: false,
        });
      }

      embed.setFooter({
        text: `Member since ${formatDate(verifiedUser.verifiedAt)}`,
      });

      return interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error("Error fetching profile:", error);
      return interaction.editReply({
        content: "An error occurred while fetching the profile.",
      });
    }
  },
};
