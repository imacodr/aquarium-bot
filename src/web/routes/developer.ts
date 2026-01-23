/**
 * Developer API Routes
 * Protected routes for bot developer administration
 */

import { Router, Request, Response } from "express";
import { isAuthenticated } from "../middleware/auth";
import { isDeveloper } from "../middleware/developer";
import {
  validateGuildId,
  isValidSnowflake,
  sanitizeString,
  strictRateLimiter,
  auditLog,
} from "../middleware/security";
import { developerService } from "../../services/developerService";
import { announcementService } from "../../services/announcementService";
import { isBotDeveloper } from "../../config/developer";

const router = Router();

// All routes require authentication and developer status
router.use(isAuthenticated, isDeveloper);

// ============ Stats ============

/**
 * Get comprehensive bot statistics
 * GET /developer/stats
 */
router.get("/stats", async (req: Request, res: Response) => {
  try {
    const stats = await developerService.getBotStats();
    res.json(stats);
  } catch (error) {
    console.error("Error fetching bot stats:", error);
    res.status(500).json({ error: "Failed to fetch statistics" });
  }
});

// ============ Guild Management ============

/**
 * List all guilds with pagination and filters
 * GET /developer/guilds
 */
router.get("/guilds", async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const search = req.query.search ? sanitizeString(req.query.search as string, 100) : undefined;
    const tier = req.query.tier as string | undefined;
    const hasImmersion = req.query.hasImmersion === "true" ? true : req.query.hasImmersion === "false" ? false : undefined;

    const result = await developerService.listGuilds({
      page,
      limit,
      search,
      tier,
      hasImmersion,
    });
    res.json(result);
  } catch (error) {
    console.error("Error listing guilds:", error);
    res.status(500).json({ error: "Failed to list guilds" });
  }
});

/**
 * Get detailed guild information
 * GET /developer/guilds/:id
 */
router.get(
  "/guilds/:id",
  validateGuildId,
  async (req: Request, res: Response) => {
    try {
      const guild = await developerService.getGuildDetails(req.params.id);
      if (!guild) {
        return res.status(404).json({ error: "Guild not found" });
      }
      res.json(guild);
    } catch (error) {
      console.error("Error fetching guild details:", error);
      res.status(500).json({ error: "Failed to fetch guild details" });
    }
  }
);

/**
 * Update guild subscription
 * PATCH /developer/guilds/:id/subscription
 */
router.patch(
  "/guilds/:id/subscription",
  validateGuildId,
  strictRateLimiter,
  auditLog("developer_update_guild_subscription"),
  async (req: Request, res: Response) => {
    try {
      const { tier, durationDays } = req.body;

      if (!tier || !["free", "pro", "premium"].includes(tier)) {
        return res.status(400).json({ error: "Invalid tier. Must be 'free', 'pro', or 'premium'" });
      }

      if (durationDays !== undefined && (typeof durationDays !== "number" || durationDays < 0)) {
        return res.status(400).json({ error: "Invalid duration" });
      }

      const result = await developerService.updateGuildSubscription(
        req.params.id,
        tier,
        durationDays,
        req.user!.id
      );

      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error updating guild subscription:", error);
      res.status(500).json({ error: "Failed to update subscription" });
    }
  }
);

/**
 * Reset guild configuration
 * POST /developer/guilds/:id/reset
 */
router.post(
  "/guilds/:id/reset",
  validateGuildId,
  strictRateLimiter,
  auditLog("developer_reset_guild_config"),
  async (req: Request, res: Response) => {
    try {
      const result = await developerService.resetGuildConfig(
        req.params.id,
        req.user!.id
      );

      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      res.json({ success: true, message: "Guild configuration has been reset" });
    } catch (error) {
      console.error("Error resetting guild config:", error);
      res.status(500).json({ error: "Failed to reset configuration" });
    }
  }
);

// ============ User Management ============

/**
 * Search users globally
 * GET /developer/users
 */
router.get("/users", async (req: Request, res: Response) => {
  try {
    const search = req.query.search ? sanitizeString(req.query.search as string, 100) : "";
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);

    if (!search) {
      return res.status(400).json({ error: "Search query required" });
    }

    const result = await developerService.searchUsers({ search, page, limit });
    res.json(result);
  } catch (error) {
    console.error("Error searching users:", error);
    res.status(500).json({ error: "Failed to search users" });
  }
});

/**
 * Get detailed user information
 * GET /developer/users/:id
 */
router.get("/users/:id", async (req: Request, res: Response) => {
  try {
    const discordId = req.params.id;
    if (!isValidSnowflake(discordId)) {
      return res.status(400).json({ error: "Invalid user ID format" });
    }

    const user = await developerService.getUserDetails(discordId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    res.json(user);
  } catch (error) {
    console.error("Error fetching user details:", error);
    res.status(500).json({ error: "Failed to fetch user details" });
  }
});

/**
 * Update user subscription
 * PATCH /developer/users/:id/subscription
 */
router.patch(
  "/users/:id/subscription",
  strictRateLimiter,
  auditLog("developer_update_user_subscription"),
  async (req: Request, res: Response) => {
    try {
      const discordId = req.params.id;
      if (!isValidSnowflake(discordId)) {
        return res.status(400).json({ error: "Invalid user ID format" });
      }

      const { tier, durationDays } = req.body;

      if (!tier || !["free", "pro", "premium"].includes(tier)) {
        return res.status(400).json({ error: "Invalid tier. Must be 'free', 'pro', or 'premium'" });
      }

      if (durationDays !== undefined && (typeof durationDays !== "number" || durationDays < 0)) {
        return res.status(400).json({ error: "Invalid duration" });
      }

      const result = await developerService.updateUserSubscription(
        discordId,
        tier,
        durationDays,
        req.user!.id
      );

      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error updating user subscription:", error);
      res.status(500).json({ error: "Failed to update subscription" });
    }
  }
);

// ============ Announcements ============

/**
 * Get announcement history
 * GET /developer/announcements
 */
router.get("/announcements", async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);

    const result = await announcementService.getAnnouncements({ page, limit });
    res.json(result);
  } catch (error) {
    console.error("Error fetching announcements:", error);
    res.status(500).json({ error: "Failed to fetch announcements" });
  }
});

/**
 * Preview announcement (get target count)
 * POST /developer/announcements/preview
 */
router.post("/announcements/preview", async (req: Request, res: Response) => {
  try {
    const { type } = req.body;

    if (!type || !["server_owners", "all_servers", "verified_users"].includes(type)) {
      return res.status(400).json({
        error: "Invalid type. Must be 'server_owners', 'all_servers', or 'verified_users'",
      });
    }

    const preview = await announcementService.previewAnnouncement(type);
    res.json(preview);
  } catch (error) {
    console.error("Error previewing announcement:", error);
    res.status(500).json({ error: "Failed to preview announcement" });
  }
});

/**
 * Send announcement
 * POST /developer/announcements
 */
router.post(
  "/announcements",
  strictRateLimiter,
  auditLog("developer_send_announcement"),
  async (req: Request, res: Response) => {
    try {
      const { type, title, content } = req.body;

      if (!type || !["server_owners", "all_servers", "verified_users"].includes(type)) {
        return res.status(400).json({
          error: "Invalid type. Must be 'server_owners', 'all_servers', or 'verified_users'",
        });
      }

      if (!title || typeof title !== "string" || title.length > 200) {
        return res.status(400).json({ error: "Title required (max 200 characters)" });
      }

      if (!content || typeof content !== "string" || content.length > 2000) {
        return res.status(400).json({ error: "Content required (max 2000 characters)" });
      }

      const result = await announcementService.sendAnnouncement({
        developerId: req.user!.id,
        type,
        title,
        content,
      });

      res.json(result);
    } catch (error) {
      console.error("Error sending announcement:", error);
      res.status(500).json({ error: "Failed to send announcement" });
    }
  }
);

/**
 * Get specific announcement details
 * GET /developer/announcements/:id
 */
router.get("/announcements/:id", async (req: Request, res: Response) => {
  try {
    const announcement = await announcementService.getAnnouncementById(req.params.id);
    if (!announcement) {
      return res.status(404).json({ error: "Announcement not found" });
    }
    res.json(announcement);
  } catch (error) {
    console.error("Error fetching announcement:", error);
    res.status(500).json({ error: "Failed to fetch announcement" });
  }
});

// ============ Audit Log ============

/**
 * Get developer audit log
 * GET /developer/audit-log
 */
router.get("/audit-log", async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const action = req.query.action as string | undefined;

    const result = await developerService.getAuditLog({ page, limit, action });
    res.json(result);
  } catch (error) {
    console.error("Error fetching audit log:", error);
    res.status(500).json({ error: "Failed to fetch audit log" });
  }
});

// ============ Developer Status Check ============

/**
 * Check if current user is a developer (for frontend nav)
 * GET /developer/check
 */
router.get("/check", async (req: Request, res: Response) => {
  // If we got here, the user is a developer (middleware passed)
  res.json({ isDeveloper: true });
});

export default router;
