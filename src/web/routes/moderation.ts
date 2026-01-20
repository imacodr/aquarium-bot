import { Router, Request, Response } from "express";
import { isAuthenticated, isGuildAdmin, isGuildModerator } from "../middleware/auth";
import { moderationService } from "../../services/moderation";
import { prisma } from "../../database/prisma";
import { client } from "../../client";

const router = Router();

// Get ban status for a user
router.get(
  "/guilds/:guildId/members/:userId/ban",
  isAuthenticated,
  isGuildModerator,
  async (req: Request, res: Response) => {
    try {
      const { guildId, userId } = req.params;

      const status = await moderationService.getBanStatus(guildId, userId);
      const warnings = await moderationService.getWarnings(guildId, userId);

      res.json({
        ...status,
        warningCount: warnings.length,
      });
    } catch (error) {
      console.error("Error getting ban status:", error);
      res.status(500).json({ error: "Failed to get ban status" });
    }
  }
);

// Ban a user from immersion
router.post(
  "/guilds/:guildId/members/:userId/ban",
  isAuthenticated,
  isGuildModerator,
  async (req: Request, res: Response) => {
    try {
      const { guildId, userId } = req.params;
      const { reason, duration } = req.body;
      const moderatorId = req.user!.id;

      // Validate duration if provided
      let durationSeconds: number | null = null;
      if (duration) {
        if (typeof duration === "string") {
          durationSeconds = moderationService.parseDuration(duration);
          if (durationSeconds === null) {
            return res.status(400).json({
              error: "Invalid duration format. Use formats like: 30m, 12h, 7d, 2w",
            });
          }
        } else if (typeof duration === "number") {
          durationSeconds = duration;
        }
      }

      const result = await moderationService.banUser(
        guildId,
        userId,
        moderatorId,
        reason,
        durationSeconds
      );

      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      res.json({
        success: true,
        ban: result.ban,
      });
    } catch (error) {
      console.error("Error banning user:", error);
      res.status(500).json({ error: "Failed to ban user" });
    }
  }
);

// Unban a user from immersion
router.delete(
  "/guilds/:guildId/members/:userId/ban",
  isAuthenticated,
  isGuildModerator,
  async (req: Request, res: Response) => {
    try {
      const { guildId, userId } = req.params;
      const { reason } = req.body;
      const moderatorId = req.user!.id;

      const result = await moderationService.unbanUser(
        guildId,
        userId,
        moderatorId,
        reason
      );

      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error unbanning user:", error);
      res.status(500).json({ error: "Failed to unban user" });
    }
  }
);

// Warn a user
router.post(
  "/guilds/:guildId/members/:userId/warn",
  isAuthenticated,
  isGuildModerator,
  async (req: Request, res: Response) => {
    try {
      const { guildId, userId } = req.params;
      const { reason } = req.body;
      const moderatorId = req.user!.id;

      if (!reason) {
        return res.status(400).json({ error: "Reason is required" });
      }

      const result = await moderationService.warnUser(
        guildId,
        userId,
        moderatorId,
        reason
      );

      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      res.json({
        success: true,
        warningCount: result.warningCount,
      });
    } catch (error) {
      console.error("Error warning user:", error);
      res.status(500).json({ error: "Failed to warn user" });
    }
  }
);

// Get warnings for a user
router.get(
  "/guilds/:guildId/members/:userId/warnings",
  isAuthenticated,
  isGuildModerator,
  async (req: Request, res: Response) => {
    try {
      const { guildId, userId } = req.params;

      const warnings = await moderationService.getWarnings(guildId, userId);

      res.json({ warnings });
    } catch (error) {
      console.error("Error getting warnings:", error);
      res.status(500).json({ error: "Failed to get warnings" });
    }
  }
);

// Clear all warnings for a user
router.delete(
  "/guilds/:guildId/members/:userId/warnings",
  isAuthenticated,
  isGuildModerator,
  async (req: Request, res: Response) => {
    try {
      const { guildId, userId } = req.params;
      const { reason } = req.body;
      const moderatorId = req.user!.id;

      const result = await moderationService.clearWarnings(
        guildId,
        userId,
        moderatorId,
        reason
      );

      res.json({
        success: result.success,
        cleared: result.cleared,
      });
    } catch (error) {
      console.error("Error clearing warnings:", error);
      res.status(500).json({ error: "Failed to clear warnings" });
    }
  }
);

// Remove a specific warning
router.delete(
  "/guilds/:guildId/warnings/:warningId",
  isAuthenticated,
  isGuildModerator,
  async (req: Request, res: Response) => {
    try {
      const { warningId } = req.params;
      const { reason } = req.body;
      const moderatorId = req.user!.id;

      const result = await moderationService.removeWarning(
        warningId,
        moderatorId,
        reason
      );

      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error removing warning:", error);
      res.status(500).json({ error: "Failed to remove warning" });
    }
  }
);

// Get moderation history for a user
router.get(
  "/guilds/:guildId/members/:userId/history",
  isAuthenticated,
  isGuildModerator,
  async (req: Request, res: Response) => {
    try {
      const { guildId, userId } = req.params;

      const history = await moderationService.getModerationHistory(guildId, userId);

      // Get username info for the target user
      let username = "Unknown User";
      let avatar = null;
      try {
        const guild = client.guilds.cache.get(guildId);
        if (guild) {
          const member = await guild.members.fetch(userId).catch(() => null);
          if (member) {
            username = member.displayName;
            avatar = member.user.displayAvatarURL();
          }
        }
      } catch {
        // Use fallback from database
        const verifiedUser = await prisma.verifiedUser.findFirst({
          where: { discordId: userId, guildId },
        });
        if (verifiedUser) {
          username = verifiedUser.username;
          avatar = verifiedUser.avatar;
        }
      }

      res.json({
        user: { discordId: userId, username, avatar },
        ...history,
      });
    } catch (error) {
      console.error("Error getting moderation history:", error);
      res.status(500).json({ error: "Failed to get moderation history" });
    }
  }
);

// Get all active bans in a guild
router.get(
  "/guilds/:guildId/bans",
  isAuthenticated,
  isGuildModerator,
  async (req: Request, res: Response) => {
    try {
      const { guildId } = req.params;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;

      const result = await moderationService.getGuildBans(guildId, page, limit);

      // Enrich with user info
      const guild = client.guilds.cache.get(guildId);
      const enrichedBans = await Promise.all(
        result.bans.map(async (ban) => {
          let username = "Unknown User";
          let avatar = null;

          try {
            if (guild) {
              const member = await guild.members.fetch(ban.discordId).catch(() => null);
              if (member) {
                username = member.displayName;
                avatar = member.user.displayAvatarURL();
              }
            }
          } catch {
            const verifiedUser = await prisma.verifiedUser.findFirst({
              where: { discordId: ban.discordId, guildId },
            });
            if (verifiedUser) {
              username = verifiedUser.username;
              avatar = verifiedUser.avatar;
            }
          }

          return {
            ...ban,
            username,
            avatar,
          };
        })
      );

      res.json({
        bans: enrichedBans,
        total: result.total,
        page: result.page,
        totalPages: result.totalPages,
      });
    } catch (error) {
      console.error("Error getting guild bans:", error);
      res.status(500).json({ error: "Failed to get guild bans" });
    }
  }
);

// Get moderation logs for a guild
router.get(
  "/guilds/:guildId/modlogs",
  isAuthenticated,
  isGuildModerator,
  async (req: Request, res: Response) => {
    try {
      const { guildId } = req.params;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;

      const result = await moderationService.getGuildModerationLogs(guildId, page, limit);

      // Enrich logs with user info
      const guild = client.guilds.cache.get(guildId);
      const userCache: Record<string, { username: string; avatar: string | null }> = {};

      const getUserInfo = async (userId: string) => {
        if (userCache[userId]) return userCache[userId];

        let username = "Unknown User";
        let avatar = null;

        try {
          if (guild) {
            const member = await guild.members.fetch(userId).catch(() => null);
            if (member) {
              username = member.displayName;
              avatar = member.user.displayAvatarURL();
            }
          }
        } catch {
          const verifiedUser = await prisma.verifiedUser.findFirst({
            where: { discordId: userId, guildId },
          });
          if (verifiedUser) {
            username = verifiedUser.username;
            avatar = verifiedUser.avatar;
          }
        }

        userCache[userId] = { username, avatar };
        return userCache[userId];
      };

      const enrichedLogs = await Promise.all(
        result.logs.map(async (log) => {
          const [target, moderator] = await Promise.all([
            getUserInfo(log.targetId),
            getUserInfo(log.moderatorId),
          ]);

          return {
            ...log,
            target: { discordId: log.targetId, ...target },
            moderator: { discordId: log.moderatorId, ...moderator },
          };
        })
      );

      res.json({
        logs: enrichedLogs,
        total: result.total,
        page: result.page,
        totalPages: result.totalPages,
      });
    } catch (error) {
      console.error("Error getting moderation logs:", error);
      res.status(500).json({ error: "Failed to get moderation logs" });
    }
  }
);

// Get log channel setting
router.get(
  "/guilds/:guildId/settings/logchannel",
  isAuthenticated,
  isGuildAdmin,
  async (req: Request, res: Response) => {
    try {
      const { guildId } = req.params;

      const channelId = await moderationService.getLogChannel(guildId);

      // Get channel info if set
      let channel = null;
      if (channelId) {
        const guild = client.guilds.cache.get(guildId);
        if (guild) {
          const discordChannel = guild.channels.cache.get(channelId);
          if (discordChannel) {
            channel = {
              id: discordChannel.id,
              name: discordChannel.name,
            };
          }
        }
      }

      res.json({ channelId, channel });
    } catch (error) {
      console.error("Error getting log channel:", error);
      res.status(500).json({ error: "Failed to get log channel" });
    }
  }
);

// Set log channel
router.patch(
  "/guilds/:guildId/settings/logchannel",
  isAuthenticated,
  isGuildAdmin,
  async (req: Request, res: Response) => {
    try {
      const { guildId } = req.params;
      const { channelId } = req.body;

      const result = await moderationService.setLogChannel(guildId, channelId || null);

      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error setting log channel:", error);
      res.status(500).json({ error: "Failed to set log channel" });
    }
  }
);

export default router;
