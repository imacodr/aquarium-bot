import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
} from "discord.js";
import { prisma } from "../database/prisma";
import { SUBSCRIPTION_TIERS, getTierName, formatPrice } from "../config/subscriptions";
import { DASHBOARD_URL } from "../config/constants";

export default {
  data: new SlashCommandBuilder()
    .setName("subscribe")
    .setDescription("View subscription plans and server status")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("plans")
        .setDescription("View available subscription plans")
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("status")
        .setDescription("View current subscription status")
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild) {
      return interaction.reply({
        content: "This command can only be used in a server.",
        ephemeral: true,
      });
    }

    const subcommand = interaction.options.getSubcommand();

    switch (subcommand) {
      case "plans":
        return handlePlans(interaction);
      case "status":
        return handleStatus(interaction);
      default:
        return interaction.reply({
          content: "Unknown subcommand",
          ephemeral: true,
        });
    }
  },
};

async function handlePlans(interaction: ChatInputCommandInteraction) {
  const embeds = Object.values(SUBSCRIPTION_TIERS).map((tier) => {
    const embed = new EmbedBuilder()
      .setColor(tier.id === "free" ? 0x6b7280 : tier.id === "pro" ? 0x0ea5e9 : 0xa855f7)
      .setTitle(`${tier.name} Plan`)
      .setDescription(tier.description)
      .addFields(
        {
          name: "Price",
          value: formatPrice(tier.price),
          inline: true,
        },
        {
          name: "User Limit",
          value: `${tier.limits.perUser.toLocaleString()} chars/month`,
          inline: true,
        },
        {
          name: "Server Limit",
          value: `${tier.limits.perGuild.toLocaleString()} chars/month`,
          inline: true,
        },
        {
          name: "Features",
          value: tier.features.map((f) => `• ${f}`).join("\n"),
          inline: false,
        }
      );

    return embed;
  });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setLabel("Manage Subscription")
      .setStyle(ButtonStyle.Link)
      .setURL(`${DASHBOARD_URL}/subscribe`)
  );

  return interaction.reply({
    embeds,
    components: [row],
    ephemeral: true,
  });
}

async function handleStatus(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) return;

  await interaction.deferReply({ ephemeral: true });

  try {
    const config = await prisma.guildConfig.findUnique({
      where: { guildId: interaction.guild.id },
    });

    if (!config) {
      return interaction.editReply({
        content: "Language immersion is not set up in this server.",
      });
    }

    const tier = SUBSCRIPTION_TIERS[config.subscriptionTier] ?? SUBSCRIPTION_TIERS.free;
    const isActive = !config.subscriptionExpiresAt || config.subscriptionExpiresAt > new Date();

    const embed = new EmbedBuilder()
      .setColor(isActive ? 0x22c55e : 0xef4444)
      .setTitle("Subscription Status")
      .addFields(
        {
          name: "Current Plan",
          value: tier.name,
          inline: true,
        },
        {
          name: "Status",
          value: config.subscriptionTier === "free"
            ? "Active (Free)"
            : isActive
              ? "Active"
              : "Expired",
          inline: true,
        },
        {
          name: "Price",
          value: formatPrice(tier.price),
          inline: true,
        }
      );

    if (config.subscriptionExpiresAt && config.subscriptionTier !== "free") {
      embed.addFields({
        name: isActive ? "Renews" : "Expired",
        value: config.subscriptionExpiresAt.toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
        }),
        inline: false,
      });
    }

    // Show current limits
    embed.addFields(
      {
        name: "User Limit",
        value: `${tier.limits.perUser.toLocaleString()} chars/month`,
        inline: true,
      },
      {
        name: "Server Limit",
        value: `${tier.limits.perGuild.toLocaleString()} chars/month`,
        inline: true,
      }
    );

    // Add manage button for admins
    const components: ActionRowBuilder<ButtonBuilder>[] = [];

    if (interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setLabel(config.subscriptionTier === "free" ? "Upgrade Plan" : "Manage Subscription")
          .setStyle(ButtonStyle.Link)
          .setURL(`${DASHBOARD_URL}/subscribe`)
      );
      components.push(row);
    }

    return interaction.editReply({
      embeds: [embed],
      components,
    });
  } catch (error) {
    console.error("Error getting subscription status:", error);
    return interaction.editReply({
      content: "An error occurred while getting subscription status.",
    });
  }
}
