import { Router, Request, Response } from "express";
import { isAuthenticated, isGuildAdmin } from "../middleware/auth";
import { validateGuildId, strictRateLimiter, auditLog } from "../middleware/security";
import { permissionService } from "../../services/permissions";
import { COMMAND_GROUPS, COMMAND_GROUP_INFO, CommandGroup } from "../../types/permissions";
import { client } from "../../client";

const router = Router();

/**
 * Get all permissions for a guild, plus available roles and command groups
 * GET /permissions/guilds/:id
 */
router.get(
  "/guilds/:id",
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

      // Get custom permissions setting
      const useCustomPermissions = await permissionService.getCustomPermissionsEnabled(guildId);

      // Get all permissions for this guild
      const permissions = await permissionService.getAllPermissions(guildId);

      // Enhance permissions with role/user names
      const enhancedPermissions = await Promise.all(
        permissions.map(async (perm) => {
          let roleName: string | undefined;
          let userName: string | undefined;

          if (perm.roleId) {
            const role = guild.roles.cache.get(perm.roleId);
            roleName = role?.name || "Deleted Role";
          }

          if (perm.userId) {
            try {
              const member = await guild.members.fetch(perm.userId).catch(() => null);
              userName = member?.displayName || "Unknown User";
            } catch {
              userName = "Unknown User";
            }
          }

          return {
            id: perm.id,
            commandGroup: perm.commandGroup,
            roleId: perm.roleId,
            userId: perm.userId,
            roleName,
            userName,
            permission: perm.permission,
            createdAt: perm.createdAt.toISOString(),
            createdBy: perm.createdBy,
          };
        })
      );

      // Get available roles (exclude @everyone and managed roles)
      const availableRoles = guild.roles.cache
        .filter((role) => role.id !== guildId && !role.managed)
        .sort((a, b) => b.position - a.position)
        .map((role) => ({
          id: role.id,
          name: role.name,
          color: role.color,
          position: role.position,
        }));

      // Get command group info
      const commandGroups = COMMAND_GROUPS.map((group) => ({
        id: group,
        ...COMMAND_GROUP_INFO[group],
      }));

      res.json({
        useCustomPermissions,
        permissions: enhancedPermissions,
        availableRoles,
        commandGroups,
      });
    } catch (error) {
      console.error("Error fetching permissions:", error);
      res.status(500).json({ error: "Failed to fetch permissions" });
    }
  }
);

/**
 * Toggle custom permissions on/off
 * PATCH /permissions/guilds/:id/toggle
 */
router.patch(
  "/guilds/:id/toggle",
  isAuthenticated,
  validateGuildId,
  isGuildAdmin,
  strictRateLimiter,
  auditLog("toggle_custom_permissions"),
  async (req: Request, res: Response) => {
    try {
      const guildId = req.params.id;
      const { enabled } = req.body;

      if (typeof enabled !== "boolean") {
        return res.status(400).json({ error: "enabled must be a boolean" });
      }

      await permissionService.setCustomPermissionsEnabled(guildId, enabled);

      res.json({
        success: true,
        useCustomPermissions: enabled,
      });
    } catch (error) {
      console.error("Error toggling custom permissions:", error);
      res.status(500).json({ error: "Failed to toggle custom permissions" });
    }
  }
);

/**
 * Add a new permission entry
 * POST /permissions/guilds/:id
 */
router.post(
  "/guilds/:id",
  isAuthenticated,
  validateGuildId,
  isGuildAdmin,
  strictRateLimiter,
  auditLog("add_permission"),
  async (req: Request, res: Response) => {
    try {
      const guildId = req.params.id;
      const userId = req.user!.id;
      const { commandGroup, targetType, targetId, permission } = req.body;

      // Validate command group
      if (!COMMAND_GROUPS.includes(commandGroup)) {
        return res.status(400).json({ error: "Invalid command group" });
      }

      // Validate target type
      if (!["role", "user"].includes(targetType)) {
        return res.status(400).json({ error: "targetType must be 'role' or 'user'" });
      }

      // Validate target ID
      if (!targetId || typeof targetId !== "string") {
        return res.status(400).json({ error: "targetId is required" });
      }

      // Validate permission type
      if (!["allow", "deny"].includes(permission)) {
        return res.status(400).json({ error: "permission must be 'allow' or 'deny'" });
      }

      // Validate the target exists in the guild
      const guild = client.guilds.cache.get(guildId);
      if (!guild) {
        return res.status(404).json({ error: "Guild not found" });
      }

      if (targetType === "role") {
        const role = guild.roles.cache.get(targetId);
        if (!role) {
          return res.status(400).json({ error: "Role not found in guild" });
        }
      } else {
        const member = await guild.members.fetch(targetId).catch(() => null);
        if (!member) {
          return res.status(400).json({ error: "User not found in guild" });
        }
      }

      const result = await permissionService.addPermission(
        guildId,
        commandGroup as CommandGroup,
        targetType,
        targetId,
        permission,
        userId
      );

      res.json({
        success: true,
        permission: {
          id: result.id,
          commandGroup: result.commandGroup,
          roleId: result.roleId,
          userId: result.userId,
          permission: result.permission,
          createdAt: result.createdAt.toISOString(),
          createdBy: result.createdBy,
        },
      });
    } catch (error: any) {
      console.error("Error adding permission:", error);
      res.status(500).json({ error: "Failed to add permission" });
    }
  }
);

/**
 * Remove a permission entry
 * DELETE /permissions/guilds/:id/:permissionId
 */
router.delete(
  "/guilds/:id/:permissionId",
  isAuthenticated,
  validateGuildId,
  isGuildAdmin,
  strictRateLimiter,
  auditLog("remove_permission"),
  async (req: Request, res: Response) => {
    try {
      const guildId = req.params.id;
      const permissionId = req.params.permissionId;

      if (!permissionId) {
        return res.status(400).json({ error: "permissionId is required" });
      }

      await permissionService.removePermission(permissionId, guildId);

      res.json({ success: true });
    } catch (error: any) {
      if (error.code === "P2025") {
        return res.status(404).json({ error: "Permission not found" });
      }
      console.error("Error removing permission:", error);
      res.status(500).json({ error: "Failed to remove permission" });
    }
  }
);

export default router;
