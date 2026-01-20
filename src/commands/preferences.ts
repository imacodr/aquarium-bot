import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
  ComponentType,
} from "discord.js";
import { prisma } from "../database/prisma";
import { LANGUAGES, LANGUAGE_CODES } from "../config/languages";
import {
  parseSubscribedLanguages,
  serializeSubscribedLanguages,
  getSubscribedLanguagesDisplay,
  parseNotificationPrefs,
  serializeNotificationPrefs,
  DisplayMode,
  isValidDisplayMode,
} from "../config/preferences";
import { channelPermissionService } from "../services/channelPermissions";

export default {
  data: new SlashCommandBuilder()
    .setName("preferences")
    .setDescription("Manage your language and notification preferences")
    .addSubcommandGroup((group) =>
      group
        .setName("languages")
        .setDescription("Manage language subscriptions")
        .addSubcommand((sub) =>
          sub.setName("view").setDescription("View your subscribed languages")
        )
        .addSubcommand((sub) =>
          sub.setName("set").setDescription("Set which languages you want to see")
        )
        .addSubcommand((sub) =>
          sub.setName("reset").setDescription("Reset to see all languages")
        )
    )
    .addSubcommandGroup((group) =>
      group
        .setName("display")
        .setDescription("Display preferences")
        .addSubcommand((sub) =>
          sub
            .setName("mode")
            .setDescription("Toggle between detailed and compact display modes")
            .addStringOption((option) =>
              option
                .setName("style")
                .setDescription("Display style for translations")
                .setRequired(true)
                .addChoices(
                  { name: "Detailed - Full translation info", value: "detailed" },
                  { name: "Compact - Minimal display", value: "compact" }
                )
            )
        )
    )
    .addSubcommandGroup((group) =>
      group
        .setName("privacy")
        .setDescription("Privacy settings")
        .addSubcommand((sub) =>
          sub
            .setName("leaderboard")
            .setDescription("Toggle your visibility on the leaderboard")
            .addBooleanOption((option) =>
              option
                .setName("visible")
                .setDescription("Show on leaderboard?")
                .setRequired(true)
            )
        )
    )
    .addSubcommandGroup((group) =>
      group
        .setName("notifications")
        .setDescription("Notification preferences")
        .addSubcommand((sub) =>
          sub
            .setName("toggle")
            .setDescription("Toggle DM notifications on/off")
            .addBooleanOption((option) =>
              option
                .setName("enabled")
                .setDescription("Enable DM notifications?")
                .setRequired(true)
            )
        )
    )
    .addSubcommand((sub) =>
      sub.setName("view").setDescription("View all your current preferences")
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild) {
      return interaction.reply({
        content: "This command can only be used in a server.",
        ephemeral: true,
      });
    }

    const subcommandGroup = interaction.options.getSubcommandGroup();
    const subcommand = interaction.options.getSubcommand();

    // Route to appropriate handler
    if (subcommandGroup === "languages") {
      switch (subcommand) {
        case "view":
          return handleLanguagesView(interaction);
        case "set":
          return handleLanguagesSet(interaction);
        case "reset":
          return handleLanguagesReset(interaction);
      }
    } else if (subcommandGroup === "display") {
      if (subcommand === "mode") {
        return handleDisplayMode(interaction);
      }
    } else if (subcommandGroup === "privacy") {
      if (subcommand === "leaderboard") {
        return handlePrivacyLeaderboard(interaction);
      }
    } else if (subcommandGroup === "notifications") {
      if (subcommand === "toggle") {
        return handleNotificationsToggle(interaction);
      }
    } else if (subcommand === "view") {
      return handleViewAll(interaction);
    }

    return interaction.reply({
      content: "Unknown command.",
      ephemeral: true,
    });
  },
};

async function handleViewAll(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: true });

  try {
    const verifiedUser = await prisma.verifiedUser.findUnique({
      where: {
        discordId_guildId: {
          discordId: interaction.user.id,
          guildId: interaction.guild!.id,
        },
      },
      include: { user: true },
    });

    if (!verifiedUser) {
      return interaction.editReply({
        content: "You need to verify your account first! Visit the dashboard to get started.",
      });
    }

    const subscribedLanguages = parseSubscribedLanguages(verifiedUser.subscribedLanguages);
    const notificationPrefs = verifiedUser.user
      ? parseNotificationPrefs(verifiedUser.user.notificationPrefs)
      : { achievements: true, streaks: true };

    const embed = new EmbedBuilder()
      .setColor(0x0ea5e9)
      .setTitle("Your Preferences")
      .setThumbnail(interaction.user.displayAvatarURL({ size: 64 }))
      .addFields(
        {
          name: "Language Subscriptions",
          value: getSubscribedLanguagesDisplay(subscribedLanguages),
          inline: false,
        },
        {
          name: "Display Mode",
          value: verifiedUser.displayMode === "detailed" ? "Detailed" : "Compact",
          inline: true,
        },
        {
          name: "Show on Leaderboard",
          value: verifiedUser.showOnLeaderboard ? "Yes" : "No",
          inline: true,
        },
        {
          name: "DM Notifications",
          value: verifiedUser.user?.dmNotificationsEnabled !== false ? "Enabled" : "Disabled",
          inline: true,
        },
        {
          name: "Native Language",
          value: verifiedUser.user?.nativeLanguage
            ? LANGUAGES[verifiedUser.user.nativeLanguage]?.name || verifiedUser.user.nativeLanguage
            : "Not set",
          inline: true,
        }
      )
      .setFooter({ text: "Use /preferences <category> to modify settings" });

    return interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error("Error fetching preferences:", error);
    return interaction.editReply({
      content: "An error occurred while fetching your preferences.",
    });
  }
}

async function handleLanguagesView(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: true });

  try {
    const verifiedUser = await prisma.verifiedUser.findUnique({
      where: {
        discordId_guildId: {
          discordId: interaction.user.id,
          guildId: interaction.guild!.id,
        },
      },
    });

    if (!verifiedUser) {
      return interaction.editReply({
        content: "You need to verify your account first! Visit the dashboard to get started.",
      });
    }

    const subscribedLanguages = parseSubscribedLanguages(verifiedUser.subscribedLanguages);
    const display = getSubscribedLanguagesDisplay(subscribedLanguages);

    const embed = new EmbedBuilder()
      .setColor(0x0ea5e9)
      .setTitle("Your Language Subscriptions")
      .setDescription(
        subscribedLanguages.length === 0
          ? "You are subscribed to **all languages**. You can see all language channels."
          : `You are subscribed to **${subscribedLanguages.length}** language${subscribedLanguages.length !== 1 ? "s" : ""}:`
      )
      .addFields({
        name: "Subscribed Languages",
        value: display,
      })
      .setFooter({ text: "Use /preferences languages set to change" });

    return interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error("Error fetching language preferences:", error);
    return interaction.editReply({
      content: "An error occurred while fetching your language preferences.",
    });
  }
}

async function handleLanguagesSet(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: true });

  try {
    const verifiedUser = await prisma.verifiedUser.findUnique({
      where: {
        discordId_guildId: {
          discordId: interaction.user.id,
          guildId: interaction.guild!.id,
        },
      },
    });

    if (!verifiedUser) {
      return interaction.editReply({
        content: "You need to verify your account first! Visit the dashboard to get started.",
      });
    }

    const currentSubscriptions = parseSubscribedLanguages(verifiedUser.subscribedLanguages);

    // Create select menu with all languages
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId("pref_languages_select")
      .setPlaceholder("Select languages to subscribe to")
      .setMinValues(1)
      .setMaxValues(LANGUAGE_CODES.length)
      .addOptions(
        Object.values(LANGUAGES).map((lang) => ({
          label: lang.name,
          value: lang.code,
          emoji: lang.emoji,
          default:
            currentSubscriptions.length === 0 || currentSubscriptions.includes(lang.code),
        }))
      );

    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

    const response = await interaction.editReply({
      content:
        "Select which languages you want to subscribe to. You will only see channels for your subscribed languages.\n\n*Select all to see all language channels.*",
      components: [row],
    });

    // Wait for selection
    try {
      const selectInteraction = await response.awaitMessageComponent({
        componentType: ComponentType.StringSelect,
        filter: (i) => i.user.id === interaction.user.id,
        time: 60000,
      }) as StringSelectMenuInteraction;

      const selectedLanguages = selectInteraction.values;

      // If all languages selected, store as empty array (means all)
      const languagesToStore =
        selectedLanguages.length === LANGUAGE_CODES.length ? [] : selectedLanguages;

      // Update database
      await prisma.verifiedUser.update({
        where: {
          discordId_guildId: {
            discordId: interaction.user.id,
            guildId: interaction.guild!.id,
          },
        },
        data: {
          subscribedLanguages: serializeSubscribedLanguages(languagesToStore),
        },
      });

      // Update channel permissions
      const guildConfig = await prisma.guildConfig.findUnique({
        where: { guildId: interaction.guild!.id },
      });

      if (guildConfig) {
        const result = await channelPermissionService.updateUserChannelAccess(
          interaction.guild!,
          interaction.user.id,
          languagesToStore,
          guildConfig
        );

        const display = getSubscribedLanguagesDisplay(languagesToStore);

        let statusMessage = `Your language subscriptions have been updated to: **${display}**`;

        if (result.errors.length > 0) {
          statusMessage += `\n\n*Note: There were some issues updating channel permissions. You may need to ask an admin to check bot permissions.*`;
        }

        await selectInteraction.update({
          content: statusMessage,
          components: [],
        });
      } else {
        await selectInteraction.update({
          content: "Your preferences have been saved, but language channels aren't set up in this server yet.",
          components: [],
        });
      }
    } catch (error) {
      // Timeout or error
      await interaction.editReply({
        content: "Selection timed out. Please try again.",
        components: [],
      });
    }
  } catch (error) {
    console.error("Error setting language preferences:", error);
    return interaction.editReply({
      content: "An error occurred while updating your language preferences.",
    });
  }
}

async function handleLanguagesReset(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: true });

  try {
    const verifiedUser = await prisma.verifiedUser.findUnique({
      where: {
        discordId_guildId: {
          discordId: interaction.user.id,
          guildId: interaction.guild!.id,
        },
      },
    });

    if (!verifiedUser) {
      return interaction.editReply({
        content: "You need to verify your account first! Visit the dashboard to get started.",
      });
    }

    // Reset to all languages (empty array)
    await prisma.verifiedUser.update({
      where: {
        discordId_guildId: {
          discordId: interaction.user.id,
          guildId: interaction.guild!.id,
        },
      },
      data: {
        subscribedLanguages: "[]",
      },
    });

    // Reset channel permissions
    const guildConfig = await prisma.guildConfig.findUnique({
      where: { guildId: interaction.guild!.id },
    });

    if (guildConfig) {
      await channelPermissionService.resetUserChannelAccess(
        interaction.guild!,
        interaction.user.id,
        guildConfig
      );
    }

    return interaction.editReply({
      content: "Your language subscriptions have been reset. You can now see all language channels.",
    });
  } catch (error) {
    console.error("Error resetting language preferences:", error);
    return interaction.editReply({
      content: "An error occurred while resetting your language preferences.",
    });
  }
}

async function handleDisplayMode(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: true });

  try {
    const verifiedUser = await prisma.verifiedUser.findUnique({
      where: {
        discordId_guildId: {
          discordId: interaction.user.id,
          guildId: interaction.guild!.id,
        },
      },
    });

    if (!verifiedUser) {
      return interaction.editReply({
        content: "You need to verify your account first! Visit the dashboard to get started.",
      });
    }

    const newMode = interaction.options.getString("style", true) as DisplayMode;

    if (!isValidDisplayMode(newMode)) {
      return interaction.editReply({
        content: "Invalid display mode.",
      });
    }

    await prisma.verifiedUser.update({
      where: {
        discordId_guildId: {
          discordId: interaction.user.id,
          guildId: interaction.guild!.id,
        },
      },
      data: {
        displayMode: newMode,
      },
    });

    return interaction.editReply({
      content: `Display mode updated to **${newMode}**. ${
        newMode === "detailed"
          ? "You'll see full translation information."
          : "You'll see a minimal, compact display."
      }`,
    });
  } catch (error) {
    console.error("Error updating display mode:", error);
    return interaction.editReply({
      content: "An error occurred while updating your display mode.",
    });
  }
}

async function handlePrivacyLeaderboard(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: true });

  try {
    const verifiedUser = await prisma.verifiedUser.findUnique({
      where: {
        discordId_guildId: {
          discordId: interaction.user.id,
          guildId: interaction.guild!.id,
        },
      },
    });

    if (!verifiedUser) {
      return interaction.editReply({
        content: "You need to verify your account first! Visit the dashboard to get started.",
      });
    }

    const visible = interaction.options.getBoolean("visible", true);

    await prisma.verifiedUser.update({
      where: {
        discordId_guildId: {
          discordId: interaction.user.id,
          guildId: interaction.guild!.id,
        },
      },
      data: {
        showOnLeaderboard: visible,
      },
    });

    return interaction.editReply({
      content: visible
        ? "You are now **visible** on the leaderboard."
        : "You are now **hidden** from the leaderboard. Your stats are still tracked but won't appear publicly.",
    });
  } catch (error) {
    console.error("Error updating leaderboard visibility:", error);
    return interaction.editReply({
      content: "An error occurred while updating your privacy settings.",
    });
  }
}

async function handleNotificationsToggle(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: true });

  try {
    // First get or create the global User
    const verifiedUser = await prisma.verifiedUser.findUnique({
      where: {
        discordId_guildId: {
          discordId: interaction.user.id,
          guildId: interaction.guild!.id,
        },
      },
      include: { user: true },
    });

    if (!verifiedUser) {
      return interaction.editReply({
        content: "You need to verify your account first! Visit the dashboard to get started.",
      });
    }

    const enabled = interaction.options.getBoolean("enabled", true);

    // Ensure global User exists and update it
    await prisma.user.upsert({
      where: { discordId: interaction.user.id },
      create: {
        discordId: interaction.user.id,
        username: interaction.user.username,
        avatar: interaction.user.avatar,
        dmNotificationsEnabled: enabled,
      },
      update: {
        dmNotificationsEnabled: enabled,
      },
    });

    // Link VerifiedUser to User if not already linked
    if (!verifiedUser.userId) {
      const user = await prisma.user.findUnique({
        where: { discordId: interaction.user.id },
      });
      if (user) {
        await prisma.verifiedUser.update({
          where: { id: verifiedUser.id },
          data: { userId: user.id },
        });
      }
    }

    return interaction.editReply({
      content: enabled
        ? "DM notifications are now **enabled**. You'll receive notifications for achievements, streaks, and more."
        : "DM notifications are now **disabled**. You won't receive any DM notifications from this bot.",
    });
  } catch (error) {
    console.error("Error updating notification preferences:", error);
    return interaction.editReply({
      content: "An error occurred while updating your notification settings.",
    });
  }
}
