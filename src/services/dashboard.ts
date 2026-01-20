import { Guild, TextChannel, ChannelType, PermissionFlagsBits } from "discord.js";
import { prisma } from "../database/prisma";
import { client } from "../client";
import { LANGUAGES, LANGUAGE_CODES } from "../config/languages";
import { channelPermissionService, getChannelIdForLanguage, getAllLanguageChannelIds } from "./channelPermissions";

export interface GuildSettings {
  guildId: string;
  guildName: string;
  guildIcon: string | null;
  categoryId: string | null;
  isSetup: boolean;
  subscription: {
    tier: string;
    expiresAt: string | null;
    isActive: boolean;
  };
  usage: {
    monthly: number;
    limit: number;
    resetDate: string;
  };
  channels: LanguageChannelInfo[];
  stats: {
    verifiedUsers: number;
    totalTranslations: number;
    activeUsersThisMonth: number;
  };
}

export interface LanguageChannelInfo {
  code: string;
  name: string;
  emoji: string;
  channelId: string | null;
  channelName: string | null;
  isConfigured: boolean;
}

export interface GuildMemberInfo {
  discordId: string;
  username: string;
  avatar: string | null;
  isVerified: boolean;
  totalTranslations: number;
  currentStreak: number;
  showOnLeaderboard: boolean;
  verifiedAt: string | null;
  lastActiveDate: string | null;
}

export interface UpdateGuildSettingsInput {
  // Future: moderation settings, custom prefixes, etc.
}

class DashboardService {
  /**
   * Get full guild settings for admin dashboard
   */
  async getGuildSettings(guildId: string): Promise<GuildSettings | null> {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return null;

    const config = await prisma.guildConfig.findUnique({
      where: { guildId },
      include: {
        verifiedUsers: {
          select: { id: true },
        },
        _count: {
          select: { usageLogs: true },
        },
      },
    });

    // Get active users this month
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const activeUsersThisMonth = config
      ? await prisma.usageLog.groupBy({
          by: ["userId"],
          where: {
            guildId,
            createdAt: { gte: startOfMonth },
          },
        }).then((r) => r.length)
      : 0;

    // Build channel info
    const channels: LanguageChannelInfo[] = [];
    for (const lang of Object.values(LANGUAGES)) {
      let channelId: string | null = null;
      let channelName: string | null = null;

      if (config) {
        channelId = getChannelIdForLanguage(config, lang.code);
        if (channelId) {
          try {
            const channel = await guild.channels.fetch(channelId);
            channelName = channel?.name || null;
          } catch {
            channelName = null;
          }
        }
      }

      channels.push({
        code: lang.code,
        name: lang.name,
        emoji: lang.emoji,
        channelId,
        channelName,
        isConfigured: !!channelId,
      });
    }

    // Calculate limits based on tier
    const tier = config?.subscriptionTier || "free";
    const limits: Record<string, number> = {
      free: 25000,
      pro: 100000,
      premium: 500000,
    };

    return {
      guildId: guild.id,
      guildName: guild.name,
      guildIcon: guild.iconURL(),
      categoryId: config?.categoryId || null,
      isSetup: !!config?.categoryId,
      subscription: {
        tier,
        expiresAt: config?.subscriptionExpiresAt?.toISOString() || null,
        isActive:
          tier === "free" ||
          !config?.subscriptionExpiresAt ||
          config.subscriptionExpiresAt > new Date(),
      },
      usage: {
        monthly: config?.monthlyCharacterUsage || 0,
        limit: limits[tier] || limits.free,
        resetDate: config?.usageResetDate?.toISOString() || new Date().toISOString(),
      },
      channels,
      stats: {
        verifiedUsers: config?.verifiedUsers.length || 0,
        totalTranslations: config?._count.usageLogs || 0,
        activeUsersThisMonth,
      },
    };
  }

  /**
   * Get list of verified members in a guild
   */
  async getGuildMembers(
    guildId: string,
    options: { page?: number; limit?: number; search?: string } = {}
  ): Promise<{ members: GuildMemberInfo[]; total: number; page: number; totalPages: number }> {
    const { page = 1, limit = 20, search } = options;
    const skip = (page - 1) * limit;

    const where: any = { guildId };
    if (search) {
      where.username = { contains: search, mode: "insensitive" };
    }

    const [members, total] = await Promise.all([
      prisma.verifiedUser.findMany({
        where,
        skip,
        take: limit,
        orderBy: { totalTranslations: "desc" },
        select: {
          discordId: true,
          username: true,
          avatar: true,
          totalTranslations: true,
          currentStreak: true,
          showOnLeaderboard: true,
          verifiedAt: true,
          lastActiveDate: true,
        },
      }),
      prisma.verifiedUser.count({ where }),
    ]);

    return {
      members: members.map((m) => ({
        discordId: m.discordId,
        username: m.username,
        avatar: m.avatar,
        isVerified: true,
        totalTranslations: m.totalTranslations,
        currentStreak: m.currentStreak,
        showOnLeaderboard: m.showOnLeaderboard,
        verifiedAt: m.verifiedAt.toISOString(),
        lastActiveDate: m.lastActiveDate?.toISOString() || null,
      })),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get usage analytics for a guild
   */
  async getGuildAnalytics(
    guildId: string,
    days: number = 30
  ): Promise<{
    dailyUsage: { date: string; characters: number; translations: number }[];
    languageBreakdown: { language: string; count: number }[];
    topUsers: { userId: string; username: string; characters: number }[];
  }> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    // Get daily usage
    const usageLogs = await prisma.usageLog.findMany({
      where: {
        guildId,
        createdAt: { gte: startDate },
      },
      select: {
        createdAt: true,
        characterCount: true,
        sourceLanguage: true,
      },
    });

    // Aggregate by day
    const dailyMap = new Map<string, { characters: number; translations: number }>();
    const languageMap = new Map<string, number>();

    for (const log of usageLogs) {
      const dateKey = log.createdAt.toISOString().split("T")[0];
      const existing = dailyMap.get(dateKey) || { characters: 0, translations: 0 };
      dailyMap.set(dateKey, {
        characters: existing.characters + log.characterCount,
        translations: existing.translations + 1,
      });

      const langCount = languageMap.get(log.sourceLanguage) || 0;
      languageMap.set(log.sourceLanguage, langCount + 1);
    }

    // Convert to arrays
    const dailyUsage = Array.from(dailyMap.entries())
      .map(([date, data]) => ({ date, ...data }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const languageBreakdown = Array.from(languageMap.entries())
      .map(([language, count]) => ({ language, count }))
      .sort((a, b) => b.count - a.count);

    // Get top users
    const topUsersData = await prisma.usageLog.groupBy({
      by: ["userId"],
      where: {
        guildId,
        createdAt: { gte: startDate },
      },
      _sum: { characterCount: true },
      orderBy: { _sum: { characterCount: "desc" } },
      take: 10,
    });

    const topUsers = await Promise.all(
      topUsersData.map(async (u) => {
        const verifiedUser = await prisma.verifiedUser.findFirst({
          where: { discordId: u.userId, guildId },
          select: { username: true },
        });
        return {
          userId: u.userId,
          username: verifiedUser?.username || "Unknown",
          characters: u._sum.characterCount || 0,
        };
      })
    );

    return { dailyUsage, languageBreakdown, topUsers };
  }

  /**
   * Remove a verified user from a guild (admin action)
   */
  async removeVerifiedUser(guildId: string, userId: string): Promise<boolean> {
    try {
      await prisma.verifiedUser.delete({
        where: {
          discordId_guildId: {
            discordId: userId,
            guildId,
          },
        },
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get all guilds where bot is present (for super admin)
   */
  async getAllGuilds(): Promise<
    {
      id: string;
      name: string;
      icon: string | null;
      memberCount: number;
      isSetup: boolean;
      tier: string;
    }[]
  > {
    const guilds = [];
    for (const [, guild] of client.guilds.cache) {
      const config = await prisma.guildConfig.findUnique({
        where: { guildId: guild.id },
        select: { categoryId: true, subscriptionTier: true },
      });

      guilds.push({
        id: guild.id,
        name: guild.name,
        icon: guild.iconURL(),
        memberCount: guild.memberCount,
        isSetup: !!config?.categoryId,
        tier: config?.subscriptionTier || "free",
      });
    }
    return guilds;
  }

  /**
   * Check if bot has required permissions in guild
   */
  async checkBotPermissions(guildId: string): Promise<{
    hasRequired: boolean;
    missing: string[];
  }> {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
      return { hasRequired: false, missing: ["Bot not in guild"] };
    }

    const botMember = guild.members.me;
    if (!botMember) {
      return { hasRequired: false, missing: ["Cannot fetch bot member"] };
    }

    const requiredPermissions = [
      { flag: PermissionFlagsBits.ManageChannels, name: "Manage Channels" },
      { flag: PermissionFlagsBits.ManageWebhooks, name: "Manage Webhooks" },
      { flag: PermissionFlagsBits.SendMessages, name: "Send Messages" },
      { flag: PermissionFlagsBits.ReadMessageHistory, name: "Read Message History" },
      { flag: PermissionFlagsBits.ViewChannel, name: "View Channels" },
      { flag: PermissionFlagsBits.ManageMessages, name: "Manage Messages" },
    ];

    const missing: string[] = [];
    for (const perm of requiredPermissions) {
      if (!botMember.permissions.has(perm.flag)) {
        missing.push(perm.name);
      }
    }

    return {
      hasRequired: missing.length === 0,
      missing,
    };
  }
}

export const dashboardService = new DashboardService();
