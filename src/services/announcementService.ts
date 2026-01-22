/**
 * Announcement Service
 * Handles sending announcements to server owners, all servers, or verified users
 */

import { EmbedBuilder, TextChannel } from "discord.js";
import { prisma } from "../database/prisma";
import { client } from "../client";

interface AnnouncementPreview {
  type: string;
  targetCount: number;
  description: string;
}

interface AnnouncementResult {
  id: string;
  success: boolean;
  targetCount: number;
  status: string;
}

interface AnnouncementRecord {
  id: string;
  developerId: string;
  type: string;
  title: string;
  content: string;
  status: string;
  targetCount: number;
  sentCount: number;
  failedCount: number;
  createdAt: Date;
  completedAt: Date | null;
}

// Rate limiting for announcements
const RATE_LIMIT_DELAY = 1000; // 1 second between DMs
const BATCH_SIZE = 50; // Process in batches

/**
 * Preview announcement to get target count
 */
export async function previewAnnouncement(
  type: "server_owners" | "all_servers" | "verified_users"
): Promise<AnnouncementPreview> {
  switch (type) {
    case "server_owners": {
      // Get unique owner IDs from all guilds
      const ownerIds = new Set<string>();
      client.guilds.cache.forEach((guild) => {
        ownerIds.add(guild.ownerId);
      });
      return {
        type,
        targetCount: ownerIds.size,
        description: "DM will be sent to each unique server owner",
      };
    }

    case "all_servers": {
      // Get guilds with immersion set up (have a system channel or first text channel)
      const guildCount = client.guilds.cache.size;
      return {
        type,
        targetCount: guildCount,
        description: "Message will be sent to system channel or first available text channel in each server",
      };
    }

    case "verified_users": {
      // Get unique user IDs from verified users
      const uniqueUsers = await prisma.verifiedUser.groupBy({
        by: ["discordId"],
      });
      return {
        type,
        targetCount: uniqueUsers.length,
        description: "DM will be sent to each unique verified user",
      };
    }

    default:
      throw new Error("Invalid announcement type");
  }
}

/**
 * Send announcement
 */
export async function sendAnnouncement(options: {
  developerId: string;
  type: "server_owners" | "all_servers" | "verified_users";
  title: string;
  content: string;
}): Promise<AnnouncementResult> {
  const { developerId, type, title, content } = options;

  // Get target count
  const preview = await previewAnnouncement(type);

  // Create announcement record
  const announcement = await prisma.announcement.create({
    data: {
      developerId,
      type,
      title,
      content,
      status: "sending",
      targetCount: preview.targetCount,
    },
  });

  // Log to audit
  await prisma.developerAuditLog.create({
    data: {
      developerId,
      action: "announcement",
      targetType: "global",
      targetId: announcement.id,
      details: JSON.stringify({ type, title, targetCount: preview.targetCount }),
    },
  });

  // Start sending in background
  sendAnnouncementAsync(announcement.id, type, title, content).catch((error) => {
    console.error("Error in async announcement sending:", error);
  });

  return {
    id: announcement.id,
    success: true,
    targetCount: preview.targetCount,
    status: "sending",
  };
}

/**
 * Async function to send announcements with rate limiting
 */
async function sendAnnouncementAsync(
  announcementId: string,
  type: "server_owners" | "all_servers" | "verified_users",
  title: string,
  content: string
): Promise<void> {
  let sentCount = 0;
  let failedCount = 0;

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(content)
    .setColor(0x5865f2)
    .setFooter({ text: "Aquarium Bot Announcement" })
    .setTimestamp();

  try {
    switch (type) {
      case "server_owners": {
        const ownerIds = new Set<string>();
        client.guilds.cache.forEach((guild) => {
          ownerIds.add(guild.ownerId);
        });

        for (const ownerId of ownerIds) {
          try {
            const user = await client.users.fetch(ownerId);
            await user.send({ embeds: [embed] });
            sentCount++;
          } catch {
            failedCount++;
          }
          await sleep(RATE_LIMIT_DELAY);
        }
        break;
      }

      case "all_servers": {
        for (const guild of client.guilds.cache.values()) {
          try {
            // Try system channel first, then first text channel
            let channel: TextChannel | null = null;

            if (guild.systemChannelId) {
              const systemChannel = guild.channels.cache.get(guild.systemChannelId);
              if (systemChannel?.isTextBased() && systemChannel.type === 0) {
                channel = systemChannel as TextChannel;
              }
            }

            if (!channel) {
              // Find first text channel where bot can send messages
              channel = guild.channels.cache.find(
                (c) =>
                  c.type === 0 &&
                  c.permissionsFor(guild.members.me!)?.has("SendMessages")
              ) as TextChannel | undefined ?? null;
            }

            if (channel) {
              await channel.send({ embeds: [embed] });
              sentCount++;
            } else {
              failedCount++;
            }
          } catch {
            failedCount++;
          }
          await sleep(RATE_LIMIT_DELAY);
        }
        break;
      }

      case "verified_users": {
        const uniqueUsers = await prisma.verifiedUser.groupBy({
          by: ["discordId"],
        });

        for (const { discordId } of uniqueUsers) {
          try {
            const user = await client.users.fetch(discordId);
            await user.send({ embeds: [embed] });
            sentCount++;
          } catch {
            failedCount++;
          }
          await sleep(RATE_LIMIT_DELAY);
        }
        break;
      }
    }

    // Update announcement record
    await prisma.announcement.update({
      where: { id: announcementId },
      data: {
        status: "completed",
        sentCount,
        failedCount,
        completedAt: new Date(),
      },
    });
  } catch (error) {
    console.error("Announcement sending failed:", error);
    await prisma.announcement.update({
      where: { id: announcementId },
      data: {
        status: "failed",
        sentCount,
        failedCount,
        completedAt: new Date(),
      },
    });
  }
}

/**
 * Get announcement history
 */
export async function getAnnouncements(options: {
  page?: number;
  limit?: number;
}): Promise<{
  announcements: AnnouncementRecord[];
  total: number;
  page: number;
  totalPages: number;
}> {
  const page = options.page || 1;
  const limit = Math.min(options.limit || 20, 50);
  const skip = (page - 1) * limit;

  const [announcements, total] = await Promise.all([
    prisma.announcement.findMany({
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.announcement.count(),
  ]);

  return {
    announcements,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  };
}

/**
 * Get specific announcement by ID
 */
export async function getAnnouncementById(id: string): Promise<AnnouncementRecord | null> {
  return prisma.announcement.findUnique({
    where: { id },
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const announcementService = {
  previewAnnouncement,
  sendAnnouncement,
  getAnnouncements,
  getAnnouncementById,
};
