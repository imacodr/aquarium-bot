export type CommandGroup =
  | 'mod'
  | 'mod.ban'
  | 'mod.warn'
  | 'mod.timeout'
  | 'mod.logs'
  | 'mod.settings'
  | 'immersion'
  | 'immersion.setup'
  | 'immersion.status';

export const COMMAND_GROUPS: CommandGroup[] = [
  'mod',
  'mod.ban',
  'mod.warn',
  'mod.timeout',
  'mod.logs',
  'mod.settings',
  'immersion',
  'immersion.setup',
  'immersion.status',
];

export const COMMAND_HIERARCHY: Record<string, CommandGroup[]> = {
  'mod': ['mod.ban', 'mod.warn', 'mod.timeout', 'mod.logs', 'mod.settings'],
  'immersion': ['immersion.setup', 'immersion.status'],
};

export const SUBCOMMAND_TO_GROUP: Record<string, CommandGroup> = {
  // mod.ban
  'ban': 'mod.ban',
  'unban': 'mod.ban',
  // mod.timeout
  'timeout': 'mod.timeout',
  // mod.warn
  'warn': 'mod.warn',
  'warnings': 'mod.warn',
  'clearwarnings': 'mod.warn',
  // mod.logs
  'history': 'mod.logs',
  'status': 'mod.logs',
  'bans': 'mod.logs',
  'logs': 'mod.logs',
  'logchannel': 'mod.logs',
  // mod.settings
  'setlogchannel': 'mod.settings',
  // immersion.setup
  'setup': 'immersion.setup',
  'reset': 'immersion.setup',
};

export const COMMAND_GROUP_INFO: Record<CommandGroup, {
  name: string;
  description: string;
  discordPermission: string;
}> = {
  'mod': {
    name: 'Moderation (All)',
    description: 'All moderation commands',
    discordPermission: 'ModerateMembers',
  },
  'mod.ban': {
    name: 'Ban Commands',
    description: 'ban, unban',
    discordPermission: 'ModerateMembers',
  },
  'mod.warn': {
    name: 'Warning Commands',
    description: 'warn, warnings, clearwarnings',
    discordPermission: 'ModerateMembers',
  },
  'mod.timeout': {
    name: 'Timeout Commands',
    description: 'timeout',
    discordPermission: 'ModerateMembers',
  },
  'mod.logs': {
    name: 'Log Commands',
    description: 'history, status, bans, logs, logchannel',
    discordPermission: 'ManageMessages',
  },
  'mod.settings': {
    name: 'Mod Settings',
    description: 'setlogchannel',
    discordPermission: 'Administrator',
  },
  'immersion': {
    name: 'Immersion (All)',
    description: 'All immersion commands',
    discordPermission: 'Administrator',
  },
  'immersion.setup': {
    name: 'Immersion Setup',
    description: 'setup, reset',
    discordPermission: 'Administrator',
  },
  'immersion.status': {
    name: 'Immersion Status',
    description: 'status',
    discordPermission: 'ManageGuild',
  },
};

export type PermissionType = 'allow' | 'deny';

export interface PermissionCheckResult {
  allowed: boolean;
  reason: string;
  source: 'admin' | 'owner' | 'user_permission' | 'role_permission' | 'discord_native' | 'denied';
}
