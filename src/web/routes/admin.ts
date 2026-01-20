import { Router, Request, Response } from "express";
import { isAuthenticated, isGuildAdmin, isGuildModerator } from "../middleware/auth";
import {
  validateGuildId,
  validateUserId,
  strictRateLimiter,
  auditLog,
  sanitizeString,
  validateLanguageCodes,
} from "../middleware/security";
import { dashboardService } from "../../services/dashboard";
import { immersionManager } from "../../services/immersionManager";
import { prisma } from "../../database/prisma";
import { client } from "../../client";
import {
  parseSubscribedLanguages,
  serializeSubscribedLanguages,
} from "../../config/preferences";
import { channelPermissionService } from "../../services/channelPermissions";
import { LANGUAGES } from "../../config/languages";
import { getTierLimits } from "../../config/subscriptions";

const router = Router();

// ============ Guild Overview (Dashboard Home) ============

/**
 * Get comprehensive guild overview for dashboard
 * GET /admin/guilds/:id/overview
 */
router.get(
  "/guilds/:id/overview",
  isAuthenticated,
  validateGuildId,
  isGuildAdmin,
  async (req: Request, res: Response) => {
    try {
      const guildId = req.params.id;
      const guild = client.guilds.cache.get(guildId);

      if (!guild) {
        return res.status(404).json({ error: "Guild not found" });
      }

      // Get immersion status
      const immersionStatus = await immersionManager.getStatus(guildId);

      // Get guild config
      const config = await prisma.guildConfig.findUnique({
        where: { guildId },
        include: {
          _count: {
            select: {
              verifiedUsers: true,
              usageLogs: true,
            },
          },
        },
      });

      // Get bot permissions
      const permissions = await dashboardService.checkBotPermissions(guildId);

      // Get available categories and channels for setup
      const availableCategories = await immersionManager.getAvailableCategories(guildId);
      const availableChannels = await immersionManager.getAvailableChannels(guildId);

      // Get tier limits
      const tier = config?.subscriptionTier || "free";
      const tierLimits = getTierLimits(tier);

      // Get this month's stats
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const monthlyStats = await prisma.usageLog.aggregate({
        where: {
          guildId,
          createdAt: { gte: startOfMonth },
        },
        _sum: { characterCount: true },
        _count: true,
      });

      const activeUsersThisMonth = await prisma.usageLog
        .groupBy({
          by: ["userId"],
          where: {
            guildId,
            createdAt: { gte: startOfMonth },
          },
        })
        .then((r) => r.length);

      // Get recent activity (last 5)
      const recentActivity = await prisma.usageLog.findMany({
        where: { guildId },
        orderBy: { createdAt: "desc" },
        take: 5,
        include: {
          verifiedUser: {
            select: { username: true, avatar: true },
          },
        },
      });

      res.json({
        guild: {
          id: guild.id,
          name: guild.name,
          icon: guild.iconURL(),
          memberCount: guild.memberCount,
          ownerId: guild.ownerId,
        },
        immersion: immersionStatus,
        subscription: {
          tier,
          expiresAt: config?.subscriptionExpiresAt?.toISOString() || null,
          isActive:
            tier === "free" ||
            !config?.subscriptionExpiresAt ||
            config.subscriptionExpiresAt > new Date(),
          limits: tierLimits,
        },
        usage: {
          monthly: config?.monthlyCharacterUsage || 0,
          limit: tierLimits.perGuild,
          percentage: config
            ? Math.round((config.monthlyCharacterUsage / tierLimits.perGuild) * 100)
            : 0,
          resetDate: config?.usageResetDate?.toISOString() || null,
        },
        stats: {
          verifiedUsers: config?._count.verifiedUsers || 0,
          totalTranslations: config?._count.usageLogs || 0,
          monthlyTranslations: monthlyStats._count || 0,
          monthlyCharacters: monthlyStats._sum.characterCount || 0,
          activeUsersThisMonth,
        },
        botPermissions: permissions,
        setup: {
          availableCategories,
          availableChannels,
          languages: Object.values(LANGUAGES).map((lang) => ({
            code: lang.code,
            name: lang.name,
            emoji: lang.emoji,
            channelName: lang.channelName,
          })),
        },
        recentActivity: recentActivity.map((log) => ({
          id: log.id,
          userId: log.userId,
          username: log.verifiedUser?.username || "Unknown",
          sourceLanguage: log.sourceLanguage,
          characterCount: log.characterCount,
          createdAt: log.createdAt.toISOString(),
        })),
      });
    } catch (error) {
      console.error("Error fetching guild overview:", error);
      res.status(500).json({ error: "Failed to fetch guild overview" });
    }
  }
);

// ============ Guild Settings ============

/**
 * Get full guild settings (admin only)
 * GET /admin/guilds/:id/settings
 */
router.get(
  "/guilds/:id/settings",
  isAuthenticated,
  validateGuildId,
  isGuildAdmin,
  auditLog("view_guild_settings"),
  async (req: Request, res: Response) => {
    try {
      const settings = await dashboardService.getGuildSettings(req.params.id);
      if (!settings) {
        return res.status(404).json({ error: "Guild not found" });
      }
      res.json({ settings });
    } catch (error) {
      console.error("Error fetching guild settings:", error);
      res.status(500).json({ error: "Failed to fetch guild settings" });
    }
  }
);

/**
 * Check bot permissions in guild
 * GET /admin/guilds/:id/permissions
 */
router.get(
  "/guilds/:id/permissions",
  isAuthenticated,
  validateGuildId,
  isGuildAdmin,
  async (req: Request, res: Response) => {
    try {
      const permissions = await dashboardService.checkBotPermissions(req.params.id);
      res.json(permissions);
    } catch (error) {
      console.error("Error checking permissions:", error);
      res.status(500).json({ error: "Failed to check permissions" });
    }
  }
);

// ============ Guild Members Management ============

/**
 * Get verified members list (admin/mod only)
 * GET /admin/guilds/:id/members
 */
router.get(
  "/guilds/:id/members",
  isAuthenticated,
  validateGuildId,
  isGuildModerator,
  async (req: Request, res: Response) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
      const search = req.query.search ? sanitizeString(req.query.search as string, 100) : undefined;

      const result = await dashboardService.getGuildMembers(req.params.id, {
        page,
        limit,
        search,
      });
      res.json(result);
    } catch (error) {
      console.error("Error fetching guild members:", error);
      res.status(500).json({ error: "Failed to fetch guild members" });
    }
  }
);

/**
 * Remove a verified user (admin only)
 * DELETE /admin/guilds/:id/members/:userId
 */
router.delete(
  "/guilds/:id/members/:userId",
  isAuthenticated,
  validateGuildId,
  validateUserId,
  isGuildAdmin,
  strictRateLimiter,
  auditLog("remove_member"),
  async (req: Request, res: Response) => {
    try {
      const success = await dashboardService.removeVerifiedUser(
        req.params.id,
        req.params.userId
      );
      if (!success) {
        return res.status(404).json({ error: "User not found" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Error removing member:", error);
      res.status(500).json({ error: "Failed to remove member" });
    }
  }
);

/**
 * Update a member's settings (admin only)
 * PATCH /admin/guilds/:id/members/:userId
 */
router.patch(
  "/guilds/:id/members/:userId",
  isAuthenticated,
  validateGuildId,
  validateUserId,
  isGuildAdmin,
  strictRateLimiter,
  auditLog("update_member"),
  async (req: Request, res: Response) => {
    try {
      const { showOnLeaderboard, subscribedLanguages } = req.body;
      const guildId = req.params.id;
      const userId = req.params.userId;

      const updateData: any = {};

      // Validate and set showOnLeaderboard
      if (typeof showOnLeaderboard === "boolean") {
        updateData.showOnLeaderboard = showOnLeaderboard;
      }

      // Validate and set subscribedLanguages
      if (subscribedLanguages !== undefined) {
        const validatedLanguages = validateLanguageCodes(subscribedLanguages);
        if (validatedLanguages === null && subscribedLanguages.length > 0) {
          return res.status(400).json({ error: "Invalid language codes provided" });
        }
        updateData.subscribedLanguages = serializeSubscribedLanguages(validatedLanguages || []);
      }

      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ error: "No valid fields to update" });
      }

      const updated = await prisma.verifiedUser.update({
        where: {
          discordId_guildId: {
            discordId: userId,
            guildId,
          },
        },
        data: updateData,
      });

      // Update channel permissions if languages changed
      if (updateData.subscribedLanguages !== undefined) {
        const guildConfig = await prisma.guildConfig.findUnique({
          where: { guildId },
        });

        if (guildConfig) {
          const guild = client.guilds.cache.get(guildId);
          if (guild) {
            const languages = parseSubscribedLanguages(updateData.subscribedLanguages);
            await channelPermissionService.updateUserChannelAccess(
              guild,
              userId,
              languages,
              guildConfig
            );
          }
        }
      }

      res.json({ success: true, updated });
    } catch (error: any) {
      if (error.code === "P2025") {
        return res.status(404).json({ error: "User not found" });
      }
      console.error("Error updating member:", error);
      res.status(500).json({ error: "Failed to update member" });
    }
  }
);

// ============ Analytics ============

/**
 * Get guild analytics (admin only)
 * GET /admin/guilds/:id/analytics
 */
router.get(
  "/guilds/:id/analytics",
  isAuthenticated,
  validateGuildId,
  isGuildAdmin,
  async (req: Request, res: Response) => {
    try {
      const days = Math.min(parseInt(req.query.days as string) || 30, 90);
      const analytics = await dashboardService.getGuildAnalytics(req.params.id, days);
      res.json(analytics);
    } catch (error) {
      console.error("Error fetching analytics:", error);
      res.status(500).json({ error: "Failed to fetch analytics" });
    }
  }
);

// ============ Guild Configuration ============

/**
 * Get guild's language channel configuration
 * GET /admin/guilds/:id/channels
 */
router.get(
  "/guilds/:id/channels",
  isAuthenticated,
  validateGuildId,
  isGuildAdmin,
  async (req: Request, res: Response) => {
    try {
      const guildId = req.params.id;
      const guild = client.guilds.cache.get(guildId);

      if (!guild) {
        return res.status(404).json({ error: "Guild not found" });
      }

      const config = await prisma.guildConfig.findUnique({
        where: { guildId },
      });

      // Get all text channels in the guild for potential reassignment
      const availableChannels = guild.channels.cache
        .filter((c) => c.type === 0) // GuildText
        .map((c) => ({
          id: c.id,
          name: c.name,
          parentId: c.parentId,
        }));

      // Get categories
      const categories = guild.channels.cache
        .filter((c) => c.type === 4) // GuildCategory
        .map((c) => ({
          id: c.id,
          name: c.name,
        }));

      res.json({
        config: config
          ? {
              categoryId: config.categoryId,
              channels: {
                EN: config.englishChannelId,
                ES: config.spanishChannelId,
                "PT-BR": config.portugueseChannelId,
                FR: config.frenchChannelId,
                DE: config.germanChannelId,
                IT: config.italianChannelId,
                JA: config.japaneseChannelId,
                KO: config.koreanChannelId,
                ZH: config.chineseChannelId,
              },
            }
          : null,
        availableChannels,
        categories,
      });
    } catch (error) {
      console.error("Error fetching channel config:", error);
      res.status(500).json({ error: "Failed to fetch channel configuration" });
    }
  }
);

// ============ Audit Log ============

/**
 * Get recent activity log for a guild (admin only)
 * GET /admin/guilds/:id/activity
 */
router.get(
  "/guilds/:id/activity",
  isAuthenticated,
  validateGuildId,
  isGuildAdmin,
  async (req: Request, res: Response) => {
    try {
      const guildId = req.params.id;
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);

      // Get recent usage logs
      const recentActivity = await prisma.usageLog.findMany({
        where: { guildId },
        orderBy: { createdAt: "desc" },
        take: limit,
        include: {
          verifiedUser: {
            select: {
              username: true,
              avatar: true,
            },
          },
        },
      });

      const activity = recentActivity.map((log) => ({
        id: log.id,
        userId: log.userId,
        username: log.verifiedUser?.username || "Unknown",
        avatar: log.verifiedUser?.avatar,
        sourceLanguage: log.sourceLanguage,
        targetLanguages: log.targetLanguage,
        characterCount: log.characterCount,
        createdAt: log.createdAt.toISOString(),
      }));

      res.json({ activity });
    } catch (error) {
      console.error("Error fetching activity:", error);
      res.status(500).json({ error: "Failed to fetch activity" });
    }
  }
);

// ============ Bulk Operations ============

/**
 * Reset all user streaks in guild (admin only)
 * POST /admin/guilds/:id/reset-streaks
 */
router.post(
  "/guilds/:id/reset-streaks",
  isAuthenticated,
  validateGuildId,
  isGuildAdmin,
  strictRateLimiter,
  auditLog("reset_all_streaks"),
  async (req: Request, res: Response) => {
    try {
      const guildId = req.params.id;

      const result = await prisma.verifiedUser.updateMany({
        where: { guildId },
        data: { currentStreak: 0 },
      });

      res.json({ success: true, usersAffected: result.count });
    } catch (error) {
      console.error("Error resetting streaks:", error);
      res.status(500).json({ error: "Failed to reset streaks" });
    }
  }
);

export default router;
