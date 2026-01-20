import { Router, Request, Response } from "express";
import { isAuthenticated } from "../middleware/auth";
import { prisma } from "../../database/prisma";
import { client } from "../../client";
import { getTierLimits, getEffectiveUserLimit, getEffectiveTierSource, USER_SUBSCRIPTION_TIERS } from "../../config/subscriptions";
import { stripeService } from "../../services/stripe";
import { SUBSCRIPTION_TIERS } from "../../config/subscriptions";
import { ACHIEVEMENTS, getAchievementById } from "../../config/achievements";

const router = Router();

// Get current user info (with personal subscription)
router.get("/auth/me", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;

    // Get global user subscription info
    const globalUser = await prisma.user.findUnique({
      where: { discordId: userId },
    });

    const subscription = globalUser ? {
      tier: globalUser.subscriptionTier,
      expiresAt: globalUser.subscriptionExpiresAt?.toISOString() || null,
      isActive: globalUser.subscriptionTier === "free" ||
        !globalUser.subscriptionExpiresAt ||
        globalUser.subscriptionExpiresAt > new Date(),
      totalTranslationsAllTime: globalUser.totalTranslationsAllTime,
      totalCharactersAllTime: globalUser.totalCharactersAllTime,
    } : null;

    res.json({
      user: req.user,
      subscription,
    });
  } catch (error) {
    console.error("Error fetching user info:", error);
    res.status(500).json({ error: "Failed to fetch user info" });
  }
});

// Get user's guilds where bot is present
router.get("/guilds", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;

    // Get all guilds where the bot is present
    const botGuilds = client.guilds.cache;

    // Get guilds where user is verified
    const verifiedGuilds = await prisma.verifiedUser.findMany({
      where: { discordId: userId },
      select: { guildId: true },
    });

    const verifiedGuildIds = new Set(verifiedGuilds.map((v) => v.guildId));

    // Filter to guilds where both bot and user are present
    const mutualGuilds = [];

    for (const [guildId, guild] of botGuilds) {
      try {
        // Check if user is in this guild
        const member = await guild.members.fetch(userId).catch(() => null);
        if (member) {
          // Get guild config
          const config = await prisma.guildConfig.findUnique({
            where: { guildId },
          });

          mutualGuilds.push({
            id: guild.id,
            name: guild.name,
            icon: guild.iconURL(),
            isVerified: verifiedGuildIds.has(guildId),
            hasImmersion: !!config?.categoryId,
            subscription: config
              ? {
                  tier: config.subscriptionTier,
                  expiresAt: config.subscriptionExpiresAt?.toISOString() || null,
                  isActive:
                    config.subscriptionTier === "free" ||
                    !config.subscriptionExpiresAt ||
                    config.subscriptionExpiresAt > new Date(),
                }
              : null,
          });
        }
      } catch (e) {
        // Skip guilds where we can't check membership
      }
    }

    res.json({ guilds: mutualGuilds });
  } catch (error) {
    console.error("Error fetching guilds:", error);
    res.status(500).json({ error: "Failed to fetch guilds" });
  }
});

// Verify user for a guild
router.post("/guilds/:id/verify", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const guildId = req.params.id;
    const user = req.user!;

    // Check if guild has immersion set up
    const config = await prisma.guildConfig.findUnique({
      where: { guildId },
    });

    if (!config?.categoryId) {
      return res.status(400).json({
        error: "Language immersion is not set up for this server",
      });
    }

    // Check if user is in the guild
    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
      return res.status(404).json({ error: "Guild not found" });
    }

    const member = await guild.members.fetch(user.id).catch(() => null);
    if (!member) {
      return res.status(403).json({ error: "You are not a member of this server" });
    }

    // Create or update verified user
    await prisma.verifiedUser.upsert({
      where: {
        discordId_guildId: {
          discordId: user.id,
          guildId,
        },
      },
      create: {
        discordId: user.id,
        guildId,
        username: user.username,
        discriminator: user.discriminator,
        avatar: user.avatar,
      },
      update: {
        username: user.username,
        discriminator: user.discriminator,
        avatar: user.avatar,
      },
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Error verifying user:", error);
    res.status(500).json({ error: "Failed to verify user" });
  }
});

// Get usage statistics
router.get("/usage", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;

    // Get global user for personal subscription info
    const globalUser = await prisma.user.findUnique({
      where: { discordId: userId },
    });
    const userTier = globalUser?.subscriptionTier || "free";

    // Get user's verification records with usage
    const verifiedUsers = await prisma.verifiedUser.findMany({
      where: { discordId: userId },
      include: {
        guildConfig: {
          select: {
            monthlyCharacterUsage: true,
            usageResetDate: true,
            subscriptionTier: true,
          },
        },
      },
    });

    // Get guild names
    const guildNames: Record<string, string> = {};
    for (const vu of verifiedUsers) {
      const guild = client.guilds.cache.get(vu.guildId);
      if (guild) {
        guildNames[vu.guildId] = guild.name;
      }
    }

    const usage = verifiedUsers.map((vu) => {
      const guildTier = vu.guildConfig.subscriptionTier;
      const guildLimits = getTierLimits(guildTier);
      const effectiveUserLimit = getEffectiveUserLimit(userTier, guildTier);
      const effectiveTierSource = getEffectiveTierSource(userTier, guildTier);

      return {
        guildId: vu.guildId,
        guildName: guildNames[vu.guildId] || "Unknown Server",
        userUsage: vu.monthlyCharacterUsage,
        userLimit: effectiveUserLimit,
        guildUsage: vu.guildConfig.monthlyCharacterUsage,
        guildLimit: guildLimits.perGuild,
        resetDate: vu.usageResetDate,
        tier: guildTier,
        // New fields for effective tier info
        effectiveTier: effectiveTierSource === "user" ? userTier : guildTier,
        effectiveTierSource,
        userTier,
        guildTier,
      };
    });

    // Include personal subscription info in response
    const personalSubscription = globalUser ? {
      tier: globalUser.subscriptionTier,
      expiresAt: globalUser.subscriptionExpiresAt?.toISOString() || null,
      isActive: globalUser.subscriptionTier === "free" ||
        !globalUser.subscriptionExpiresAt ||
        globalUser.subscriptionExpiresAt > new Date(),
    } : { tier: "free", expiresAt: null, isActive: true };

    res.json({ usage, personalSubscription });
  } catch (error) {
    console.error("Error fetching usage:", error);
    res.status(500).json({ error: "Failed to fetch usage" });
  }
});

// Get subscription info for a guild
router.get("/guilds/:id/subscription", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const guildId = req.params.id;
    const userId = req.user!.id;

    // Verify user has access to this guild
    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
      return res.status(404).json({ error: "Guild not found" });
    }

    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) {
      return res.status(403).json({ error: "You are not a member of this server" });
    }

    const status = await stripeService.getSubscriptionStatus(guildId);

    res.json({
      tiers: Object.values(SUBSCRIPTION_TIERS),
      currentTier: status.tier,
      expiresAt: status.expiresAt?.toISOString() || null,
      isActive: status.isActive,
    });
  } catch (error) {
    console.error("Error fetching subscription:", error);
    res.status(500).json({ error: "Failed to fetch subscription" });
  }
});

// Create Stripe checkout session
router.post("/guilds/:id/subscription/checkout", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const guildId = req.params.id;
    const userId = req.user!.id;
    const { tier } = req.body;

    if (!tier || !["pro", "premium"].includes(tier)) {
      return res.status(400).json({ error: "Invalid subscription tier" });
    }

    // Verify user has admin access to this guild
    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
      return res.status(404).json({ error: "Guild not found" });
    }

    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) {
      return res.status(403).json({ error: "You are not a member of this server" });
    }

    // Check if user has admin permissions
    if (!member.permissions.has("Administrator")) {
      return res.status(403).json({ error: "Only administrators can manage subscriptions" });
    }

    const session = await stripeService.createCheckoutSession(guildId, tier, userId);
    res.json(session);
  } catch (error: any) {
    console.error("Error creating checkout session:", error);
    res.status(500).json({ error: error.message || "Failed to create checkout session" });
  }
});

// Get Stripe billing portal URL
router.post("/guilds/:id/subscription/portal", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const guildId = req.params.id;
    const userId = req.user!.id;

    // Verify user has admin access to this guild
    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
      return res.status(404).json({ error: "Guild not found" });
    }

    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) {
      return res.status(403).json({ error: "You are not a member of this server" });
    }

    if (!member.permissions.has("Administrator")) {
      return res.status(403).json({ error: "Only administrators can manage subscriptions" });
    }

    const portal = await stripeService.createBillingPortalSession(guildId);
    res.json(portal);
  } catch (error: any) {
    console.error("Error creating billing portal session:", error);
    res.status(500).json({ error: error.message || "Failed to open billing portal" });
  }
});

// Cancel subscription
router.delete("/guilds/:id/subscription", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const guildId = req.params.id;
    const userId = req.user!.id;

    // Verify user has admin access to this guild
    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
      return res.status(404).json({ error: "Guild not found" });
    }

    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) {
      return res.status(403).json({ error: "You are not a member of this server" });
    }

    if (!member.permissions.has("Administrator")) {
      return res.status(403).json({ error: "Only administrators can manage subscriptions" });
    }

    await stripeService.cancelSubscription(guildId);
    res.json({ success: true });
  } catch (error: any) {
    console.error("Error canceling subscription:", error);
    res.status(500).json({ error: error.message || "Failed to cancel subscription" });
  }
});

// Get user profile for a guild
router.get("/guilds/:id/profile", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const guildId = req.params.id;
    const userId = req.user!.id;

    const verifiedUser = await prisma.verifiedUser.findUnique({
      where: {
        discordId_guildId: {
          discordId: userId,
          guildId,
        },
      },
      include: {
        guildConfig: {
          select: { subscriptionTier: true },
        },
      },
    });

    if (!verifiedUser) {
      return res.status(404).json({ error: "User not verified in this guild" });
    }

    // Get global user for personal subscription
    const globalUser = await prisma.user.findUnique({
      where: { discordId: userId },
    });
    const userTier = globalUser?.subscriptionTier || "free";
    const guildTier = verifiedUser.guildConfig.subscriptionTier;
    const effectiveTierSource = getEffectiveTierSource(userTier, guildTier);
    const effectiveTier = effectiveTierSource === "user" ? userTier : guildTier;

    // Get server rank
    const allUsers = await prisma.verifiedUser.findMany({
      where: { guildId },
      orderBy: { totalTranslations: "desc" },
      select: { discordId: true },
    });
    const serverRank = allUsers.findIndex((u) => u.discordId === userId) + 1;

    // Parse achievements
    const achievementIds: string[] = JSON.parse(verifiedUser.achievements || "[]");
    const earnedAchievements = achievementIds
      .map((id) => getAchievementById(id))
      .filter((a) => a !== undefined);

    res.json({
      profile: {
        discordId: verifiedUser.discordId,
        username: verifiedUser.username,
        avatar: verifiedUser.avatar,
        totalTranslations: verifiedUser.totalTranslations,
        currentStreak: verifiedUser.currentStreak,
        longestStreak: verifiedUser.longestStreak,
        monthlyCharacterUsage: verifiedUser.monthlyCharacterUsage,
        verifiedAt: verifiedUser.verifiedAt.toISOString(),
        lastActiveDate: verifiedUser.lastActiveDate?.toISOString() || null,
        serverRank,
        totalMembers: allUsers.length,
      },
      achievements: {
        earned: earnedAchievements,
        total: ACHIEVEMENTS.length,
        all: ACHIEVEMENTS,
      },
      // Tier information
      effectiveTier,
      effectiveTierSource,
      userTier,
      guildTier,
    });
  } catch (error) {
    console.error("Error fetching profile:", error);
    res.status(500).json({ error: "Failed to fetch profile" });
  }
});

// Get leaderboard for a guild
router.get("/guilds/:id/leaderboard", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const guildId = req.params.id;
    const userId = req.user!.id;
    const type = req.query.type as string || "month";

    // Verify user is in the guild
    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
      return res.status(404).json({ error: "Guild not found" });
    }

    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) {
      return res.status(403).json({ error: "You are not a member of this server" });
    }

    let leaderboardData;

    if (type === "month") {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      leaderboardData = await prisma.usageLog.groupBy({
        by: ["userId"],
        where: {
          guildId,
          createdAt: { gte: startOfMonth },
        },
        _sum: { characterCount: true },
        orderBy: { _sum: { characterCount: "desc" } },
        take: 10,
      });
    } else {
      leaderboardData = await prisma.usageLog.groupBy({
        by: ["userId"],
        where: { guildId },
        _sum: { characterCount: true },
        orderBy: { _sum: { characterCount: "desc" } },
        take: 10,
      });
    }

    // Fetch user info for leaderboard
    const leaderboard = await Promise.all(
      leaderboardData.map(async (entry, index) => {
        let username = "Unknown User";
        let avatar = null;

        try {
          const member = await guild.members.fetch(entry.userId);
          username = member.displayName;
          avatar = member.user.avatarURL();
        } catch {
          const verifiedUser = await prisma.verifiedUser.findFirst({
            where: { discordId: entry.userId, guildId },
          });
          username = verifiedUser?.username || "Unknown User";
          avatar = verifiedUser?.avatar
            ? `https://cdn.discordapp.com/avatars/${entry.userId}/${verifiedUser.avatar}.png`
            : null;
        }

        return {
          rank: index + 1,
          discordId: entry.userId,
          username,
          avatar,
          characterCount: entry._sum.characterCount || 0,
        };
      })
    );

    // Check if requesting user is in leaderboard
    const userRank = leaderboardData.findIndex((e) => e.userId === userId);
    let userEntry = null;

    if (userRank === -1) {
      // User not in top 10, get their stats
      let userStats;
      if (type === "month") {
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);

        userStats = await prisma.usageLog.aggregate({
          where: {
            guildId,
            userId,
            createdAt: { gte: startOfMonth },
          },
          _sum: { characterCount: true },
        });
      } else {
        userStats = await prisma.usageLog.aggregate({
          where: { guildId, userId },
          _sum: { characterCount: true },
        });
      }

      if (userStats._sum.characterCount) {
        // Get actual rank
        const allData = type === "month"
          ? await prisma.usageLog.groupBy({
              by: ["userId"],
              where: {
                guildId,
                createdAt: { gte: new Date(new Date().setDate(1)) },
              },
              _sum: { characterCount: true },
              orderBy: { _sum: { characterCount: "desc" } },
            })
          : await prisma.usageLog.groupBy({
              by: ["userId"],
              where: { guildId },
              _sum: { characterCount: true },
              orderBy: { _sum: { characterCount: "desc" } },
            });

        const actualRank = allData.findIndex((e) => e.userId === userId) + 1;

        userEntry = {
          rank: actualRank,
          discordId: userId,
          username: req.user!.username,
          avatar: req.user!.avatar
            ? `https://cdn.discordapp.com/avatars/${userId}/${req.user!.avatar}.png`
            : null,
          characterCount: userStats._sum.characterCount || 0,
        };
      }
    }

    res.json({
      leaderboard,
      userEntry,
      type,
    });
  } catch (error) {
    console.error("Error fetching leaderboard:", error);
    res.status(500).json({ error: "Failed to fetch leaderboard" });
  }
});

// Get all achievements (public endpoint)
router.get("/achievements", (_req: Request, res: Response) => {
  res.json({ achievements: ACHIEVEMENTS });
});

// ============ User Subscription Endpoints ============

// Get user's personal subscription
router.get("/user/subscription", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const status = await stripeService.getUserSubscriptionStatus(userId);

    res.json({
      tiers: Object.values(USER_SUBSCRIPTION_TIERS),
      currentTier: status.tier,
      expiresAt: status.expiresAt?.toISOString() || null,
      isActive: status.isActive,
    });
  } catch (error) {
    console.error("Error fetching user subscription:", error);
    res.status(500).json({ error: "Failed to fetch subscription" });
  }
});

// Create checkout session for personal subscription
router.post("/user/subscription/checkout", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { tier } = req.body;

    if (!tier || !["pro", "premium"].includes(tier)) {
      return res.status(400).json({ error: "Invalid subscription tier" });
    }

    // Check if user exists, create if not
    let globalUser = await prisma.user.findUnique({
      where: { discordId: userId },
    });

    if (!globalUser) {
      globalUser = await prisma.user.create({
        data: {
          discordId: userId,
          username: req.user!.username,
          avatar: req.user!.avatar,
        },
      });
    }

    const session = await stripeService.createUserCheckoutSession(userId, tier);
    res.json(session);
  } catch (error: any) {
    console.error("Error creating user checkout session:", error);
    res.status(500).json({ error: error.message || "Failed to create checkout session" });
  }
});

// Get billing portal URL for personal subscription
router.post("/user/subscription/portal", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const portal = await stripeService.createUserBillingPortalSession(userId);
    res.json(portal);
  } catch (error: any) {
    console.error("Error creating user billing portal session:", error);
    res.status(500).json({ error: error.message || "Failed to open billing portal" });
  }
});

// Cancel personal subscription
router.delete("/user/subscription", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    await stripeService.cancelUserSubscription(userId);
    res.json({ success: true });
  } catch (error: any) {
    console.error("Error canceling user subscription:", error);
    res.status(500).json({ error: error.message || "Failed to cancel subscription" });
  }
});

export default router;
