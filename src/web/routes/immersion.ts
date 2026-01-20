import { Router, Request, Response } from "express";
import { isAuthenticated, isGuildAdmin } from "../middleware/auth";
import {
  validateGuildId,
  strictRateLimiter,
  auditLog,
  sanitizeString,
  isValidSnowflake,
  isValidLanguageCode,
} from "../middleware/security";
import { immersionManager } from "../../services/immersionManager";
import { LANGUAGES } from "../../config/languages";

const router = Router();

// ============ Status & Information ============

/**
 * Get immersion setup status for a guild
 * GET /immersion/guilds/:id/status
 */
router.get(
  "/guilds/:id/status",
  isAuthenticated,
  validateGuildId,
  isGuildAdmin,
  async (req: Request, res: Response) => {
    try {
      const status = await immersionManager.getStatus(req.params.id);
      if (!status) {
        return res.status(404).json({ error: "Guild not found" });
      }
      res.json({ status });
    } catch (error) {
      console.error("Error getting immersion status:", error);
      res.status(500).json({ error: "Failed to get immersion status" });
    }
  }
);

/**
 * Get available categories in the guild
 * GET /immersion/guilds/:id/categories
 */
router.get(
  "/guilds/:id/categories",
  isAuthenticated,
  validateGuildId,
  isGuildAdmin,
  async (req: Request, res: Response) => {
    try {
      const categories = await immersionManager.getAvailableCategories(req.params.id);
      res.json({ categories });
    } catch (error) {
      console.error("Error getting categories:", error);
      res.status(500).json({ error: "Failed to get categories" });
    }
  }
);

/**
 * Get available text channels in the guild
 * GET /immersion/guilds/:id/channels
 */
router.get(
  "/guilds/:id/channels",
  isAuthenticated,
  validateGuildId,
  isGuildAdmin,
  async (req: Request, res: Response) => {
    try {
      const channels = await immersionManager.getAvailableChannels(req.params.id);
      res.json({ channels });
    } catch (error) {
      console.error("Error getting channels:", error);
      res.status(500).json({ error: "Failed to get channels" });
    }
  }
);

/**
 * Get supported languages
 * GET /immersion/languages
 */
router.get("/languages", (_req: Request, res: Response) => {
  const languages = Object.values(LANGUAGES).map((lang) => ({
    code: lang.code,
    name: lang.name,
    emoji: lang.emoji,
    channelName: lang.channelName,
  }));
  res.json({ languages });
});

// ============ Setup ============

/**
 * Full setup - Create category and all language channels
 * POST /immersion/guilds/:id/setup
 */
router.post(
  "/guilds/:id/setup",
  isAuthenticated,
  validateGuildId,
  isGuildAdmin,
  strictRateLimiter,
  auditLog("immersion_setup"),
  async (req: Request, res: Response) => {
    try {
      const { categoryId } = req.body;

      // Validate category ID if provided
      if (categoryId && !isValidSnowflake(categoryId)) {
        return res.status(400).json({ error: "Invalid category ID" });
      }

      const result = await immersionManager.setupFull(req.params.id, categoryId);

      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      res.json({
        success: true,
        categoryId: result.categoryId,
        channels: result.channels,
      });
    } catch (error) {
      console.error("Error setting up immersion:", error);
      res.status(500).json({ error: "Failed to set up immersion" });
    }
  }
);

/**
 * Link existing channels to immersion
 * POST /immersion/guilds/:id/link
 */
router.post(
  "/guilds/:id/link",
  isAuthenticated,
  validateGuildId,
  isGuildAdmin,
  strictRateLimiter,
  auditLog("immersion_link_channels"),
  async (req: Request, res: Response) => {
    try {
      const { channels, categoryId } = req.body;

      // Validate channels object
      if (!channels || typeof channels !== "object") {
        return res.status(400).json({ error: "channels object is required" });
      }

      // Validate each channel mapping
      const validMappings: Record<string, string> = {};
      for (const [langCode, channelId] of Object.entries(channels)) {
        if (!isValidLanguageCode(langCode)) {
          return res.status(400).json({ error: `Invalid language code: ${langCode}` });
        }
        if (typeof channelId !== "string" || !isValidSnowflake(channelId)) {
          return res.status(400).json({ error: `Invalid channel ID for ${langCode}` });
        }
        validMappings[langCode] = channelId;
      }

      if (Object.keys(validMappings).length === 0) {
        return res.status(400).json({ error: "At least one channel mapping is required" });
      }

      // Validate category ID if provided
      if (categoryId && !isValidSnowflake(categoryId)) {
        return res.status(400).json({ error: "Invalid category ID" });
      }

      const result = await immersionManager.linkExistingChannels(
        req.params.id,
        validMappings,
        categoryId
      );

      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      res.json({
        success: true,
        categoryId: result.categoryId,
        channels: result.channels,
      });
    } catch (error) {
      console.error("Error linking channels:", error);
      res.status(500).json({ error: "Failed to link channels" });
    }
  }
);

// ============ Channel Management ============

/**
 * Update a single channel mapping
 * PATCH /immersion/guilds/:id/channels/:langCode
 */
router.patch(
  "/guilds/:id/channels/:langCode",
  isAuthenticated,
  validateGuildId,
  isGuildAdmin,
  strictRateLimiter,
  auditLog("immersion_update_channel"),
  async (req: Request, res: Response) => {
    try {
      const { langCode } = req.params;
      const { channelId } = req.body;

      if (!isValidLanguageCode(langCode)) {
        return res.status(400).json({ error: "Invalid language code" });
      }

      if (!channelId || !isValidSnowflake(channelId)) {
        return res.status(400).json({ error: "Invalid channel ID" });
      }

      const result = await immersionManager.updateChannelMapping(
        req.params.id,
        langCode,
        channelId
      );

      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error updating channel:", error);
      res.status(500).json({ error: "Failed to update channel" });
    }
  }
);

/**
 * Update channel settings (slowmode, topic)
 * PATCH /immersion/guilds/:id/channels/:langCode/settings
 */
router.patch(
  "/guilds/:id/channels/:langCode/settings",
  isAuthenticated,
  validateGuildId,
  isGuildAdmin,
  strictRateLimiter,
  auditLog("immersion_update_channel_settings"),
  async (req: Request, res: Response) => {
    try {
      const { langCode } = req.params;
      const { slowmode, topic } = req.body;

      if (!isValidLanguageCode(langCode)) {
        return res.status(400).json({ error: "Invalid language code" });
      }

      const settings: { slowmode?: number; topic?: string } = {};

      if (slowmode !== undefined) {
        if (typeof slowmode !== "number" || slowmode < 0 || slowmode > 21600) {
          return res.status(400).json({ error: "Slowmode must be between 0 and 21600 seconds" });
        }
        settings.slowmode = slowmode;
      }

      if (topic !== undefined) {
        if (typeof topic !== "string") {
          return res.status(400).json({ error: "Topic must be a string" });
        }
        settings.topic = sanitizeString(topic, 1024);
      }

      if (Object.keys(settings).length === 0) {
        return res.status(400).json({ error: "No settings provided" });
      }

      const result = await immersionManager.updateChannelSettings(
        req.params.id,
        langCode,
        settings
      );

      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error updating channel settings:", error);
      res.status(500).json({ error: "Failed to update channel settings" });
    }
  }
);

/**
 * Recreate webhook for a channel
 * POST /immersion/guilds/:id/channels/:langCode/webhook
 */
router.post(
  "/guilds/:id/channels/:langCode/webhook",
  isAuthenticated,
  validateGuildId,
  isGuildAdmin,
  strictRateLimiter,
  auditLog("immersion_recreate_webhook"),
  async (req: Request, res: Response) => {
    try {
      const { langCode } = req.params;

      if (!isValidLanguageCode(langCode)) {
        return res.status(400).json({ error: "Invalid language code" });
      }

      const result = await immersionManager.recreateWebhook(req.params.id, langCode);

      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error recreating webhook:", error);
      res.status(500).json({ error: "Failed to recreate webhook" });
    }
  }
);

// ============ Language Settings ============

/**
 * Get enabled languages for a guild
 * GET /immersion/guilds/:id/settings/languages
 */
router.get(
  "/guilds/:id/settings/languages",
  isAuthenticated,
  validateGuildId,
  isGuildAdmin,
  async (req: Request, res: Response) => {
    try {
      const guildId = req.params.id;
      const config = await immersionManager.getGuildConfig(guildId);

      if (!config) {
        return res.status(404).json({ error: "Guild not configured" });
      }

      const enabledLanguages: string[] = JSON.parse(config.enabledLanguages || "[]");

      // Return all languages with their enabled status
      const languages = Object.values(LANGUAGES).map((lang) => ({
        code: lang.code,
        name: lang.name,
        emoji: lang.emoji,
        enabled: enabledLanguages.length === 0 || enabledLanguages.includes(lang.code),
      }));

      res.json({
        enabledLanguages,
        allEnabled: enabledLanguages.length === 0,
        languages,
      });
    } catch (error) {
      console.error("Error getting language settings:", error);
      res.status(500).json({ error: "Failed to get language settings" });
    }
  }
);

/**
 * Update enabled languages for a guild
 * PATCH /immersion/guilds/:id/settings/languages
 */
router.patch(
  "/guilds/:id/settings/languages",
  isAuthenticated,
  validateGuildId,
  isGuildAdmin,
  strictRateLimiter,
  auditLog("immersion_update_languages"),
  async (req: Request, res: Response) => {
    try {
      const guildId = req.params.id;
      const { enabledLanguages } = req.body;

      // Validate input
      if (!Array.isArray(enabledLanguages)) {
        return res.status(400).json({ error: "enabledLanguages must be an array" });
      }

      // Validate each language code
      for (const langCode of enabledLanguages) {
        if (!isValidLanguageCode(langCode)) {
          return res.status(400).json({ error: `Invalid language code: ${langCode}` });
        }
      }

      // Must have at least 2 languages enabled (source + target)
      if (enabledLanguages.length > 0 && enabledLanguages.length < 2) {
        return res.status(400).json({
          error: "At least 2 languages must be enabled for translation to work",
        });
      }

      const result = await immersionManager.updateEnabledLanguages(guildId, enabledLanguages);

      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      res.json({ success: true, enabledLanguages });
    } catch (error) {
      console.error("Error updating language settings:", error);
      res.status(500).json({ error: "Failed to update language settings" });
    }
  }
);

// ============ Reset ============

/**
 * Reset immersion setup
 * DELETE /immersion/guilds/:id
 */
router.delete(
  "/guilds/:id",
  isAuthenticated,
  validateGuildId,
  isGuildAdmin,
  strictRateLimiter,
  auditLog("immersion_reset"),
  async (req: Request, res: Response) => {
    try {
      const deleteChannels = req.query.deleteChannels !== "false";

      const result = await immersionManager.reset(req.params.id, deleteChannels);

      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error resetting immersion:", error);
      res.status(500).json({ error: "Failed to reset immersion" });
    }
  }
);

export default router;
