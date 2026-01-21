import { GuildMember, PermissionFlagsBits } from 'discord.js';
import { prisma } from '../database/prisma';
import {
  CommandGroup,
  COMMAND_HIERARCHY,
  COMMAND_GROUP_INFO,
  PermissionCheckResult,
  PermissionType,
} from '../types/permissions';

interface CacheEntry {
  permissions: Awaited<ReturnType<typeof prisma.commandPermission.findMany>>;
  useCustomPermissions: boolean;
  timestamp: number;
}

const CACHE_TTL = 60 * 1000; // 1 minute cache
const permissionCache = new Map<string, CacheEntry>();

// Discord permission mappings
const DISCORD_PERMISSION_MAP: Record<string, bigint> = {
  'Administrator': PermissionFlagsBits.Administrator,
  'ModerateMembers': PermissionFlagsBits.ModerateMembers,
  'ManageMessages': PermissionFlagsBits.ManageMessages,
  'ManageGuild': PermissionFlagsBits.ManageGuild,
};

class PermissionService {
  private async getGuildPermissions(guildId: string) {
    const cached = permissionCache.get(guildId);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached;
    }

    const config = await prisma.guildConfig.findUnique({
      where: { guildId },
      select: { useCustomPermissions: true },
    });

    const permissions = await prisma.commandPermission.findMany({
      where: { guildId },
    });

    const entry: CacheEntry = {
      permissions,
      useCustomPermissions: config?.useCustomPermissions ?? false,
      timestamp: Date.now(),
    };

    permissionCache.set(guildId, entry);
    return entry;
  }

  invalidateCache(guildId: string) {
    permissionCache.delete(guildId);
  }

  async checkPermission(
    member: GuildMember,
    commandGroup: CommandGroup
  ): Promise<PermissionCheckResult> {
    const guildId = member.guild.id;

    // 1. Server owner always has access
    if (member.guild.ownerId === member.id) {
      return { allowed: true, reason: 'Server owner', source: 'owner' };
    }

    // 2. Discord Administrator always has access
    if (member.permissions.has(PermissionFlagsBits.Administrator)) {
      return { allowed: true, reason: 'Administrator permission', source: 'admin' };
    }

    // Get guild permissions config
    const { permissions, useCustomPermissions } = await this.getGuildPermissions(guildId);

    // 3. If custom permissions are disabled, fall back to Discord native permissions
    if (!useCustomPermissions) {
      return this.checkDiscordNativePermission(member, commandGroup);
    }

    // 4. Check user-specific permission (highest priority)
    const userPermission = permissions.find(
      (p) => p.userId === member.id && this.matchesCommandGroup(p.commandGroup as CommandGroup, commandGroup)
    );
    if (userPermission) {
      if (userPermission.permission === 'deny') {
        return { allowed: false, reason: 'User permission denied', source: 'denied' };
      }
      return { allowed: true, reason: 'User permission', source: 'user_permission' };
    }

    // 5. Check role-based permissions (by role hierarchy)
    const memberRoles = member.roles.cache
      .filter((role) => role.id !== guildId) // Exclude @everyone
      .sort((a, b) => b.position - a.position); // Sort by position (highest first)

    for (const role of memberRoles.values()) {
      const rolePermission = permissions.find(
        (p) => p.roleId === role.id && this.matchesCommandGroup(p.commandGroup as CommandGroup, commandGroup)
      );
      if (rolePermission) {
        if (rolePermission.permission === 'deny') {
          return { allowed: false, reason: `Role "${role.name}" permission denied`, source: 'denied' };
        }
        return { allowed: true, reason: `Role "${role.name}" permission`, source: 'role_permission' };
      }
    }

    // 6. Fall back to Discord native permissions
    return this.checkDiscordNativePermission(member, commandGroup);
  }

  private matchesCommandGroup(permissionGroup: CommandGroup, targetGroup: CommandGroup): boolean {
    // Exact match
    if (permissionGroup === targetGroup) return true;

    // Check if permissionGroup is a parent of targetGroup
    const children = COMMAND_HIERARCHY[permissionGroup];
    if (children && children.includes(targetGroup)) {
      return true;
    }

    return false;
  }

  private checkDiscordNativePermission(
    member: GuildMember,
    commandGroup: CommandGroup
  ): PermissionCheckResult {
    const groupInfo = COMMAND_GROUP_INFO[commandGroup];
    if (!groupInfo) {
      return { allowed: false, reason: 'Unknown command group', source: 'denied' };
    }

    const requiredPermission = DISCORD_PERMISSION_MAP[groupInfo.discordPermission];
    if (!requiredPermission) {
      return { allowed: false, reason: 'Unknown Discord permission', source: 'denied' };
    }

    if (member.permissions.has(requiredPermission)) {
      return { allowed: true, reason: `Discord ${groupInfo.discordPermission} permission`, source: 'discord_native' };
    }

    return { allowed: false, reason: `Missing ${groupInfo.discordPermission} permission`, source: 'denied' };
  }

  async addPermission(
    guildId: string,
    commandGroup: CommandGroup,
    targetType: 'role' | 'user',
    targetId: string,
    permission: PermissionType,
    createdBy: string
  ) {
    // First, ensure GuildConfig exists
    await prisma.guildConfig.upsert({
      where: { guildId },
      create: { guildId },
      update: {},
    });

    const data = {
      guildId,
      commandGroup,
      permission,
      createdBy,
      ...(targetType === 'role' ? { roleId: targetId } : { userId: targetId }),
    };

    const result = await prisma.commandPermission.upsert({
      where: targetType === 'role'
        ? { guildId_commandGroup_roleId: { guildId, commandGroup, roleId: targetId } }
        : { guildId_commandGroup_userId: { guildId, commandGroup, userId: targetId } },
      create: data,
      update: { permission, createdBy },
    });

    this.invalidateCache(guildId);
    return result;
  }

  async removePermission(id: string, guildId: string) {
    const result = await prisma.commandPermission.delete({
      where: { id },
    });
    this.invalidateCache(guildId);
    return result;
  }

  async getAllPermissions(guildId: string) {
    return prisma.commandPermission.findMany({
      where: { guildId },
      orderBy: [{ commandGroup: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async setCustomPermissionsEnabled(guildId: string, enabled: boolean) {
    const result = await prisma.guildConfig.upsert({
      where: { guildId },
      create: { guildId, useCustomPermissions: enabled },
      update: { useCustomPermissions: enabled },
    });
    this.invalidateCache(guildId);
    return result;
  }

  async getCustomPermissionsEnabled(guildId: string): Promise<boolean> {
    const config = await prisma.guildConfig.findUnique({
      where: { guildId },
      select: { useCustomPermissions: true },
    });
    return config?.useCustomPermissions ?? false;
  }
}

export const permissionService = new PermissionService();
