import {
  Guild,
  TextChannel,
  CategoryChannel,
  ChannelType,
  PermissionFlagsBits,
  GuildChannel,
} from "discord.js";
import { prisma } from "../database/prisma";
import { client } from "../client";
import { LANGUAGES, LANGUAGE_CODES } from "../config/languages";
import { IMMERSION_CATEGORY_NAME, IMMERSION_CHANNEL_SLOWMODE, IMMERSION_INSTRUCTIONS_CHANNEL_NAME, IMMERSION_INSTRUCTIONS_TEXT } from "../config/constants";
import { webhookService } from "./webhook";

export interface SetupResult {
  success: boolean;
  error?: string;
  categoryId?: string;
  channels?: { code: string; channelId: string; name: string }[];
}

export interface ChannelConfig {
  code: string;
  channelId: string | null;
  webhookId: string | null;
  name: string;
  emoji: string;
}

export interface ImmersionStatus {
  isSetup: boolean;
  categoryId: string | null;
  categoryName: string | null;
  channels: ChannelConfig[];
  missingChannels: string[];
  missingWebhooks: string[];
}

// Maps language codes to database field names
const CHANNEL_FIELD_MAP: Record<string, { channel: string; webhookId: string; webhookToken: string }> = {
  EN: { channel: "englishChannelId", webhookId: "englishWebhookId", webhookToken: "englishWebhookToken" },
  ES: { channel: "spanishChannelId", webhookId: "spanishWebhookId", webhookToken: "spanishWebhookToken" },
  "PT-BR": { channel: "portugueseChannelId", webhookId: "portugueseWebhookId", webhookToken: "portugueseWebhookToken" },
  FR: { channel: "frenchChannelId", webhookId: "frenchWebhookId", webhookToken: "frenchWebhookToken" },
  DE: { channel: "germanChannelId", webhookId: "germanWebhookId", webhookToken: "germanWebhookToken" },
  IT: { channel: "italianChannelId", webhookId: "italianWebhookId", webhookToken: "italianWebhookToken" },
  JA: { channel: "japaneseChannelId", webhookId: "japaneseWebhookId", webhookToken: "japaneseWebhookToken" },
  KO: { channel: "koreanChannelId", webhookId: "koreanWebhookId", webhookToken: "koreanWebhookToken" },
  ZH: { channel: "chineseChannelId", webhookId: "chineseWebhookId", webhookToken: "chineseWebhookToken" },
};

class ImmersionManagerService {
  /**
   * Get the current immersion setup status for a guild
   */
  async getStatus(guildId: string): Promise<ImmersionStatus | null> {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return null;

    const config = await prisma.guildConfig.findUnique({
      where: { guildId },
    });

    const channels: ChannelConfig[] = [];
    const missingChannels: string[] = [];
    const missingWebhooks: string[] = [];

    let categoryName: string | null = null;
    if (config?.categoryId) {
      try {
        const category = await guild.channels.fetch(config.categoryId);
        categoryName = category?.name || null;
      } catch {
        categoryName = null;
      }
    }

    for (const [code, lang] of Object.entries(LANGUAGES)) {
      const fields = CHANNEL_FIELD_MAP[code];
      const channelId = config ? (config as any)[fields.channel] : null;
      const webhookId = config ? (config as any)[fields.webhookId] : null;

      channels.push({
        code,
        channelId,
        webhookId,
        name: lang.name,
        emoji: lang.emoji,
      });

      if (!channelId) {
        missingChannels.push(code);
      } else if (!webhookId) {
        missingWebhooks.push(code);
      }
    }

    return {
      isSetup: !!config?.categoryId,
      categoryId: config?.categoryId || null,
      categoryName,
      channels,
      missingChannels,
      missingWebhooks,
    };
  }

  /**
   * Full setup: Create category, all language channels, and webhooks
   */
  async setupFull(guildId: string, existingCategoryId?: string): Promise<SetupResult> {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
      return { success: false, error: "Guild not found" };
    }

    // Check if already set up
    const existingConfig = await prisma.guildConfig.findUnique({
      where: { guildId },
    });

    if (existingConfig?.categoryId) {
      return { success: false, error: "Immersion is already set up. Use reset first to reconfigure." };
    }

    // Check bot permissions
    const botMember = guild.members.me;
    if (!botMember?.permissions.has(PermissionFlagsBits.ManageChannels)) {
      return { success: false, error: "Bot needs Manage Channels permission" };
    }
    if (!botMember?.permissions.has(PermissionFlagsBits.ManageWebhooks)) {
      return { success: false, error: "Bot needs Manage Webhooks permission" };
    }

    try {
      // Get or create category
      let category: CategoryChannel;
      if (existingCategoryId) {
        const existingCategory = await guild.channels.fetch(existingCategoryId);
        if (!existingCategory || existingCategory.type !== ChannelType.GuildCategory) {
          return { success: false, error: "Invalid category ID" };
        }
        category = existingCategory as CategoryChannel;
      } else {
        category = await guild.channels.create({
          name: IMMERSION_CATEGORY_NAME,
          type: ChannelType.GuildCategory,
          reason: "Language immersion setup via dashboard",
        });
      }

      // Create instructions channel first
      const instructionsChannel = await guild.channels.create({
        name: IMMERSION_INSTRUCTIONS_CHANNEL_NAME,
        type: ChannelType.GuildText,
        parent: category.id,
        topic: "How to verify and use the language immersion channels",
        reason: "Language immersion setup via dashboard",
      });

      // Post instructions message
      await (instructionsChannel as TextChannel).send(IMMERSION_INSTRUCTIONS_TEXT);

      // Create channels and webhooks
      const channelData: Record<string, { channelId: string; webhookId: string; webhookToken: string }> = {};
      const createdChannels: { code: string; channelId: string; name: string }[] = [];

      for (const [code, lang] of Object.entries(LANGUAGES)) {
        const channel = await guild.channels.create({
          name: `${lang.emoji}︱${lang.channelName}`,
          type: ChannelType.GuildText,
          parent: category.id,
          topic: `${lang.emoji} ${lang.name} - Language immersion channel. Messages here will be translated to other language channels.`,
          rateLimitPerUser: IMMERSION_CHANNEL_SLOWMODE,
          reason: "Language immersion setup via dashboard",
        });

        const webhook = await webhookService.createWebhookForChannel(channel as TextChannel);

        channelData[code] = {
          channelId: channel.id,
          webhookId: webhook.id,
          webhookToken: webhook.token!,
        };

        createdChannels.push({
          code,
          channelId: channel.id,
          name: channel.name,
        });
      }

      // Save to database
      const dbData = {
        guildId,
        categoryId: category.id,
        instructionsChannelId: instructionsChannel.id,
        englishChannelId: channelData.EN.channelId,
        englishWebhookId: channelData.EN.webhookId,
        englishWebhookToken: channelData.EN.webhookToken,
        spanishChannelId: channelData.ES.channelId,
        spanishWebhookId: channelData.ES.webhookId,
        spanishWebhookToken: channelData.ES.webhookToken,
        portugueseChannelId: channelData["PT-BR"].channelId,
        portugueseWebhookId: channelData["PT-BR"].webhookId,
        portugueseWebhookToken: channelData["PT-BR"].webhookToken,
        frenchChannelId: channelData.FR.channelId,
        frenchWebhookId: channelData.FR.webhookId,
        frenchWebhookToken: channelData.FR.webhookToken,
        germanChannelId: channelData.DE.channelId,
        germanWebhookId: channelData.DE.webhookId,
        germanWebhookToken: channelData.DE.webhookToken,
        italianChannelId: channelData.IT.channelId,
        italianWebhookId: channelData.IT.webhookId,
        italianWebhookToken: channelData.IT.webhookToken,
        japaneseChannelId: channelData.JA.channelId,
        japaneseWebhookId: channelData.JA.webhookId,
        japaneseWebhookToken: channelData.JA.webhookToken,
        koreanChannelId: channelData.KO.channelId,
        koreanWebhookId: channelData.KO.webhookId,
        koreanWebhookToken: channelData.KO.webhookToken,
        chineseChannelId: channelData.ZH.channelId,
        chineseWebhookId: channelData.ZH.webhookId,
        chineseWebhookToken: channelData.ZH.webhookToken,
      };

      await prisma.guildConfig.upsert({
        where: { guildId },
        create: dbData,
        update: dbData,
      });

      return {
        success: true,
        categoryId: category.id,
        channels: createdChannels,
      };
    } catch (error: any) {
      console.error("Error setting up immersion:", error);
      return { success: false, error: error.message || "Failed to set up immersion" };
    }
  }

  /**
   * Link existing channels to language immersion (use existing channels instead of creating new ones)
   */
  async linkExistingChannels(
    guildId: string,
    channelMappings: Record<string, string>, // { languageCode: channelId }
    categoryId?: string
  ): Promise<SetupResult> {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
      return { success: false, error: "Guild not found" };
    }

    // Check bot permissions
    const botMember = guild.members.me;
    if (!botMember?.permissions.has(PermissionFlagsBits.ManageWebhooks)) {
      return { success: false, error: "Bot needs Manage Webhooks permission" };
    }

    try {
      const dbData: any = { guildId };
      if (categoryId) {
        dbData.categoryId = categoryId;
      }

      const linkedChannels: { code: string; channelId: string; name: string }[] = [];

      for (const [langCode, channelId] of Object.entries(channelMappings)) {
        if (!CHANNEL_FIELD_MAP[langCode]) {
          return { success: false, error: `Invalid language code: ${langCode}` };
        }

        // Verify channel exists and is a text channel
        const channel = await guild.channels.fetch(channelId).catch(() => null);
        if (!channel || channel.type !== ChannelType.GuildText) {
          return { success: false, error: `Invalid channel for ${langCode}` };
        }

        // Create webhook for this channel
        const webhook = await webhookService.createWebhookForChannel(channel as TextChannel);

        const fields = CHANNEL_FIELD_MAP[langCode];
        dbData[fields.channel] = channelId;
        dbData[fields.webhookId] = webhook.id;
        dbData[fields.webhookToken] = webhook.token;

        linkedChannels.push({
          code: langCode,
          channelId,
          name: channel.name,
        });
      }

      // Need at least the category ID to consider it "set up"
      if (!categoryId && !dbData.categoryId) {
        // Try to get category from first channel
        const firstChannelId = Object.values(channelMappings)[0];
        if (firstChannelId) {
          const channel = await guild.channels.fetch(firstChannelId).catch(() => null);
          if (channel?.parentId) {
            dbData.categoryId = channel.parentId;
          }
        }
      }

      await prisma.guildConfig.upsert({
        where: { guildId },
        create: dbData,
        update: dbData,
      });

      return {
        success: true,
        categoryId: dbData.categoryId,
        channels: linkedChannels,
      };
    } catch (error: any) {
      console.error("Error linking channels:", error);
      return { success: false, error: error.message || "Failed to link channels" };
    }
  }

  /**
   * Update a single language channel mapping
   */
  async updateChannelMapping(
    guildId: string,
    langCode: string,
    newChannelId: string
  ): Promise<{ success: boolean; error?: string }> {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
      return { success: false, error: "Guild not found" };
    }

    if (!CHANNEL_FIELD_MAP[langCode]) {
      return { success: false, error: "Invalid language code" };
    }

    try {
      // Verify channel exists
      const channel = await guild.channels.fetch(newChannelId).catch(() => null);
      if (!channel || channel.type !== ChannelType.GuildText) {
        return { success: false, error: "Invalid channel" };
      }

      // Create webhook for new channel
      const webhook = await webhookService.createWebhookForChannel(channel as TextChannel);

      const fields = CHANNEL_FIELD_MAP[langCode];
      await prisma.guildConfig.update({
        where: { guildId },
        data: {
          [fields.channel]: newChannelId,
          [fields.webhookId]: webhook.id,
          [fields.webhookToken]: webhook.token,
        },
      });

      return { success: true };
    } catch (error: any) {
      console.error("Error updating channel mapping:", error);
      return { success: false, error: error.message || "Failed to update channel" };
    }
  }

  /**
   * Recreate a webhook for a language channel (if webhook was deleted)
   */
  async recreateWebhook(
    guildId: string,
    langCode: string
  ): Promise<{ success: boolean; error?: string }> {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
      return { success: false, error: "Guild not found" };
    }

    if (!CHANNEL_FIELD_MAP[langCode]) {
      return { success: false, error: "Invalid language code" };
    }

    try {
      const config = await prisma.guildConfig.findUnique({
        where: { guildId },
      });

      if (!config) {
        return { success: false, error: "Guild not configured" };
      }

      const fields = CHANNEL_FIELD_MAP[langCode];
      const channelId = (config as any)[fields.channel];

      if (!channelId) {
        return { success: false, error: "Channel not configured for this language" };
      }

      const channel = await guild.channels.fetch(channelId).catch(() => null);
      if (!channel || channel.type !== ChannelType.GuildText) {
        return { success: false, error: "Channel not found or not a text channel" };
      }

      const webhook = await webhookService.createWebhookForChannel(channel as TextChannel);

      await prisma.guildConfig.update({
        where: { guildId },
        data: {
          [fields.webhookId]: webhook.id,
          [fields.webhookToken]: webhook.token,
        },
      });

      return { success: true };
    } catch (error: any) {
      console.error("Error recreating webhook:", error);
      return { success: false, error: error.message || "Failed to recreate webhook" };
    }
  }

  /**
   * Reset immersion setup (delete channels and config)
   */
  async reset(guildId: string, deleteChannels: boolean = true): Promise<{ success: boolean; error?: string }> {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
      return { success: false, error: "Guild not found" };
    }

    try {
      const config = await prisma.guildConfig.findUnique({
        where: { guildId },
      });

      if (!config) {
        return { success: false, error: "Immersion not set up" };
      }

      if (deleteChannels) {
        // Delete all language channels and instructions channel
        const channelIds = [
          config.instructionsChannelId,
          config.englishChannelId,
          config.spanishChannelId,
          config.portugueseChannelId,
          config.frenchChannelId,
          config.germanChannelId,
          config.italianChannelId,
          config.japaneseChannelId,
          config.koreanChannelId,
          config.chineseChannelId,
        ].filter(Boolean) as string[];

        for (const channelId of channelIds) {
          try {
            const channel = await guild.channels.fetch(channelId);
            if (channel) {
              await channel.delete("Language immersion reset via dashboard");
            }
          } catch {
            // Channel may already be deleted
          }
        }

        // Delete category if empty
        if (config.categoryId) {
          try {
            const category = await guild.channels.fetch(config.categoryId);
            if (category && category.type === ChannelType.GuildCategory) {
              const categoryChannel = category as CategoryChannel;
              if (categoryChannel.children.cache.size === 0) {
                await category.delete("Language immersion reset via dashboard");
              }
            }
          } catch {
            // Category may already be deleted
          }
        }
      }

      // Delete database record
      await prisma.guildConfig.delete({
        where: { guildId },
      });

      // Clear webhook cache
      webhookService.clearCache();

      return { success: true };
    } catch (error: any) {
      console.error("Error resetting immersion:", error);
      return { success: false, error: error.message || "Failed to reset immersion" };
    }
  }

  /**
   * Get available categories in the guild
   */
  async getAvailableCategories(guildId: string): Promise<{ id: string; name: string }[]> {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return [];

    return guild.channels.cache
      .filter((c) => c.type === ChannelType.GuildCategory)
      .map((c) => ({ id: c.id, name: c.name }));
  }

  /**
   * Get available text channels in the guild (for linking existing channels)
   */
  async getAvailableChannels(guildId: string): Promise<{ id: string; name: string; parentId: string | null; parentName: string | null }[]> {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return [];

    return guild.channels.cache
      .filter((c) => c.type === ChannelType.GuildText)
      .map((c) => {
        const textChannel = c as TextChannel;
        const parent = textChannel.parent;
        return {
          id: c.id,
          name: c.name,
          parentId: parent?.id || null,
          parentName: parent?.name || null,
        };
      });
  }

  /**
   * Update channel settings (slowmode, topic, etc.)
   */
  async updateChannelSettings(
    guildId: string,
    langCode: string,
    settings: { slowmode?: number; topic?: string }
  ): Promise<{ success: boolean; error?: string }> {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
      return { success: false, error: "Guild not found" };
    }

    if (!CHANNEL_FIELD_MAP[langCode]) {
      return { success: false, error: "Invalid language code" };
    }

    try {
      const config = await prisma.guildConfig.findUnique({
        where: { guildId },
      });

      if (!config) {
        return { success: false, error: "Immersion not set up" };
      }

      const fields = CHANNEL_FIELD_MAP[langCode];
      const channelId = (config as any)[fields.channel];

      if (!channelId) {
        return { success: false, error: "Channel not configured" };
      }

      const channel = await guild.channels.fetch(channelId).catch(() => null);
      if (!channel || channel.type !== ChannelType.GuildText) {
        return { success: false, error: "Channel not found" };
      }

      const textChannel = channel as TextChannel;
      const updateData: any = {};

      if (settings.slowmode !== undefined) {
        updateData.rateLimitPerUser = Math.max(0, Math.min(21600, settings.slowmode)); // Max 6 hours
      }

      if (settings.topic !== undefined) {
        updateData.topic = settings.topic.slice(0, 1024); // Max 1024 chars
      }

      if (Object.keys(updateData).length > 0) {
        await textChannel.edit(updateData);
      }

      return { success: true };
    } catch (error: any) {
      console.error("Error updating channel settings:", error);
      return { success: false, error: error.message || "Failed to update channel settings" };
    }
  }

  /**
   * Get guild config for a guild
   */
  async getGuildConfig(guildId: string) {
    return prisma.guildConfig.findUnique({
      where: { guildId },
    });
  }

  /**
   * Update enabled languages for a guild
   * Moves disabled channels to a separate category
   */
  async updateEnabledLanguages(
    guildId: string,
    enabledLanguages: string[]
  ): Promise<{ success: boolean; error?: string }> {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
      return { success: false, error: "Guild not found" };
    }

    try {
      const config = await prisma.guildConfig.findUnique({
        where: { guildId },
      });

      if (!config) {
        return { success: false, error: "Guild not configured" };
      }

      if (!config.categoryId) {
        return { success: false, error: "Immersion not set up" };
      }

      // Determine which languages are enabled (empty array = all enabled)
      const allLanguageCodes = Object.keys(LANGUAGES);
      const effectiveEnabled = enabledLanguages.length === 0 ? allLanguageCodes : enabledLanguages;
      const disabledLanguages = allLanguageCodes.filter(code => !effectiveEnabled.includes(code));

      // Get or create disabled category if we have disabled languages
      let disabledCategoryId = config.disabledCategoryId;
      if (disabledLanguages.length > 0 && !disabledCategoryId) {
        // Create the disabled category
        const disabledCategory = await guild.channels.create({
          name: "Disabled Immersion",
          type: ChannelType.GuildCategory,
          reason: "Created for disabled language channels",
        });
        disabledCategoryId = disabledCategory.id;
      }

      // Track any channel recreations for database update
      const channelUpdates: Record<string, any> = {};

      // Move channels based on their enabled/disabled status
      for (const [code, lang] of Object.entries(LANGUAGES)) {
        const fields = CHANNEL_FIELD_MAP[code];
        const channelId = (config as any)[fields.channel];
        const isEnabled = effectiveEnabled.includes(code);

        try {
          let channel = channelId ? await guild.channels.fetch(channelId).catch(() => null) : null;

          // If channel doesn't exist and language is being enabled, recreate it
          if (!channel && isEnabled) {
            // Recreate the channel
            const newChannel = await guild.channels.create({
              name: `${lang.emoji}︱${lang.channelName}`,
              type: ChannelType.GuildText,
              parent: config.categoryId,
              topic: `${lang.emoji} ${lang.name} - Language immersion channel. Messages here will be translated to other language channels.`,
              rateLimitPerUser: IMMERSION_CHANNEL_SLOWMODE,
              reason: `Language ${code} re-enabled - channel recreated`,
            });

            // Create webhook for the new channel
            const webhook = await webhookService.createWebhookForChannel(newChannel as TextChannel);

            // Track updates for database
            channelUpdates[fields.channel] = newChannel.id;
            channelUpdates[fields.webhookId] = webhook.id;
            channelUpdates[fields.webhookToken] = webhook.token;

            continue;
          }

          if (!channel || channel.type !== ChannelType.GuildText) continue;

          const textChannel = channel as TextChannel;
          const shouldBeInMainCategory = isEnabled;
          const currentParentId = textChannel.parentId;

          if (shouldBeInMainCategory && currentParentId !== config.categoryId) {
            // Move to main immersion category
            await textChannel.setParent(config.categoryId, {
              reason: `Language ${code} re-enabled`,
            });
          } else if (!shouldBeInMainCategory && disabledCategoryId && currentParentId !== disabledCategoryId) {
            // Move to disabled category
            await textChannel.setParent(disabledCategoryId, {
              reason: `Language ${code} disabled`,
            });
          }
        } catch (err) {
          console.error(`Error processing channel for ${code}:`, err);
          // Continue with other channels even if one fails
        }
      }

      // Clean up disabled category if no longer needed
      if (disabledLanguages.length === 0 && config.disabledCategoryId) {
        try {
          const disabledCategory = await guild.channels.fetch(config.disabledCategoryId);
          if (disabledCategory && disabledCategory.type === ChannelType.GuildCategory) {
            const categoryChannel = disabledCategory as CategoryChannel;
            if (categoryChannel.children.cache.size === 0) {
              await disabledCategory.delete("No more disabled languages");
              disabledCategoryId = null;
            }
          }
        } catch {
          // Category may already be deleted
          disabledCategoryId = null;
        }
      }

      // Save to database (including any recreated channels)
      await prisma.guildConfig.update({
        where: { guildId },
        data: {
          enabledLanguages: JSON.stringify(enabledLanguages),
          disabledCategoryId: disabledCategoryId,
          ...channelUpdates,
        },
      });

      return { success: true };
    } catch (error: any) {
      console.error("Error updating enabled languages:", error);
      return { success: false, error: error.message || "Failed to update enabled languages" };
    }
  }
}

export const immersionManager = new ImmersionManagerService();
