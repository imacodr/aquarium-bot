import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { prisma } from "../database/prisma";

const MEDALS = ["🥇", "🥈", "🥉"];
const RANK_EMOJIS = ["4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"];

export default {
  data: new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("See the top translators in this server")
    .addStringOption((option) =>
      option
        .setName("type")
        .setDescription("Leaderboard type")
        .setRequired(false)
        .addChoices(
          { name: "This Month", value: "month" },
          { name: "All Time", value: "alltime" }
        )
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild) {
      return interaction.reply({
        content: "This command can only be used in a server.",
        ephemeral: true,
      });
    }

    await interaction.deferReply();

    const type = interaction.options.getString("type") || "month";

    try {
      let leaderboardData;

      // Get users who have opted out of leaderboard
      const hiddenUsers = await prisma.verifiedUser.findMany({
        where: {
          guildId: interaction.guild.id,
          showOnLeaderboard: false,
        },
        select: { discordId: true },
      });
      const hiddenUserIds = hiddenUsers.map((u) => u.discordId);

      if (type === "month") {
        // Get this month's usage from UsageLog
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);

        leaderboardData = await prisma.usageLog.groupBy({
          by: ["userId"],
          where: {
            guildId: interaction.guild.id,
            createdAt: { gte: startOfMonth },
            userId: { notIn: hiddenUserIds },
          },
          _sum: { characterCount: true },
          orderBy: { _sum: { characterCount: "desc" } },
          take: 10,
        });
      } else {
        // All time from VerifiedUser total (we'd need to track this separately)
        // For now, use UsageLog totals
        leaderboardData = await prisma.usageLog.groupBy({
          by: ["userId"],
          where: {
            guildId: interaction.guild.id,
            userId: { notIn: hiddenUserIds },
          },
          _sum: { characterCount: true },
          orderBy: { _sum: { characterCount: "desc" } },
          take: 10,
        });
      }

      if (leaderboardData.length === 0) {
        return interaction.editReply({
          content: "No translations yet! Be the first to use the language channels.",
        });
      }

      // Fetch usernames
      const leaderboardWithNames = await Promise.all(
        leaderboardData.map(async (entry, index) => {
          let username = "Unknown User";
          try {
            const member = await interaction.guild!.members.fetch(entry.userId);
            username = member.displayName;
          } catch {
            // User may have left the server
            const verifiedUser = await prisma.verifiedUser.findFirst({
              where: { discordId: entry.userId, guildId: interaction.guild!.id },
            });
            username = verifiedUser?.username || "Unknown User";
          }

          const chars = entry._sum.characterCount || 0;
          const rank = index < 3 ? MEDALS[index] : RANK_EMOJIS[index - 3] || `${index + 1}.`;

          return `${rank} **${username}** — ${chars.toLocaleString()} characters`;
        })
      );

      const embed = new EmbedBuilder()
        .setColor(0xfbbf24)
        .setTitle(`🏆 Translation Leaderboard`)
        .setDescription(leaderboardWithNames.join("\n"))
        .setFooter({
          text: type === "month" ? "This month's translations" : "All-time translations",
        })
        .setTimestamp();

      // Check if the command user is on the leaderboard
      const userRank = leaderboardData.findIndex(
        (e) => e.userId === interaction.user.id
      );
      if (userRank === -1) {
        embed.addFields({
          name: "Your Ranking",
          value: "Keep translating to get on the leaderboard!",
        });
      } else {
        embed.addFields({
          name: "Your Ranking",
          value: `You're #${userRank + 1} with ${(leaderboardData[userRank]._sum.characterCount || 0).toLocaleString()} characters!`,
        });
      }

      return interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error("Error fetching leaderboard:", error);
      return interaction.editReply({
        content: "An error occurred while fetching the leaderboard.",
      });
    }
  },
};
