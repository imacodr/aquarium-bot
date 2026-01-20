import { Request, Response, NextFunction } from "express";
import { client } from "../../client";
import { PermissionFlagsBits } from "discord.js";

export interface DiscordUser {
  id: string;
  username: string;
  discriminator: string;
  avatar: string | null;
  email?: string;
}

declare global {
  namespace Express {
    interface User extends DiscordUser {}
  }
}

export function isAuthenticated(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated()) {
    return next();
  }
  return res.status(401).json({ error: "Unauthorized" });
}

export function isAuthenticatedRedirect(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated()) {
    return next();
  }
  return res.redirect("/auth/discord");
}

/**
 * Middleware to check if user is a guild admin
 * Requires guildId to be in req.params.id or req.params.guildId
 */
export function isGuildAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const guildId = req.params.id || req.params.guildId;
  if (!guildId) {
    return res.status(400).json({ error: "Guild ID required" });
  }

  checkGuildAdmin(req.user!.id, guildId)
    .then((result) => {
      if (result.isAdmin) {
        // Attach guild info to request for later use
        (req as any).guildInfo = result;
        return next();
      }
      return res.status(403).json({ error: result.error || "You do not have admin permissions for this server" });
    })
    .catch((error) => {
      console.error("Error checking guild admin:", error);
      return res.status(500).json({ error: "Failed to verify permissions" });
    });
}

/**
 * Middleware to check if user is at least a guild moderator (Manage Messages permission)
 */
export function isGuildModerator(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const guildId = req.params.id || req.params.guildId;
  if (!guildId) {
    return res.status(400).json({ error: "Guild ID required" });
  }

  checkGuildModerator(req.user!.id, guildId)
    .then((result) => {
      if (result.isModerator) {
        (req as any).guildInfo = result;
        return next();
      }
      return res.status(403).json({ error: result.error || "You do not have moderator permissions for this server" });
    })
    .catch((error) => {
      console.error("Error checking guild moderator:", error);
      return res.status(500).json({ error: "Failed to verify permissions" });
    });
}

/**
 * Middleware to check if user is a member of the guild
 */
export function isGuildMember(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const guildId = req.params.id || req.params.guildId;
  if (!guildId) {
    return res.status(400).json({ error: "Guild ID required" });
  }

  checkGuildMember(req.user!.id, guildId)
    .then((result) => {
      if (result.isMember) {
        (req as any).guildInfo = result;
        return next();
      }
      return res.status(403).json({ error: result.error || "You are not a member of this server" });
    })
    .catch((error) => {
      console.error("Error checking guild membership:", error);
      return res.status(500).json({ error: "Failed to verify membership" });
    });
}

// Helper functions for permission checking

interface GuildCheckResult {
  isAdmin?: boolean;
  isModerator?: boolean;
  isMember?: boolean;
  guild?: any;
  member?: any;
  error?: string;
}

async function checkGuildAdmin(userId: string, guildId: string): Promise<GuildCheckResult> {
  const guild = client.guilds.cache.get(guildId);
  if (!guild) {
    return { isAdmin: false, error: "Guild not found or bot is not in this server" };
  }

  try {
    const member = await guild.members.fetch(userId);
    if (!member) {
      return { isAdmin: false, error: "You are not a member of this server" };
    }

    const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);
    return { isAdmin, guild, member };
  } catch (error) {
    return { isAdmin: false, error: "Failed to fetch member information" };
  }
}

async function checkGuildModerator(userId: string, guildId: string): Promise<GuildCheckResult> {
  const guild = client.guilds.cache.get(guildId);
  if (!guild) {
    return { isModerator: false, error: "Guild not found or bot is not in this server" };
  }

  try {
    const member = await guild.members.fetch(userId);
    if (!member) {
      return { isModerator: false, error: "You are not a member of this server" };
    }

    // Moderator has at least ManageMessages permission
    const isModerator =
      member.permissions.has(PermissionFlagsBits.Administrator) ||
      member.permissions.has(PermissionFlagsBits.ManageMessages) ||
      member.permissions.has(PermissionFlagsBits.ManageGuild);

    return { isModerator, guild, member };
  } catch (error) {
    return { isModerator: false, error: "Failed to fetch member information" };
  }
}

async function checkGuildMember(userId: string, guildId: string): Promise<GuildCheckResult> {
  const guild = client.guilds.cache.get(guildId);
  if (!guild) {
    return { isMember: false, error: "Guild not found or bot is not in this server" };
  }

  try {
    const member = await guild.members.fetch(userId);
    return { isMember: !!member, guild, member };
  } catch (error) {
    return { isMember: false, error: "You are not a member of this server" };
  }
}
