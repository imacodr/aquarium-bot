/**
 * Developer Service
 * Business logic for bot developer administration features
 */

import { prisma } from "../database/prisma";
import { client } from "../client";
import { SUBSCRIPTION_TIERS, getTierLimits } from "../config/subscriptions";

export interface BotStats {
  guilds: {
    total: number;
    withImmersion: number;
    byTier: Record<string, number>;
  };
  users: {
    totalVerified: number;
    totalGlobal: number;
    activeThisMonth: number;
    byTier: Record<string, number>;
  };
  usage: {
    totalCharactersThisMonth: number;
    totalTranslationsThisMonth: number;
    totalCharactersAllTime: number;
    totalTranslationsAllTime: number;
  };
  subscriptions: {
    activeGuildSubscriptions: number;
    activeUserSubscriptions: number;
    monthlyRecurringRevenue: number;
  };
}

export interface GuildInfo {
  id: string;
  name: string;
  icon: string | null;
  memberCount: number;
  ownerId: string;
  ownerUsername?: string;
  hasImmersion: boolean;
  subscription: {
    tier: string;
    expiresAt: Date | null;
    isActive: boolean;
  };
  usage: {
    monthlyCharacters: number;
    monthlyTranslations: number;
    verifiedUsers: number;
  };
  createdAt: Date;
}

export interface UserInfo {
  id: string;
  discordId: string;
  username: string;
  avatar: string | null;
  subscription: {
    tier: string;
    expiresAt: Date | null;
    isActive: boolean;
  };
  stats: {
    totalTranslationsAllTime: number;
    totalCharactersAllTime: number;
  };
  guilds: {
    guildId: string;
    guildName: string;
    verifiedAt: Date;
    monthlyUsage: number;
    totalTranslations: number;
  }[];
  isBotDeveloper: boolean;
  createdAt: Date;
}

/**
 * Get comprehensive bot statistics
 */
export async function getBotStats(): Promise<BotStats> {
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  // Get guild stats
  const guildConfigs = await prisma.guildConfig.findMany({
    select: {
      guildId: true,
      categoryId: true,
      subscriptionTier: true,
      subscriptionExpiresAt: true,
    },
  });

  const guildsWithImmersion = guildConfigs.filter((g) => g.categoryId !== null).length;
  const guildsByTier: Record<string, number> = { free: 0, pro: 0, premium: 0 };
  guildConfigs.forEach((g) => {
    const tier = g.subscriptionTier || "free";
    guildsByTier[tier] = (guildsByTier[tier] || 0) + 1;
  });

  // Get user stats
  const [totalVerified, totalGlobal, usersByTier] = await Promise.all([
    prisma.verifiedUser.count(),
    prisma.user.count(),
    prisma.user.groupBy({
      by: ["subscriptionTier"],
      _count: true,
    }),
  ]);

  const userTierCounts: Record<string, number> = { free: 0, pro: 0, premium: 0 };
  usersByTier.forEach((u) => {
    userTierCounts[u.subscriptionTier] = u._count;
  });

  // Get active users this month
  const activeThisMonth = await prisma.usageLog.groupBy({
    by: ["userId"],
    where: {
      createdAt: { gte: startOfMonth },
    },
  });

  // Get usage stats
  const [monthlyUsage, allTimeUsage] = await Promise.all([
    prisma.usageLog.aggregate({
      where: { createdAt: { gte: startOfMonth } },
      _sum: { characterCount: true },
      _count: true,
    }),
    prisma.usageLog.aggregate({
      _sum: { characterCount: true },
      _count: true,
    }),
  ]);

  // Get subscription stats
  const now = new Date();
  const activeGuildSubs = guildConfigs.filter(
    (g) =>
      g.subscriptionTier !== "free" &&
      (!g.subscriptionExpiresAt || g.subscriptionExpiresAt > now)
  ).length;

  const activeUserSubs = await prisma.user.count({
    where: {
      subscriptionTier: { not: "free" },
      OR: [
        { subscriptionExpiresAt: null },
        { subscriptionExpiresAt: { gt: now } },
      ],
    },
  });

  // Calculate MRR (simplified - actual MRR would need Stripe data)
  let mrr = 0;
  guildConfigs.forEach((g) => {
    if (
      g.subscriptionTier !== "free" &&
      (!g.subscriptionExpiresAt || g.subscriptionExpiresAt > now)
    ) {
      mrr += SUBSCRIPTION_TIERS[g.subscriptionTier]?.price || 0;
    }
  });

  return {
    guilds: {
      total: client.guilds.cache.size,
      withImmersion: guildsWithImmersion,
      byTier: guildsByTier,
    },
    users: {
      totalVerified,
      totalGlobal,
      activeThisMonth: activeThisMonth.length,
      byTier: userTierCounts,
    },
    usage: {
      totalCharactersThisMonth: monthlyUsage._sum.characterCount || 0,
      totalTranslationsThisMonth: monthlyUsage._count || 0,
      totalCharactersAllTime: allTimeUsage._sum.characterCount || 0,
      totalTranslationsAllTime: allTimeUsage._count || 0,
    },
    subscriptions: {
      activeGuildSubscriptions: activeGuildSubs,
      activeUserSubscriptions: activeUserSubs,
      monthlyRecurringRevenue: mrr,
    },
  };
}

/**
 * List all guilds with pagination and search
 */
export async function listGuilds(options: {
  page?: number;
  limit?: number;
  search?: string;
  tier?: string;
  hasImmersion?: boolean;
}): Promise<{ guilds: GuildInfo[]; total: number; page: number; totalPages: number }> {
  const page = options.page || 1;
  const limit = Math.min(options.limit || 20, 100);
  const skip = (page - 1) * limit;

  // Get guild configs from database
  const where: any = {};
  if (options.tier) {
    where.subscriptionTier = options.tier;
  }
  if (options.hasImmersion !== undefined) {
    where.categoryId = options.hasImmersion ? { not: null } : null;
  }

  const [configs, total] = await Promise.all([
    prisma.guildConfig.findMany({
      where,
      include: {
        _count: {
          select: { verifiedUsers: true, usageLogs: true },
        },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.guildConfig.count({ where }),
  ]);

  // Match with Discord guild cache and apply search filter
  const guilds: GuildInfo[] = [];
  const now = new Date();
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  for (const config of configs) {
    const discordGuild = client.guilds.cache.get(config.guildId);
    if (!discordGuild) continue;

    // Apply search filter
    if (options.search) {
      const searchLower = options.search.toLowerCase();
      if (
        !discordGuild.name.toLowerCase().includes(searchLower) &&
        !config.guildId.includes(searchLower)
      ) {
        continue;
      }
    }

    // Get monthly usage
    const monthlyUsage = await prisma.usageLog.aggregate({
      where: {
        guildId: config.guildId,
        createdAt: { gte: startOfMonth },
      },
      _sum: { characterCount: true },
      _count: true,
    });

    guilds.push({
      id: config.guildId,
      name: discordGuild.name,
      icon: discordGuild.iconURL(),
      memberCount: discordGuild.memberCount,
      ownerId: discordGuild.ownerId,
      hasImmersion: config.categoryId !== null,
      subscription: {
        tier: config.subscriptionTier,
        expiresAt: config.subscriptionExpiresAt,
        isActive:
          config.subscriptionTier === "free" ||
          !config.subscriptionExpiresAt ||
          config.subscriptionExpiresAt > now,
      },
      usage: {
        monthlyCharacters: monthlyUsage._sum.characterCount || 0,
        monthlyTranslations: monthlyUsage._count || 0,
        verifiedUsers: config._count.verifiedUsers,
      },
      createdAt: config.createdAt,
    });
  }

  return {
    guilds,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  };
}

/**
 * Get detailed information about a specific guild
 */
export async function getGuildDetails(guildId: string): Promise<GuildInfo | null> {
  const discordGuild = client.guilds.cache.get(guildId);
  if (!discordGuild) return null;

  const config = await prisma.guildConfig.findUnique({
    where: { guildId },
    include: {
      _count: {
        select: { verifiedUsers: true, usageLogs: true },
      },
    },
  });

  if (!config) return null;

  const now = new Date();
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const monthlyUsage = await prisma.usageLog.aggregate({
    where: {
      guildId,
      createdAt: { gte: startOfMonth },
    },
    _sum: { characterCount: true },
    _count: true,
  });

  // Try to get owner username
  let ownerUsername: string | undefined;
  try {
    const owner = await discordGuild.members.fetch(discordGuild.ownerId);
    ownerUsername = owner.user.username;
  } catch {
    // Owner not in cache
  }

  return {
    id: guildId,
    name: discordGuild.name,
    icon: discordGuild.iconURL(),
    memberCount: discordGuild.memberCount,
    ownerId: discordGuild.ownerId,
    ownerUsername,
    hasImmersion: config.categoryId !== null,
    subscription: {
      tier: config.subscriptionTier,
      expiresAt: config.subscriptionExpiresAt,
      isActive:
        config.subscriptionTier === "free" ||
        !config.subscriptionExpiresAt ||
        config.subscriptionExpiresAt > now,
    },
    usage: {
      monthlyCharacters: monthlyUsage._sum.characterCount || 0,
      monthlyTranslations: monthlyUsage._count || 0,
      verifiedUsers: config._count.verifiedUsers,
    },
    createdAt: config.createdAt,
  };
}

/**
 * Update a guild's subscription tier
 */
export async function updateGuildSubscription(
  guildId: string,
  tier: string,
  durationDays?: number,
  developerId?: string
): Promise<{ success: boolean; error?: string }> {
  if (!["free", "pro", "premium"].includes(tier)) {
    return { success: false, error: "Invalid subscription tier" };
  }

  try {
    const expiresAt =
      tier === "free" || !durationDays
        ? null
        : new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000);

    await prisma.guildConfig.update({
      where: { guildId },
      data: {
        subscriptionTier: tier,
        subscriptionExpiresAt: expiresAt,
      },
    });

    // Log the action
    if (developerId) {
      await prisma.developerAuditLog.create({
        data: {
          developerId,
          action: "subscription_update",
          targetType: "guild",
          targetId: guildId,
          details: JSON.stringify({ tier, durationDays, expiresAt }),
        },
      });
    }

    return { success: true };
  } catch (error: any) {
    console.error("Error updating guild subscription:", error);
    return { success: false, error: error.message || "Failed to update subscription" };
  }
}

/**
 * Search users globally
 */
export async function searchUsers(options: {
  search: string;
  page?: number;
  limit?: number;
}): Promise<{ users: UserInfo[]; total: number; page: number; totalPages: number }> {
  const page = options.page || 1;
  const limit = Math.min(options.limit || 20, 100);
  const skip = (page - 1) * limit;

  const searchLower = options.search.toLowerCase();
  const isSnowflake = /^\d{17,19}$/.test(options.search);

  const where: any = isSnowflake
    ? { discordId: options.search }
    : {
        username: {
          contains: searchLower,
          mode: "insensitive",
        },
      };

  const [dbUsers, total] = await Promise.all([
    prisma.user.findMany({
      where,
      include: {
        verifiedUsers: {
          select: {
            guildId: true,
            verifiedAt: true,
            monthlyCharacterUsage: true,
            totalTranslations: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.user.count({ where }),
  ]);

  const now = new Date();
  const users: UserInfo[] = await Promise.all(
    dbUsers.map(async (user) => {
      // Get guild names
      const guildsWithNames = await Promise.all(
        user.verifiedUsers.map(async (vu) => {
          const guild = client.guilds.cache.get(vu.guildId);
          return {
            guildId: vu.guildId,
            guildName: guild?.name || "Unknown",
            verifiedAt: vu.verifiedAt,
            monthlyUsage: vu.monthlyCharacterUsage,
            totalTranslations: vu.totalTranslations,
          };
        })
      );

      return {
        id: user.id,
        discordId: user.discordId,
        username: user.username,
        avatar: user.avatar,
        subscription: {
          tier: user.subscriptionTier,
          expiresAt: user.subscriptionExpiresAt,
          isActive:
            user.subscriptionTier === "free" ||
            !user.subscriptionExpiresAt ||
            user.subscriptionExpiresAt > now,
        },
        stats: {
          totalTranslationsAllTime: user.totalTranslationsAllTime,
          totalCharactersAllTime: user.totalCharactersAllTime,
        },
        guilds: guildsWithNames,
        isBotDeveloper: user.isBotDeveloper,
        createdAt: user.createdAt,
      };
    })
  );

  return {
    users,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  };
}

/**
 * Get detailed user information
 */
export async function getUserDetails(discordId: string): Promise<UserInfo | null> {
  const user = await prisma.user.findUnique({
    where: { discordId },
    include: {
      verifiedUsers: {
        select: {
          guildId: true,
          verifiedAt: true,
          monthlyCharacterUsage: true,
          totalTranslations: true,
        },
      },
    },
  });

  if (!user) return null;

  const now = new Date();
  const guildsWithNames = await Promise.all(
    user.verifiedUsers.map(async (vu) => {
      const guild = client.guilds.cache.get(vu.guildId);
      return {
        guildId: vu.guildId,
        guildName: guild?.name || "Unknown",
        verifiedAt: vu.verifiedAt,
        monthlyUsage: vu.monthlyCharacterUsage,
        totalTranslations: vu.totalTranslations,
      };
    })
  );

  return {
    id: user.id,
    discordId: user.discordId,
    username: user.username,
    avatar: user.avatar,
    subscription: {
      tier: user.subscriptionTier,
      expiresAt: user.subscriptionExpiresAt,
      isActive:
        user.subscriptionTier === "free" ||
        !user.subscriptionExpiresAt ||
        user.subscriptionExpiresAt > now,
    },
    stats: {
      totalTranslationsAllTime: user.totalTranslationsAllTime,
      totalCharactersAllTime: user.totalCharactersAllTime,
    },
    guilds: guildsWithNames,
    isBotDeveloper: user.isBotDeveloper,
    createdAt: user.createdAt,
  };
}

/**
 * Update a user's subscription tier
 */
export async function updateUserSubscription(
  discordId: string,
  tier: string,
  durationDays?: number,
  developerId?: string
): Promise<{ success: boolean; error?: string }> {
  if (!["free", "pro", "premium"].includes(tier)) {
    return { success: false, error: "Invalid subscription tier" };
  }

  try {
    const expiresAt =
      tier === "free" || !durationDays
        ? null
        : new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000);

    await prisma.user.update({
      where: { discordId },
      data: {
        subscriptionTier: tier,
        subscriptionExpiresAt: expiresAt,
      },
    });

    // Log the action
    if (developerId) {
      await prisma.developerAuditLog.create({
        data: {
          developerId,
          action: "subscription_update",
          targetType: "user",
          targetId: discordId,
          details: JSON.stringify({ tier, durationDays, expiresAt }),
        },
      });
    }

    return { success: true };
  } catch (error: any) {
    console.error("Error updating user subscription:", error);
    return { success: false, error: error.message || "Failed to update subscription" };
  }
}

/**
 * Get developer audit log
 */
export async function getAuditLog(options: {
  developerId?: string;
  action?: string;
  page?: number;
  limit?: number;
}): Promise<{
  logs: any[];
  total: number;
  page: number;
  totalPages: number;
}> {
  const page = options.page || 1;
  const limit = Math.min(options.limit || 50, 100);
  const skip = (page - 1) * limit;

  const where: any = {};
  if (options.developerId) where.developerId = options.developerId;
  if (options.action) where.action = options.action;

  const [logs, total] = await Promise.all([
    prisma.developerAuditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.developerAuditLog.count({ where }),
  ]);

  return {
    logs: logs.map((log) => ({
      ...log,
      details: JSON.parse(log.details),
    })),
    total,
    page,
    totalPages: Math.ceil(total / limit),
  };
}

/**
 * Reset a guild's configuration to defaults
 * Preserves subscription info and usage tracking
 */
export async function resetGuildConfig(
  guildId: string,
  developerId?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const config = await prisma.guildConfig.findUnique({
      where: { guildId },
    });

    if (!config) {
      return { success: false, error: "Guild configuration not found" };
    }

    // Ensure usage is synced to GuildUsageTracker before reset
    await prisma.guildUsageTracker.upsert({
      where: { guildId },
      create: {
        guildId,
        monthlyCharacterUsage: config.monthlyCharacterUsage,
        usageResetDate: config.usageResetDate,
        lastResetAt: new Date(),
        resetCount: 1,
      },
      update: {
        monthlyCharacterUsage: config.monthlyCharacterUsage,
        usageResetDate: config.usageResetDate,
        lastResetAt: new Date(),
        resetCount: { increment: 1 },
      },
    });

    // Reset configuration fields while preserving subscription and usage
    await prisma.guildConfig.update({
      where: { guildId },
      data: {
        // Reset immersion setup
        categoryId: null,
        instructionsChannelId: null,

        // Reset all language channels
        englishChannelId: null,
        spanishChannelId: null,
        portugueseChannelId: null,
        frenchChannelId: null,
        germanChannelId: null,
        italianChannelId: null,
        japaneseChannelId: null,
        koreanChannelId: null,
        chineseChannelId: null,

        // Reset all webhooks
        englishWebhookId: null,
        englishWebhookToken: null,
        spanishWebhookId: null,
        spanishWebhookToken: null,
        portugueseWebhookId: null,
        portugueseWebhookToken: null,
        frenchWebhookId: null,
        frenchWebhookToken: null,
        germanWebhookId: null,
        germanWebhookToken: null,
        italianWebhookId: null,
        italianWebhookToken: null,
        japaneseWebhookId: null,
        japaneseWebhookToken: null,
        koreanWebhookId: null,
        koreanWebhookToken: null,
        chineseWebhookId: null,
        chineseWebhookToken: null,

        // Reset moderation settings
        modLogChannelId: null,

        // Reset language settings
        enabledLanguages: "[]",
        disabledCategoryId: null,

        // Reset permission settings
        useCustomPermissions: false,

        // Note: subscription info (subscriptionTier, subscriptionExpiresAt, stripeCustomerId, stripeSubscriptionId) is preserved
        // Note: usage info (monthlyCharacterUsage, usageResetDate) is preserved
      },
    });

    // Delete command permission overrides
    await prisma.commandPermission.deleteMany({
      where: { guildId },
    });

    // Log the action
    if (developerId) {
      await prisma.developerAuditLog.create({
        data: {
          developerId,
          action: "config_reset",
          targetType: "guild",
          targetId: guildId,
          details: JSON.stringify({
            resetAt: new Date().toISOString(),
          }),
        },
      });
    }

    return { success: true };
  } catch (error: any) {
    console.error("Error resetting guild config:", error);
    return { success: false, error: error.message || "Failed to reset configuration" };
  }
}

export const developerService = {
  getBotStats,
  listGuilds,
  getGuildDetails,
  updateGuildSubscription,
  searchUsers,
  getUserDetails,
  updateUserSubscription,
  getAuditLog,
  resetGuildConfig,
};
