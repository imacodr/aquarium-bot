import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  ChannelType,
  TextChannel,
  CategoryChannel,
} from "discord.js";
import { prisma } from "../../database/prisma";
import { LANGUAGES } from "../../config/languages";
import { IMMERSION_CATEGORY_NAME, IMMERSION_CHANNEL_SLOWMODE } from "../../config/constants";
import { webhookService } from "../../services/webhook";

export default {
  data: new SlashCommandBuilder()
    .setName("immersion")
    .setDescription("Language immersion commands")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("setup")
        .setDescription("Set up language immersion channels")
        .addChannelOption((option) =>
          option
            .setName("category")
            .setDescription("Existing category to use (optional, will create new if not provided)")
            .addChannelTypes(ChannelType.GuildCategory)
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("status").setDescription("View immersion setup status and usage")
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("reset").setDescription("Remove immersion setup and channels")
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction: ChatInputCommandInteraction) {
    const subcommand = interaction.options.data[0]?.name;

    switch (subcommand) {
      case "setup":
        return handleSetup(interaction);
      case "status":
        return handleStatus(interaction);
      case "reset":
        return handleReset(interaction);
      default:
        return interaction.reply({
          content: "Unknown subcommand",
          ephemeral: true,
        });
    }
  },
};

async function handleSetup(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) {
    return interaction.reply({
      content: "This command can only be used in a server.",
      ephemeral: true,
    });
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    // Check if already set up
    const existingConfig = await prisma.guildConfig.findUnique({
      where: { guildId: interaction.guild.id },
    });

    if (existingConfig?.categoryId) {
      return interaction.editReply({
        content:
          "Language immersion is already set up. Use `/immersion reset` first if you want to reconfigure.",
      });
    }

    // Get or create category
    let category: CategoryChannel;
    const selectedCategory = interaction.options.get("category")?.channel as CategoryChannel | undefined;

    if (selectedCategory) {
      category = selectedCategory;
    } else {
      category = await interaction.guild.channels.create({
        name: IMMERSION_CATEGORY_NAME,
        type: ChannelType.GuildCategory,
        reason: "Language immersion setup",
      });
    }

    // Create channels and webhooks
    const channelData: Record<string, { channelId: string; webhookId: string; webhookToken: string }> = {};

    for (const [code, lang] of Object.entries(LANGUAGES)) {
      const channel = await interaction.guild.channels.create({
        name: lang.channelName,
        type: ChannelType.GuildText,
        parent: category.id,
        topic: `${lang.emoji} ${lang.name} - Language immersion channel. Messages here will be translated to other language channels.`,
        rateLimitPerUser: IMMERSION_CHANNEL_SLOWMODE,
        reason: "Language immersion setup",
      });

      const webhook = await webhookService.createWebhookForChannel(channel as TextChannel);

      channelData[code] = {
        channelId: channel.id,
        webhookId: webhook.id,
        webhookToken: webhook.token!,
      };
    }

    // Save to database
    const dbData = {
      guildId: interaction.guild.id,
      categoryId: category.id,
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
      where: { guildId: interaction.guild.id },
      create: dbData,
      update: dbData,
    });

    const channelMentions = Object.values(channelData)
      .map((data) => `<#${data.channelId}>`)
      .join(", ");

    return interaction.editReply({
      content: `Language immersion has been set up!\n\n**Channels created:** ${channelMentions}\n\nUsers must verify via the web dashboard before they can use these channels. Unverified users will have their messages deleted and receive a DM with verification instructions.`,
    });
  } catch (error) {
    console.error("Error setting up immersion:", error);
    return interaction.editReply({
      content: "An error occurred while setting up language immersion. Please try again.",
    });
  }
}

async function handleStatus(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) {
    return interaction.reply({
      content: "This command can only be used in a server.",
      ephemeral: true,
    });
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    const config = await prisma.guildConfig.findUnique({
      where: { guildId: interaction.guild.id },
      include: {
        verifiedUsers: true,
        _count: {
          select: { usageLogs: true },
        },
      },
    });

    if (!config) {
      return interaction.editReply({
        content: "Language immersion is not set up. Use `/immersion setup` to get started.",
      });
    }

    const channelIds = [
      { name: "English", id: config.englishChannelId },
      { name: "Spanish", id: config.spanishChannelId },
      { name: "Portuguese", id: config.portugueseChannelId },
      { name: "French", id: config.frenchChannelId },
      { name: "German", id: config.germanChannelId },
      { name: "Italian", id: config.italianChannelId },
      { name: "Japanese", id: config.japaneseChannelId },
      { name: "Korean", id: config.koreanChannelId },
      { name: "Chinese", id: config.chineseChannelId },
    ];

    const channels = channelIds
      .filter((c) => c.id)
      .map((c) => `<#${c.id}>`)
      .join(" ");

    const usagePercent = ((config.monthlyCharacterUsage / 25000) * 100).toFixed(1);

    return interaction.editReply({
      content: `**Language Immersion Status**\n\n**Channels:**\n${channels}\n\n**Verified Users:** ${config.verifiedUsers.length}\n**Total Translations:** ${config._count.usageLogs}\n**Monthly Usage:** ${config.monthlyCharacterUsage.toLocaleString()} / 25,000 characters (${usagePercent}%)`,
    });
  } catch (error) {
    console.error("Error getting status:", error);
    return interaction.editReply({
      content: "An error occurred while getting the status.",
    });
  }
}

async function handleReset(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) {
    return interaction.reply({
      content: "This command can only be used in a server.",
      ephemeral: true,
    });
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    const config = await prisma.guildConfig.findUnique({
      where: { guildId: interaction.guild.id },
    });

    if (!config) {
      return interaction.editReply({
        content: "Language immersion is not set up.",
      });
    }

    // Delete channels
    const channelIds = [
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
        const channel = await interaction.guild.channels.fetch(channelId);
        if (channel) {
          await channel.delete("Language immersion reset");
        }
      } catch (e) {
        // Channel may already be deleted
      }
    }

    // Delete category if it was created by us
    if (config.categoryId) {
      try {
        const category = await interaction.guild.channels.fetch(config.categoryId);
        if (category && category.type === ChannelType.GuildCategory) {
          // Only delete if empty
          const categoryChannel = category as CategoryChannel;
          if (categoryChannel.children.cache.size === 0) {
            await category.delete("Language immersion reset");
          }
        }
      } catch (e) {
        // Category may already be deleted
      }
    }

    // Delete database record
    await prisma.guildConfig.delete({
      where: { guildId: interaction.guild.id },
    });

    // Clear webhook cache
    webhookService.clearCache();

    return interaction.editReply({
      content: "Language immersion has been reset. All channels and data have been removed.",
    });
  } catch (error) {
    console.error("Error resetting immersion:", error);
    return interaction.editReply({
      content: "An error occurred while resetting. Please try again.",
    });
  }
}
