import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  EmbedBuilder,
  User,
  GuildMember,
} from "discord.js";
import { moderationService } from "../services/moderation";
import { prisma } from "../database/prisma";
import { permissionService } from "../services/permissions";
import { SUBCOMMAND_TO_GROUP, CommandGroup } from "../types/permissions";

const COLORS = {
  BAN: 0xef4444,
  UNBAN: 0x22c55e,
  WARN: 0xf59e0b,
  INFO: 0x3b82f6,
  ERROR: 0xef4444,
};

const data = new SlashCommandBuilder()
  .setName("mod")
  .setDescription("Moderation commands for language immersion")
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  .addSubcommand((subcommand) =>
    subcommand
      .setName("ban")
      .setDescription("Ban a user from using language immersion")
      .addUserOption((option) =>
        option
          .setName("user")
          .setDescription("The user to ban")
          .setRequired(true)
      )
      .addStringOption((option) =>
        option
          .setName("duration")
          .setDescription("Ban duration (e.g., 1d, 12h, 30m). Leave empty for permanent")
          .setRequired(false)
      )
      .addStringOption((option) =>
        option
          .setName("reason")
          .setDescription("Reason for the ban")
          .setRequired(false)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("unban")
      .setDescription("Unban a user from language immersion")
      .addUserOption((option) =>
        option
          .setName("user")
          .setDescription("The user to unban")
          .setRequired(true)
      )
      .addStringOption((option) =>
        option
          .setName("reason")
          .setDescription("Reason for the unban")
          .setRequired(false)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("timeout")
      .setDescription("Temporarily restrict a user from using immersion")
      .addUserOption((option) =>
        option
          .setName("user")
          .setDescription("The user to timeout")
          .setRequired(true)
      )
      .addStringOption((option) =>
        option
          .setName("duration")
          .setDescription("Timeout duration (e.g., 1d, 12h, 30m)")
          .setRequired(true)
      )
      .addStringOption((option) =>
        option
          .setName("reason")
          .setDescription("Reason for the timeout")
          .setRequired(false)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("warn")
      .setDescription("Warn a user for immersion-related behavior")
      .addUserOption((option) =>
        option
          .setName("user")
          .setDescription("The user to warn")
          .setRequired(true)
      )
      .addStringOption((option) =>
        option
          .setName("reason")
          .setDescription("Reason for the warning")
          .setRequired(true)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("warnings")
      .setDescription("View warnings for a user")
      .addUserOption((option) =>
        option
          .setName("user")
          .setDescription("The user to check")
          .setRequired(true)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("clearwarnings")
      .setDescription("Clear all warnings for a user")
      .addUserOption((option) =>
        option
          .setName("user")
          .setDescription("The user to clear warnings for")
          .setRequired(true)
      )
      .addStringOption((option) =>
        option
          .setName("reason")
          .setDescription("Reason for clearing warnings")
          .setRequired(false)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("history")
      .setDescription("View moderation history for a user")
      .addUserOption((option) =>
        option
          .setName("user")
          .setDescription("The user to check")
          .setRequired(true)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("status")
      .setDescription("Check if a user is banned from immersion")
      .addUserOption((option) =>
        option
          .setName("user")
          .setDescription("The user to check")
          .setRequired(true)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("bans")
      .setDescription("List all active immersion bans in this server")
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("logs")
      .setDescription("View recent moderation logs for this server")
      .addIntegerOption((option) =>
        option
          .setName("page")
          .setDescription("Page number")
          .setRequired(false)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("setlogchannel")
      .setDescription("Set the channel for moderation logs")
      .addChannelOption((option) =>
        option
          .setName("channel")
          .setDescription("The channel to send moderation logs to (leave empty to disable)")
          .setRequired(false)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("logchannel")
      .setDescription("View the current moderation log channel")
  );

async function execute(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) {
    return interaction.reply({
      content: "This command can only be used in a server.",
      ephemeral: true,
    });
  }

  const subcommand = interaction.options.getSubcommand();
  const member = interaction.member as GuildMember;

  // Check custom permissions
  const commandGroup = SUBCOMMAND_TO_GROUP[subcommand] || 'mod' as CommandGroup;
  const permResult = await permissionService.checkPermission(member, commandGroup);

  if (!permResult.allowed) {
    return interaction.reply({
      content: "You do not have permission to use this command.",
      ephemeral: true,
    });
  }

  switch (subcommand) {
    case "ban":
      return handleBan(interaction);
    case "unban":
      return handleUnban(interaction);
    case "timeout":
      return handleTimeout(interaction);
    case "warn":
      return handleWarn(interaction);
    case "warnings":
      return handleWarnings(interaction);
    case "clearwarnings":
      return handleClearWarnings(interaction);
    case "history":
      return handleHistory(interaction);
    case "status":
      return handleStatus(interaction);
    case "bans":
      return handleBansList(interaction);
    case "logs":
      return handleLogs(interaction);
    case "setlogchannel":
      return handleSetLogChannel(interaction);
    case "logchannel":
      return handleLogChannel(interaction);
    default:
      return interaction.reply({
        content: "Unknown subcommand.",
        ephemeral: true,
      });
  }
}

async function handleBan(interaction: ChatInputCommandInteraction) {
  const target = interaction.options.getUser("user", true);
  const durationStr = interaction.options.getString("duration");
  const reason = interaction.options.getString("reason");

  // Parse duration
  let duration: number | null = null;
  if (durationStr) {
    duration = moderationService.parseDuration(durationStr);
    if (duration === null) {
      return interaction.reply({
        content: "Invalid duration format. Use formats like: `30m`, `12h`, `7d`, `2w`",
        ephemeral: true,
      });
    }
  }

  await interaction.deferReply();

  const result = await moderationService.banUser(
    interaction.guild!.id,
    target.id,
    interaction.user.id,
    reason || undefined,
    duration
  );

  if (!result.success) {
    return interaction.editReply({
      content: `Failed to ban user: ${result.error}`,
    });
  }

  const embed = new EmbedBuilder()
    .setColor(COLORS.BAN)
    .setTitle("User Banned from Immersion")
    .setThumbnail(target.displayAvatarURL())
    .addFields(
      { name: "User", value: `${target.tag} (${target.id})`, inline: true },
      { name: "Moderator", value: interaction.user.tag, inline: true },
      {
        name: "Duration",
        value: duration
          ? moderationService.formatDuration(duration)
          : "Permanent",
        inline: true,
      }
    )
    .setTimestamp();

  if (reason) {
    embed.addFields({ name: "Reason", value: reason });
  }

  if (result.ban?.expiresAt) {
    embed.addFields({
      name: "Expires",
      value: `<t:${Math.floor(result.ban.expiresAt.getTime() / 1000)}:R>`,
    });
  }

  // Try to DM the user
  try {
    const dmEmbed = new EmbedBuilder()
      .setColor(COLORS.BAN)
      .setTitle("You have been banned from Language Immersion")
      .setDescription(
        `You have been banned from using the language immersion system in **${interaction.guild!.name}**.`
      )
      .addFields(
        {
          name: "Duration",
          value: duration
            ? moderationService.formatDuration(duration)
            : "Permanent",
        }
      )
      .setTimestamp();

    if (reason) {
      dmEmbed.addFields({ name: "Reason", value: reason });
    }

    await target.send({ embeds: [dmEmbed] });
  } catch {
    // User has DMs disabled
  }

  return interaction.editReply({ embeds: [embed] });
}

async function handleUnban(interaction: ChatInputCommandInteraction) {
  const target = interaction.options.getUser("user", true);
  const reason = interaction.options.getString("reason");

  await interaction.deferReply();

  const result = await moderationService.unbanUser(
    interaction.guild!.id,
    target.id,
    interaction.user.id,
    reason || undefined
  );

  if (!result.success) {
    return interaction.editReply({
      content: `Failed to unban user: ${result.error}`,
    });
  }

  const embed = new EmbedBuilder()
    .setColor(COLORS.UNBAN)
    .setTitle("User Unbanned from Immersion")
    .setThumbnail(target.displayAvatarURL())
    .addFields(
      { name: "User", value: `${target.tag} (${target.id})`, inline: true },
      { name: "Moderator", value: interaction.user.tag, inline: true }
    )
    .setTimestamp();

  if (reason) {
    embed.addFields({ name: "Reason", value: reason });
  }

  // Try to DM the user
  try {
    const dmEmbed = new EmbedBuilder()
      .setColor(COLORS.UNBAN)
      .setTitle("You have been unbanned from Language Immersion")
      .setDescription(
        `Your ban from the language immersion system in **${interaction.guild!.name}** has been lifted.`
      )
      .setTimestamp();

    await target.send({ embeds: [dmEmbed] });
  } catch {
    // User has DMs disabled
  }

  return interaction.editReply({ embeds: [embed] });
}

async function handleTimeout(interaction: ChatInputCommandInteraction) {
  const target = interaction.options.getUser("user", true);
  const durationStr = interaction.options.getString("duration", true);
  const reason = interaction.options.getString("reason");

  const duration = moderationService.parseDuration(durationStr);
  if (duration === null) {
    return interaction.reply({
      content: "Invalid duration format. Use formats like: `30m`, `12h`, `7d`, `2w`",
      ephemeral: true,
    });
  }

  await interaction.deferReply();

  const result = await moderationService.timeoutUser(
    interaction.guild!.id,
    target.id,
    interaction.user.id,
    duration,
    reason || undefined
  );

  if (!result.success) {
    return interaction.editReply({
      content: `Failed to timeout user: ${result.error}`,
    });
  }

  const embed = new EmbedBuilder()
    .setColor(COLORS.WARN)
    .setTitle("User Timed Out from Immersion")
    .setThumbnail(target.displayAvatarURL())
    .addFields(
      { name: "User", value: `${target.tag} (${target.id})`, inline: true },
      { name: "Moderator", value: interaction.user.tag, inline: true },
      {
        name: "Duration",
        value: moderationService.formatDuration(duration),
        inline: true,
      },
      {
        name: "Expires",
        value: `<t:${Math.floor(result.ban!.expiresAt!.getTime() / 1000)}:R>`,
      }
    )
    .setTimestamp();

  if (reason) {
    embed.addFields({ name: "Reason", value: reason });
  }

  // Try to DM the user
  try {
    const dmEmbed = new EmbedBuilder()
      .setColor(COLORS.WARN)
      .setTitle("You have been timed out from Language Immersion")
      .setDescription(
        `You have been temporarily restricted from using the language immersion system in **${interaction.guild!.name}**.`
      )
      .addFields({
        name: "Duration",
        value: moderationService.formatDuration(duration),
      })
      .setTimestamp();

    if (reason) {
      dmEmbed.addFields({ name: "Reason", value: reason });
    }

    await target.send({ embeds: [dmEmbed] });
  } catch {
    // User has DMs disabled
  }

  return interaction.editReply({ embeds: [embed] });
}

async function handleWarn(interaction: ChatInputCommandInteraction) {
  const target = interaction.options.getUser("user", true);
  const reason = interaction.options.getString("reason", true);

  await interaction.deferReply();

  const result = await moderationService.warnUser(
    interaction.guild!.id,
    target.id,
    interaction.user.id,
    reason
  );

  if (!result.success) {
    return interaction.editReply({
      content: `Failed to warn user: ${result.error}`,
    });
  }

  const embed = new EmbedBuilder()
    .setColor(COLORS.WARN)
    .setTitle("User Warned")
    .setThumbnail(target.displayAvatarURL())
    .addFields(
      { name: "User", value: `${target.tag} (${target.id})`, inline: true },
      { name: "Moderator", value: interaction.user.tag, inline: true },
      { name: "Total Warnings", value: `${result.warningCount}`, inline: true },
      { name: "Reason", value: reason }
    )
    .setTimestamp();

  // Try to DM the user
  try {
    const dmEmbed = new EmbedBuilder()
      .setColor(COLORS.WARN)
      .setTitle("You have received a warning")
      .setDescription(
        `You have received a warning for language immersion behavior in **${interaction.guild!.name}**.`
      )
      .addFields(
        { name: "Reason", value: reason },
        {
          name: "Total Warnings",
          value: `You now have ${result.warningCount} active warning(s).`,
        }
      )
      .setTimestamp();

    await target.send({ embeds: [dmEmbed] });
  } catch {
    // User has DMs disabled
  }

  return interaction.editReply({ embeds: [embed] });
}

async function handleWarnings(interaction: ChatInputCommandInteraction) {
  const target = interaction.options.getUser("user", true);

  await interaction.deferReply();

  const warnings = await moderationService.getWarnings(
    interaction.guild!.id,
    target.id
  );

  if (warnings.length === 0) {
    return interaction.editReply({
      content: `${target.tag} has no active warnings.`,
    });
  }

  const embed = new EmbedBuilder()
    .setColor(COLORS.INFO)
    .setTitle(`Warnings for ${target.tag}`)
    .setThumbnail(target.displayAvatarURL())
    .setDescription(`**${warnings.length}** active warning(s)`)
    .setTimestamp();

  for (const [index, warning] of warnings.slice(0, 10).entries()) {
    embed.addFields({
      name: `Warning #${index + 1}`,
      value: `**Reason:** ${warning.reason}\n**By:** <@${warning.warnedBy}>\n**Date:** <t:${Math.floor(warning.createdAt.getTime() / 1000)}:R>`,
    });
  }

  if (warnings.length > 10) {
    embed.setFooter({ text: `Showing 10 of ${warnings.length} warnings` });
  }

  return interaction.editReply({ embeds: [embed] });
}

async function handleClearWarnings(interaction: ChatInputCommandInteraction) {
  const target = interaction.options.getUser("user", true);
  const reason = interaction.options.getString("reason");

  await interaction.deferReply();

  const result = await moderationService.clearWarnings(
    interaction.guild!.id,
    target.id,
    interaction.user.id,
    reason || undefined
  );

  if (result.cleared === 0) {
    return interaction.editReply({
      content: `${target.tag} had no active warnings to clear.`,
    });
  }

  const embed = new EmbedBuilder()
    .setColor(COLORS.UNBAN)
    .setTitle("Warnings Cleared")
    .setThumbnail(target.displayAvatarURL())
    .addFields(
      { name: "User", value: `${target.tag} (${target.id})`, inline: true },
      { name: "Moderator", value: interaction.user.tag, inline: true },
      { name: "Warnings Cleared", value: `${result.cleared}`, inline: true }
    )
    .setTimestamp();

  if (reason) {
    embed.addFields({ name: "Reason", value: reason });
  }

  return interaction.editReply({ embeds: [embed] });
}

async function handleHistory(interaction: ChatInputCommandInteraction) {
  const target = interaction.options.getUser("user", true);

  await interaction.deferReply();

  const history = await moderationService.getModerationHistory(
    interaction.guild!.id,
    target.id
  );

  const embed = new EmbedBuilder()
    .setColor(COLORS.INFO)
    .setTitle(`Moderation History for ${target.tag}`)
    .setThumbnail(target.displayAvatarURL())
    .setTimestamp();

  // Summary
  const activeBans = history.bans.filter((b) => b.active).length;
  const totalBans = history.bans.length;
  const activeWarnings = history.warnings.filter((w) => w.active).length;
  const totalWarnings = history.warnings.length;

  embed.setDescription(
    `**Active Bans:** ${activeBans}\n**Total Bans:** ${totalBans}\n**Active Warnings:** ${activeWarnings}\n**Total Warnings:** ${totalWarnings}`
  );

  // Recent actions
  if (history.logs.length > 0) {
    const recentActions = history.logs.slice(0, 5).map((log) => {
      const action = log.action.toUpperCase();
      const time = `<t:${Math.floor(log.createdAt.getTime() / 1000)}:R>`;
      return `\`${action}\` by <@${log.moderatorId}> ${time}${log.reason ? `\n└ ${log.reason}` : ""}`;
    });

    embed.addFields({
      name: "Recent Actions",
      value: recentActions.join("\n\n") || "None",
    });
  }

  return interaction.editReply({ embeds: [embed] });
}

async function handleStatus(interaction: ChatInputCommandInteraction) {
  const target = interaction.options.getUser("user", true);

  await interaction.deferReply();

  const status = await moderationService.getBanStatus(
    interaction.guild!.id,
    target.id
  );

  const warnings = await moderationService.getWarnings(
    interaction.guild!.id,
    target.id
  );

  const embed = new EmbedBuilder()
    .setColor(status.isBanned ? COLORS.BAN : COLORS.UNBAN)
    .setTitle(`Status for ${target.tag}`)
    .setThumbnail(target.displayAvatarURL())
    .addFields(
      {
        name: "Immersion Status",
        value: status.isBanned ? "Banned" : "Active",
        inline: true,
      },
      {
        name: "Active Warnings",
        value: `${warnings.length}`,
        inline: true,
      }
    )
    .setTimestamp();

  if (status.isBanned) {
    embed.addFields(
      {
        name: "Ban Type",
        value: status.isPermanent ? "Permanent" : "Temporary",
        inline: true,
      },
      {
        name: "Banned By",
        value: `<@${status.bannedBy}>`,
        inline: true,
      },
      {
        name: "Banned At",
        value: `<t:${Math.floor(status.bannedAt!.getTime() / 1000)}:F>`,
        inline: true,
      }
    );

    if (!status.isPermanent && status.expiresAt) {
      embed.addFields({
        name: "Expires",
        value: `<t:${Math.floor(status.expiresAt.getTime() / 1000)}:R>`,
        inline: true,
      });
    }

    if (status.reason) {
      embed.addFields({ name: "Reason", value: status.reason });
    }
  }

  return interaction.editReply({ embeds: [embed] });
}

async function handleBansList(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();

  const { bans, total } = await moderationService.getGuildBans(
    interaction.guild!.id
  );

  if (bans.length === 0) {
    return interaction.editReply({
      content: "There are no active immersion bans in this server.",
    });
  }

  const embed = new EmbedBuilder()
    .setColor(COLORS.INFO)
    .setTitle("Active Immersion Bans")
    .setDescription(`**${total}** active ban(s)`)
    .setTimestamp();

  for (const ban of bans.slice(0, 10)) {
    const expiry = ban.expiresAt
      ? `<t:${Math.floor(ban.expiresAt.getTime() / 1000)}:R>`
      : "Permanent";

    embed.addFields({
      name: `<@${ban.discordId}>`,
      value: `**Expires:** ${expiry}\n**By:** <@${ban.bannedBy}>${ban.reason ? `\n**Reason:** ${ban.reason}` : ""}`,
      inline: true,
    });
  }

  if (total > 10) {
    embed.setFooter({ text: `Showing 10 of ${total} bans` });
  }

  return interaction.editReply({ embeds: [embed] });
}

async function handleLogs(interaction: ChatInputCommandInteraction) {
  const page = interaction.options.getInteger("page") || 1;

  await interaction.deferReply();

  const { logs, total, totalPages } = await moderationService.getGuildModerationLogs(
    interaction.guild!.id,
    page,
    10
  );

  if (logs.length === 0) {
    return interaction.editReply({
      content: "No moderation logs found.",
    });
  }

  const embed = new EmbedBuilder()
    .setColor(COLORS.INFO)
    .setTitle("Moderation Logs")
    .setDescription(`Page ${page} of ${totalPages} (${total} total entries)`)
    .setTimestamp();

  for (const log of logs) {
    const action = log.action.toUpperCase();
    const time = `<t:${Math.floor(log.createdAt.getTime() / 1000)}:f>`;

    embed.addFields({
      name: `\`${action}\` - ${time}`,
      value: `**Target:** <@${log.targetId}>\n**Mod:** <@${log.moderatorId}>${log.reason ? `\n**Reason:** ${log.reason}` : ""}${log.duration ? `\n**Duration:** ${moderationService.formatDuration(log.duration)}` : ""}`,
    });
  }

  return interaction.editReply({ embeds: [embed] });
}

async function handleSetLogChannel(interaction: ChatInputCommandInteraction) {
  const channel = interaction.options.getChannel("channel");

  await interaction.deferReply();

  const result = await moderationService.setLogChannel(
    interaction.guild!.id,
    channel?.id || null
  );

  if (!result.success) {
    return interaction.editReply({
      content: `Failed to set log channel: ${result.error}`,
    });
  }

  if (channel) {
    const embed = new EmbedBuilder()
      .setColor(COLORS.INFO)
      .setTitle("Log Channel Set")
      .setDescription(`Moderation logs will now be sent to <#${channel.id}>`)
      .setTimestamp();

    return interaction.editReply({ embeds: [embed] });
  } else {
    const embed = new EmbedBuilder()
      .setColor(COLORS.INFO)
      .setTitle("Log Channel Disabled")
      .setDescription("Moderation logs will no longer be sent to a channel.")
      .setTimestamp();

    return interaction.editReply({ embeds: [embed] });
  }
}

async function handleLogChannel(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();

  const channelId = await moderationService.getLogChannel(interaction.guild!.id);

  const embed = new EmbedBuilder()
    .setColor(COLORS.INFO)
    .setTitle("Moderation Log Channel")
    .setTimestamp();

  if (channelId) {
    embed.setDescription(`Moderation logs are sent to <#${channelId}>`);
  } else {
    embed.setDescription("No moderation log channel is configured.\n\nUse `/mod setlogchannel` to set one.");
  }

  return interaction.editReply({ embeds: [embed] });
}

export default { data, execute };
