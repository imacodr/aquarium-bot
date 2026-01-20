import {
  Guild,
  TextChannel,
  PermissionFlagsBits,
  GuildMember,
  ChannelType,
} from "discord.js";
import { GuildConfig } from "@prisma/client";
import { LANGUAGES, LANGUAGE_CODES } from "../config/languages";

/**
 * Maps language codes to their corresponding channel ID field in GuildConfig
 */
const LANGUAGE_CHANNEL_MAP: Record<string, keyof GuildConfig> = {
  EN: "englishChannelId",
  ES: "spanishChannelId",
  "PT-BR": "portugueseChannelId",
  FR: "frenchChannelId",
  DE: "germanChannelId",
  IT: "italianChannelId",
  JA: "japaneseChannelId",
  KO: "koreanChannelId",
  ZH: "chineseChannelId",
};

/**
 * Get the channel ID for a specific language from the guild config
 */
export function getChannelIdForLanguage(
  guildConfig: GuildConfig,
  langCode: string
): string | null {
  const field = LANGUAGE_CHANNEL_MAP[langCode];
  if (!field) return null;
  return (guildConfig[field] as string) || null;
}

/**
 * Get all language channel IDs from a guild config
 */
export function getAllLanguageChannelIds(guildConfig: GuildConfig): Map<string, string> {
  const channels = new Map<string, string>();
  for (const langCode of LANGUAGE_CODES) {
    const channelId = getChannelIdForLanguage(guildConfig, langCode);
    if (channelId) {
      channels.set(langCode, channelId);
    }
  }
  return channels;
}

class ChannelPermissionService {
  /**
   * Update a user's channel visibility based on their language subscriptions
   * Empty subscribedLanguages = access to all channels
   */
  async updateUserChannelAccess(
    guild: Guild,
    userId: string,
    subscribedLanguages: string[],
    guildConfig: GuildConfig
  ): Promise<{ granted: string[]; revoked: string[]; errors: string[] }> {
    const granted: string[] = [];
    const revoked: string[] = [];
    const errors: string[] = [];

    const allChannels = getAllLanguageChannelIds(guildConfig);

    for (const [langCode, channelId] of allChannels) {
      try {
        const channel = await guild.channels.fetch(channelId);
        if (!channel || channel.type !== ChannelType.GuildText) continue;

        const textChannel = channel as TextChannel;
        const shouldHaveAccess =
          subscribedLanguages.length === 0 || subscribedLanguages.includes(langCode);

        if (shouldHaveAccess) {
          await this.grantChannelAccess(textChannel, userId);
          granted.push(langCode);
        } else {
          await this.revokeChannelAccess(textChannel, userId);
          revoked.push(langCode);
        }
      } catch (error) {
        console.error(`Error updating permissions for channel ${channelId}:`, error);
        errors.push(langCode);
      }
    }

    return { granted, revoked, errors };
  }

  /**
   * Grant a user access to view and send messages in a channel
   */
  async grantChannelAccess(channel: TextChannel, userId: string): Promise<void> {
    // Remove the permission override to allow default permissions (from roles)
    // This is cleaner than explicitly setting permissions
    const existingOverwrite = channel.permissionOverwrites.cache.get(userId);
    if (existingOverwrite) {
      await channel.permissionOverwrites.delete(userId);
    }
  }

  /**
   * Revoke a user's access to a channel
   */
  async revokeChannelAccess(channel: TextChannel, userId: string): Promise<void> {
    await channel.permissionOverwrites.edit(userId, {
      ViewChannel: false,
      SendMessages: false,
    });
  }

  /**
   * Check if a user has access to a specific channel
   */
  async checkChannelAccess(channel: TextChannel, userId: string): Promise<boolean> {
    try {
      const member = await channel.guild.members.fetch(userId);
      const permissions = channel.permissionsFor(member);
      return permissions?.has(PermissionFlagsBits.ViewChannel) ?? false;
    } catch {
      return false;
    }
  }

  /**
   * Reset a user's channel permissions to default (access to all)
   */
  async resetUserChannelAccess(
    guild: Guild,
    userId: string,
    guildConfig: GuildConfig
  ): Promise<void> {
    const allChannels = getAllLanguageChannelIds(guildConfig);

    for (const [, channelId] of allChannels) {
      try {
        const channel = await guild.channels.fetch(channelId);
        if (!channel || channel.type !== ChannelType.GuildText) continue;

        const textChannel = channel as TextChannel;
        await this.grantChannelAccess(textChannel, userId);
      } catch (error) {
        console.error(`Error resetting permissions for channel ${channelId}:`, error);
      }
    }
  }

  /**
   * Get a user's current channel access status
   */
  async getUserChannelAccessStatus(
    guild: Guild,
    userId: string,
    guildConfig: GuildConfig
  ): Promise<Map<string, boolean>> {
    const status = new Map<string, boolean>();
    const allChannels = getAllLanguageChannelIds(guildConfig);

    for (const [langCode, channelId] of allChannels) {
      try {
        const channel = await guild.channels.fetch(channelId);
        if (!channel || channel.type !== ChannelType.GuildText) {
          status.set(langCode, false);
          continue;
        }

        const hasAccess = await this.checkChannelAccess(channel as TextChannel, userId);
        status.set(langCode, hasAccess);
      } catch {
        status.set(langCode, false);
      }
    }

    return status;
  }
}

export const channelPermissionService = new ChannelPermissionService();
