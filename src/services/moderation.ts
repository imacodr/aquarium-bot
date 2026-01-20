import { prisma } from "../database/prisma";
import { Guild, GuildMember, User, EmbedBuilder, TextChannel } from "discord.js";
import { client } from "../client";

const LOG_COLORS = {
  BAN: 0xef4444,
  UNBAN: 0x22c55e,
  TIMEOUT: 0xf59e0b,
  WARN: 0xfbbf24,
  CLEAR_WARNINGS: 0x6b7280,
};

export interface BanResult {
  success: boolean;
  error?: string;
  ban?: {
    id: string;
    expiresAt: Date | null;
    reason: string | null;
  };
}

export interface UnbanResult {
  success: boolean;
  error?: string;
}

export interface WarnResult {
  success: boolean;
  error?: string;
  warningCount?: number;
}

export interface ModerationHistory {
  bans: {
    id: string;
    reason: string | null;
    bannedBy: string;
    bannedAt: Date;
    expiresAt: Date | null;
    active: boolean;
    unbannedBy: string | null;
    unbannedAt: Date | null;
  }[];
  warnings: {
    id: string;
    reason: string;
    warnedBy: string;
    createdAt: Date;
    active: boolean;
  }[];
  logs: {
    id: string;
    action: string;
    reason: string | null;
    moderatorId: string;
    duration: number | null;
    createdAt: Date;
  }[];
}

class ModerationService {
  /**
   * Check if a user is currently banned from immersion in a guild
   */
  async isUserBanned(guildId: string, discordId: string): Promise<boolean> {
    const ban = await this.getActiveBan(guildId, discordId);
    return ban !== null;
  }

  /**
   * Get active ban for a user (handles expiration automatically)
   */
  async getActiveBan(guildId: string, discordId: string) {
    // First, expire any outdated bans
    await prisma.immersionBan.updateMany({
      where: {
        guildId,
        discordId,
        active: true,
        expiresAt: {
          lte: new Date(),
        },
      },
      data: {
        active: false,
      },
    });

    // Now get any remaining active ban
    return prisma.immersionBan.findFirst({
      where: {
        guildId,
        discordId,
        active: true,
      },
    });
  }

  /**
   * Ban a user from using immersion
   * @param duration Duration in seconds, null for permanent
   */
  async banUser(
    guildId: string,
    targetId: string,
    moderatorId: string,
    reason?: string,
    duration?: number | null
  ): Promise<BanResult> {
    try {
      // Check if user is already banned
      const existingBan = await this.getActiveBan(guildId, targetId);
      if (existingBan) {
        return {
          success: false,
          error: "User is already banned from immersion",
        };
      }

      // Calculate expiration
      const expiresAt = duration
        ? new Date(Date.now() + duration * 1000)
        : null;

      // Create the ban
      const ban = await prisma.immersionBan.create({
        data: {
          guildId,
          discordId: targetId,
          reason,
          bannedBy: moderatorId,
          expiresAt,
          active: true,
        },
      });

      // Log the action
      await this.logAction(guildId, targetId, moderatorId, "ban", reason, duration ?? undefined);

      return {
        success: true,
        ban: {
          id: ban.id,
          expiresAt: ban.expiresAt,
          reason: ban.reason,
        },
      };
    } catch (error) {
      console.error("Error banning user:", error);
      return {
        success: false,
        error: "Failed to ban user",
      };
    }
  }

  /**
   * Unban a user from immersion
   */
  async unbanUser(
    guildId: string,
    targetId: string,
    moderatorId: string,
    reason?: string
  ): Promise<UnbanResult> {
    try {
      const existingBan = await this.getActiveBan(guildId, targetId);
      if (!existingBan) {
        return {
          success: false,
          error: "User is not banned from immersion",
        };
      }

      // Update the ban record
      await prisma.immersionBan.update({
        where: { id: existingBan.id },
        data: {
          active: false,
          unbannedBy: moderatorId,
          unbannedAt: new Date(),
          unbanReason: reason,
        },
      });

      // Log the action
      await this.logAction(guildId, targetId, moderatorId, "unban", reason);

      return { success: true };
    } catch (error) {
      console.error("Error unbanning user:", error);
      return {
        success: false,
        error: "Failed to unban user",
      };
    }
  }

  /**
   * Timeout a user (temporary ban)
   */
  async timeoutUser(
    guildId: string,
    targetId: string,
    moderatorId: string,
    duration: number,
    reason?: string
  ): Promise<BanResult> {
    return this.banUser(guildId, targetId, moderatorId, reason, duration);
  }

  /**
   * Add a warning to a user
   */
  async warnUser(
    guildId: string,
    targetId: string,
    moderatorId: string,
    reason: string
  ): Promise<WarnResult> {
    try {
      // Create the warning
      await prisma.immersionWarning.create({
        data: {
          guildId,
          discordId: targetId,
          reason,
          warnedBy: moderatorId,
          active: true,
        },
      });

      // Log the action
      await this.logAction(guildId, targetId, moderatorId, "warn", reason);

      // Get warning count
      const warningCount = await prisma.immersionWarning.count({
        where: {
          guildId,
          discordId: targetId,
          active: true,
        },
      });

      return {
        success: true,
        warningCount,
      };
    } catch (error) {
      console.error("Error warning user:", error);
      return {
        success: false,
        error: "Failed to warn user",
      };
    }
  }

  /**
   * Get active warnings for a user
   */
  async getWarnings(guildId: string, discordId: string) {
    return prisma.immersionWarning.findMany({
      where: {
        guildId,
        discordId,
        active: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Clear all warnings for a user
   */
  async clearWarnings(
    guildId: string,
    targetId: string,
    moderatorId: string,
    reason?: string
  ): Promise<{ success: boolean; cleared: number }> {
    try {
      const result = await prisma.immersionWarning.updateMany({
        where: {
          guildId,
          discordId: targetId,
          active: true,
        },
        data: {
          active: false,
        },
      });

      // Log the action
      await this.logAction(guildId, targetId, moderatorId, "clear_warnings", reason);

      return {
        success: true,
        cleared: result.count,
      };
    } catch (error) {
      console.error("Error clearing warnings:", error);
      return {
        success: false,
        cleared: 0,
      };
    }
  }

  /**
   * Remove a specific warning
   */
  async removeWarning(
    warningId: string,
    moderatorId: string,
    reason?: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const warning = await prisma.immersionWarning.findUnique({
        where: { id: warningId },
      });

      if (!warning) {
        return { success: false, error: "Warning not found" };
      }

      await prisma.immersionWarning.update({
        where: { id: warningId },
        data: { active: false },
      });

      // Log the action
      await this.logAction(
        warning.guildId,
        warning.discordId,
        moderatorId,
        "remove_warning",
        reason,
        undefined,
        JSON.stringify({ warningId })
      );

      return { success: true };
    } catch (error) {
      console.error("Error removing warning:", error);
      return { success: false, error: "Failed to remove warning" };
    }
  }

  /**
   * Get moderation history for a user
   */
  async getModerationHistory(
    guildId: string,
    discordId: string
  ): Promise<ModerationHistory> {
    const [bans, warnings, logs] = await Promise.all([
      prisma.immersionBan.findMany({
        where: { guildId, discordId },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      prisma.immersionWarning.findMany({
        where: { guildId, discordId },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      prisma.moderationLog.findMany({
        where: { guildId, targetId: discordId },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
    ]);

    return {
      bans: bans.map((b) => ({
        id: b.id,
        reason: b.reason,
        bannedBy: b.bannedBy,
        bannedAt: b.bannedAt,
        expiresAt: b.expiresAt,
        active: b.active,
        unbannedBy: b.unbannedBy,
        unbannedAt: b.unbannedAt,
      })),
      warnings: warnings.map((w) => ({
        id: w.id,
        reason: w.reason,
        warnedBy: w.warnedBy,
        createdAt: w.createdAt,
        active: w.active,
      })),
      logs: logs.map((l) => ({
        id: l.id,
        action: l.action,
        reason: l.reason,
        moderatorId: l.moderatorId,
        duration: l.duration,
        createdAt: l.createdAt,
      })),
    };
  }

  /**
   * Get all active bans in a guild
   */
  async getGuildBans(guildId: string, page = 1, limit = 20) {
    // First expire outdated bans
    await prisma.immersionBan.updateMany({
      where: {
        guildId,
        active: true,
        expiresAt: {
          lte: new Date(),
        },
      },
      data: {
        active: false,
      },
    });

    const [bans, total] = await Promise.all([
      prisma.immersionBan.findMany({
        where: { guildId, active: true },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.immersionBan.count({
        where: { guildId, active: true },
      }),
    ]);

    return {
      bans,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get recent moderation logs for a guild
   */
  async getGuildModerationLogs(guildId: string, page = 1, limit = 20) {
    const [logs, total] = await Promise.all([
      prisma.moderationLog.findMany({
        where: { guildId },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.moderationLog.count({
        where: { guildId },
      }),
    ]);

    return {
      logs,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Log a moderation action
   */
  private async logAction(
    guildId: string,
    targetId: string,
    moderatorId: string,
    action: string,
    reason?: string,
    duration?: number,
    metadata?: string
  ) {
    // Save to database
    await prisma.moderationLog.create({
      data: {
        guildId,
        targetId,
        moderatorId,
        action,
        reason,
        duration,
        metadata,
      },
    });

    // Send to log channel if configured
    await this.sendToLogChannel(guildId, targetId, moderatorId, action, reason, duration);
  }

  /**
   * Send a log embed to the configured mod log channel
   */
  private async sendToLogChannel(
    guildId: string,
    targetId: string,
    moderatorId: string,
    action: string,
    reason?: string,
    duration?: number
  ) {
    try {
      const config = await prisma.guildConfig.findUnique({
        where: { guildId },
        select: { modLogChannelId: true },
      });

      if (!config?.modLogChannelId) return;

      const guild = client.guilds.cache.get(guildId);
      if (!guild) return;

      const channel = guild.channels.cache.get(config.modLogChannelId);
      if (!channel || !channel.isTextBased()) return;

      // Get user info
      let targetUser;
      let moderatorUser;
      try {
        targetUser = await client.users.fetch(targetId);
      } catch {
        targetUser = null;
      }
      try {
        moderatorUser = await client.users.fetch(moderatorId);
      } catch {
        moderatorUser = null;
      }

      const actionColors: Record<string, number> = {
        ban: LOG_COLORS.BAN,
        unban: LOG_COLORS.UNBAN,
        timeout: LOG_COLORS.TIMEOUT,
        warn: LOG_COLORS.WARN,
        clear_warnings: LOG_COLORS.CLEAR_WARNINGS,
        remove_warning: LOG_COLORS.CLEAR_WARNINGS,
      };

      const actionTitles: Record<string, string> = {
        ban: "Member Banned from Immersion",
        unban: "Member Unbanned from Immersion",
        timeout: "Member Timed Out from Immersion",
        warn: "Member Warned",
        clear_warnings: "Warnings Cleared",
        remove_warning: "Warning Removed",
      };

      const embed = new EmbedBuilder()
        .setColor(actionColors[action] || 0x6b7280)
        .setTitle(actionTitles[action] || `Moderation: ${action}`)
        .setTimestamp();

      if (targetUser) {
        embed.setThumbnail(targetUser.displayAvatarURL());
        embed.addFields({
          name: "User",
          value: `${targetUser.tag} (<@${targetId}>)`,
          inline: true,
        });
      } else {
        embed.addFields({
          name: "User ID",
          value: targetId,
          inline: true,
        });
      }

      embed.addFields({
        name: "Moderator",
        value: moderatorUser ? `${moderatorUser.tag} (<@${moderatorId}>)` : `<@${moderatorId}>`,
        inline: true,
      });

      if (duration) {
        embed.addFields({
          name: "Duration",
          value: this.formatDuration(duration),
          inline: true,
        });
      }

      if (reason) {
        embed.addFields({
          name: "Reason",
          value: reason,
        });
      }

      await (channel as TextChannel).send({ embeds: [embed] });
    } catch (error) {
      console.error("Error sending to mod log channel:", error);
    }
  }

  /**
   * Set the mod log channel for a guild
   */
  async setLogChannel(guildId: string, channelId: string | null): Promise<{ success: boolean; error?: string }> {
    try {
      // Verify channel exists and is a text channel if setting
      if (channelId) {
        const guild = client.guilds.cache.get(guildId);
        if (!guild) {
          return { success: false, error: "Guild not found" };
        }

        const channel = guild.channels.cache.get(channelId);
        if (!channel) {
          return { success: false, error: "Channel not found" };
        }

        if (!channel.isTextBased()) {
          return { success: false, error: "Channel must be a text channel" };
        }
      }

      await prisma.guildConfig.update({
        where: { guildId },
        data: { modLogChannelId: channelId },
      });

      return { success: true };
    } catch (error) {
      console.error("Error setting log channel:", error);
      return { success: false, error: "Failed to set log channel" };
    }
  }

  /**
   * Get the mod log channel for a guild
   */
  async getLogChannel(guildId: string): Promise<string | null> {
    const config = await prisma.guildConfig.findUnique({
      where: { guildId },
      select: { modLogChannelId: true },
    });
    return config?.modLogChannelId || null;
  }

  /**
   * Get ban status info for display
   */
  async getBanStatus(guildId: string, discordId: string) {
    const ban = await this.getActiveBan(guildId, discordId);
    if (!ban) {
      return {
        isBanned: false,
      };
    }

    return {
      isBanned: true,
      reason: ban.reason,
      bannedAt: ban.bannedAt,
      expiresAt: ban.expiresAt,
      isPermanent: !ban.expiresAt,
      bannedBy: ban.bannedBy,
    };
  }

  /**
   * Format duration for display
   */
  formatDuration(seconds: number): string {
    if (seconds < 60) {
      return `${seconds} second${seconds !== 1 ? "s" : ""}`;
    }
    if (seconds < 3600) {
      const minutes = Math.floor(seconds / 60);
      return `${minutes} minute${minutes !== 1 ? "s" : ""}`;
    }
    if (seconds < 86400) {
      const hours = Math.floor(seconds / 3600);
      return `${hours} hour${hours !== 1 ? "s" : ""}`;
    }
    const days = Math.floor(seconds / 86400);
    return `${days} day${days !== 1 ? "s" : ""}`;
  }

  /**
   * Parse duration string (e.g., "1d", "12h", "30m") to seconds
   */
  parseDuration(duration: string): number | null {
    const match = duration.match(/^(\d+)\s*(s|m|h|d|w)$/i);
    if (!match) return null;

    const value = parseInt(match[1], 10);
    const unit = match[2].toLowerCase();

    switch (unit) {
      case "s":
        return value;
      case "m":
        return value * 60;
      case "h":
        return value * 3600;
      case "d":
        return value * 86400;
      case "w":
        return value * 604800;
      default:
        return null;
    }
  }
}

export const moderationService = new ModerationService();
