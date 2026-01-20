import { Message, TextChannel, EmbedBuilder } from "discord.js";
import { prisma } from "../database/prisma";
import { translationService } from "../services/translation";
import { webhookService } from "../services/webhook";
import { moderationService } from "../services/moderation";
import { LANGUAGES } from "../config/languages";
import { USAGE_WARNING_THRESHOLD, BASE_URL, DASHBOARD_URL } from "../config/constants";
import { getTierLimits, getEffectiveUserLimit } from "../config/subscriptions";
import { checkNewAchievements, Achievement } from "../config/achievements";
import { User, Prisma } from "@prisma/client";

interface ChannelLanguageMap {
  [channelId: string]: string;
}

export async function handleMessageCreate(message: Message): Promise<void> {
  // Ignore bots and webhooks
  if (message.author.bot || message.webhookId) return;

  // Ignore DMs
  if (!message.guild) return;

  // Ignore empty messages
  if (!message.content.trim()) return;

  try {
    // Get guild config
    const config = await prisma.guildConfig.findUnique({
      where: { guildId: message.guild.id },
    });

    // If no config or no category set up, ignore
    if (!config?.categoryId) return;

    // Parse enabled languages (empty array means all enabled)
    const enabledLanguages: string[] = JSON.parse(config.enabledLanguages || "[]");

    // Build channel to language map (only for enabled languages)
    const channelLanguageMap: ChannelLanguageMap = {};
    const addChannel = (channelId: string | null, langCode: string) => {
      if (channelId && (enabledLanguages.length === 0 || enabledLanguages.includes(langCode))) {
        channelLanguageMap[channelId] = langCode;
      }
    };

    addChannel(config.englishChannelId, "EN");
    addChannel(config.spanishChannelId, "ES");
    addChannel(config.portugueseChannelId, "PT-BR");
    addChannel(config.frenchChannelId, "FR");
    addChannel(config.germanChannelId, "DE");
    addChannel(config.italianChannelId, "IT");
    addChannel(config.japaneseChannelId, "JA");
    addChannel(config.koreanChannelId, "KO");
    addChannel(config.chineseChannelId, "ZH");

    // Check if message is in an immersion channel
    const sourceLang = channelLanguageMap[message.channel.id];
    if (!sourceLang) return;

    // Check if user is verified
    const verifiedUser = await prisma.verifiedUser.findUnique({
      where: {
        discordId_guildId: {
          discordId: message.author.id,
          guildId: message.guild.id,
        },
      },
    });

    if (!verifiedUser) {
      // Delete message and try to DM user
      await message.delete().catch(() => {});

      const verificationEmbed = new EmbedBuilder()
        .setColor(0xf59e0b)
        .setTitle("Verification Required")
        .setDescription(
          `You need to verify your account before using the language immersion channels.\n\n` +
          `**[Click here to verify](${BASE_URL}/auth/discord)**`
        )
        .setFooter({ text: message.guild.name, iconURL: message.guild.iconURL() || undefined });

      try {
        await message.author.send({ embeds: [verificationEmbed] });
      } catch {
        // DMs disabled - send ephemeral-like message in channel that auto-deletes
        const channel = message.channel as TextChannel;
        const reply = await channel.send({
          content: `<@${message.author.id}>`,
          embeds: [verificationEmbed],
        });
        // Delete after 15 seconds
        setTimeout(() => reply.delete().catch(() => {}), 15000);
      }
      return;
    }

    // Check if user has disabled their immersion access
    if (!verifiedUser.immersionEnabled) {
      // Delete message silently - user has opted out
      await message.delete().catch(() => {});

      const disabledEmbed = new EmbedBuilder()
        .setColor(0x6b7280)
        .setTitle("Immersion Disabled")
        .setDescription(
          `You have disabled your language immersion access in **${message.guild.name}**.\n\n` +
          `To re-enable, visit the [dashboard](${DASHBOARD_URL}) and toggle your immersion settings.`
        )
        .setFooter({ text: message.guild.name, iconURL: message.guild.iconURL() || undefined });

      try {
        await message.author.send({ embeds: [disabledEmbed] });
      } catch {
        // Silently ignore if DMs are disabled
      }
      return;
    }

    // Check if user is banned from immersion
    const banStatus = await moderationService.getBanStatus(
      message.guild.id,
      message.author.id
    );

    if (banStatus.isBanned) {
      // Delete the message silently
      await message.delete().catch(() => {});

      // Build ban notification embed
      const banEmbed = new EmbedBuilder()
        .setColor(0xef4444)
        .setTitle("Immersion Access Restricted")
        .setDescription(
          `You are currently banned from using language immersion in **${message.guild.name}**.`
        );

      if (banStatus.reason) {
        banEmbed.addFields({ name: "Reason", value: banStatus.reason });
      }

      if (banStatus.expiresAt) {
        banEmbed.addFields({
          name: "Ban Expires",
          value: `<t:${Math.floor(banStatus.expiresAt.getTime() / 1000)}:R>`,
        });
      } else {
        banEmbed.addFields({ name: "Duration", value: "Permanent" });
      }

      banEmbed.setFooter({
        text: "Contact a moderator if you believe this is a mistake.",
      });

      // Try to DM the user (only once per session to avoid spam)
      try {
        await message.author.send({ embeds: [banEmbed] });
      } catch {
        // DMs disabled - silently delete the message
      }
      return;
    }

    // Fetch or create global user record for personal subscription tracking
    let globalUser: User | null = await prisma.user.findUnique({
      where: { discordId: message.author.id },
    });

    if (!globalUser) {
      globalUser = await prisma.user.create({
        data: {
          discordId: message.author.id,
          username: message.author.username,
          avatar: message.author.avatar,
        },
      });
    } else {
      // Update username/avatar if changed
      if (globalUser.username !== message.author.username || globalUser.avatar !== message.author.avatar) {
        globalUser = await prisma.user.update({
          where: { id: globalUser.id },
          data: {
            username: message.author.username,
            avatar: message.author.avatar,
          },
        });
      }
    }

    // Link verifiedUser to global user if not already linked
    if (!verifiedUser.userId && globalUser) {
      await prisma.verifiedUser.update({
        where: { id: verifiedUser.id },
        data: { userId: globalUser.id },
      });
    }

    // Check rate limits
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Reset usage if new month
    if (verifiedUser.usageResetDate < startOfMonth) {
      await prisma.verifiedUser.update({
        where: { id: verifiedUser.id },
        data: {
          monthlyCharacterUsage: 0,
          usageResetDate: startOfMonth,
        },
      });
      verifiedUser.monthlyCharacterUsage = 0;
    }

    if (config.usageResetDate < startOfMonth) {
      await prisma.guildConfig.update({
        where: { id: config.id },
        data: {
          monthlyCharacterUsage: 0,
          usageResetDate: startOfMonth,
        },
      });
      config.monthlyCharacterUsage = 0;
    }

    // Get tier-based limits
    // User gets the HIGHEST of either their personal tier or the guild's tier
    const guildLimits = getTierLimits(config.subscriptionTier);
    const userTier = globalUser?.subscriptionTier || "free";
    const effectiveUserLimit = getEffectiveUserLimit(userTier, config.subscriptionTier);

    // Calculate character cost (message length * number of target languages)
    // If enabledLanguages is set, only count those; otherwise count all minus source
    const numTargetLanguages = enabledLanguages.length > 0
      ? enabledLanguages.filter(lang => lang !== sourceLang).length
      : Object.keys(LANGUAGES).length - 1;
    const characterCost = message.content.length * numTargetLanguages;

    // Check user limit (using effective limit that considers both tiers)
    if (verifiedUser.monthlyCharacterUsage + characterCost > effectiveUserLimit) {
      await message.delete().catch(() => {});

      const limitEmbed = new EmbedBuilder()
        .setColor(0xef4444)
        .setTitle("Translation Limit Reached")
        .setDescription(
          `You've reached your monthly limit of **${effectiveUserLimit.toLocaleString()}** characters.\n\n` +
          `Your limit resets at the start of next month.\n\n` +
          `[Upgrade for higher limits](${DASHBOARD_URL}/subscribe)`
        );

      try {
        await message.author.send({ embeds: [limitEmbed] });
      } catch {
        const channel = message.channel as TextChannel;
        const reply = await channel.send({
          content: `<@${message.author.id}>`,
          embeds: [limitEmbed],
        });
        setTimeout(() => reply.delete().catch(() => {}), 15000);
      }
      return;
    }

    // Check guild limit (guild limits are independent of user's personal subscription)
    if (config.monthlyCharacterUsage + characterCost > guildLimits.perGuild) {
      await message.delete().catch(() => {});

      const limitEmbed = new EmbedBuilder()
        .setColor(0xef4444)
        .setTitle("Server Limit Reached")
        .setDescription(
          `**${message.guild.name}** has reached its monthly translation limit.\n\n` +
          `Ask a server admin to upgrade the plan.\n\n` +
          `[View plans](${DASHBOARD_URL}/subscribe)`
        );

      try {
        await message.author.send({ embeds: [limitEmbed] });
      } catch {
        const channel = message.channel as TextChannel;
        const reply = await channel.send({
          content: `<@${message.author.id}>`,
          embeds: [limitEmbed],
        });
        setTimeout(() => reply.delete().catch(() => {}), 15000);
      }
      return;
    }

    // Translate to all other enabled languages
    const result = await translationService.translateToAllLanguages(
      message.content,
      sourceLang,
      enabledLanguages.length > 0 ? enabledLanguages : undefined
    );

    // Send translations via webhooks
    const sourceLanguage = LANGUAGES[sourceLang];
    for (const [langCode, translatedText] of result.translations) {
      const targetLang = LANGUAGES[langCode];
      const webhookInfo = await webhookService.getWebhookInfoForLanguage(
        message.guild.id,
        langCode
      );

      if (webhookInfo) {
        await webhookService.sendTranslatedMessage(
          webhookInfo.id,
          webhookInfo.token,
          message,
          translatedText,
          targetLang,
          sourceLanguage
        );
      }
    }

    // Update usage counters and streak
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let newStreak = verifiedUser.currentStreak;
    let longestStreak = verifiedUser.longestStreak;

    if (verifiedUser.lastActiveDate) {
      const lastActive = new Date(verifiedUser.lastActiveDate);
      lastActive.setHours(0, 0, 0, 0);

      const daysDiff = Math.floor(
        (today.getTime() - lastActive.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (daysDiff === 0) {
        // Same day, streak unchanged
      } else if (daysDiff === 1) {
        // Consecutive day, increment streak
        newStreak += 1;
        if (newStreak > longestStreak) {
          longestStreak = newStreak;
        }
      } else {
        // Streak broken, reset to 1
        newStreak = 1;
      }
    } else {
      // First translation ever
      newStreak = 1;
      longestStreak = 1;
    }

    const newTotalTranslations = verifiedUser.totalTranslations + 1;
    const currentAchievements: string[] = JSON.parse(verifiedUser.achievements || "[]");

    // Build transaction operations
    const transactionOperations: Prisma.PrismaPromise<any>[] = [
      prisma.verifiedUser.update({
        where: { id: verifiedUser.id },
        data: {
          monthlyCharacterUsage: { increment: characterCost },
          currentStreak: newStreak,
          longestStreak: longestStreak,
          lastActiveDate: today,
          totalTranslations: { increment: 1 },
        },
      }),
      prisma.guildConfig.update({
        where: { id: config.id },
        data: {
          monthlyCharacterUsage: { increment: characterCost },
        },
      }),
      prisma.usageLog.create({
        data: {
          guildId: message.guild.id,
          userId: message.author.id,
          sourceLanguage: sourceLang,
          targetLanguage: Array.from(result.translations.keys()).join(","),
          characterCount: characterCost,
        },
      }),
    ];

    // Update global user stats if we have a global user record
    if (globalUser) {
      transactionOperations.push(
        prisma.user.update({
          where: { id: globalUser.id },
          data: {
            totalTranslationsAllTime: { increment: 1 },
            totalCharactersAllTime: { increment: characterCost },
          },
        })
      );
    }

    await prisma.$transaction(transactionOperations);

    // Check for new achievements
    const newTotalChars = verifiedUser.monthlyCharacterUsage + characterCost;
    const earnedAchievements = checkNewAchievements(currentAchievements, {
      translations: newTotalTranslations,
      streak: newStreak,
      characters: newTotalChars,
    });

    if (earnedAchievements.length > 0) {
      // Update achievements in database
      const updatedAchievements = [...currentAchievements, ...earnedAchievements.map((a) => a.id)];
      await prisma.verifiedUser.update({
        where: { id: verifiedUser.id },
        data: { achievements: JSON.stringify(updatedAchievements) },
      });

      // Notify user of new achievements
      await notifyNewAchievements(message, earnedAchievements);
    }

    // Warn if approaching limits
    const newUserUsage = verifiedUser.monthlyCharacterUsage + characterCost;
    const userUsagePercent = newUserUsage / effectiveUserLimit;

    if (userUsagePercent >= USAGE_WARNING_THRESHOLD && userUsagePercent < 1) {
      const remaining = effectiveUserLimit - newUserUsage;
      const warningEmbed = new EmbedBuilder()
        .setColor(0xf59e0b)
        .setTitle("Approaching Limit")
        .setDescription(
          `You have **${remaining.toLocaleString()}** characters remaining this month.\n\n` +
          `Usage: ${Math.round(userUsagePercent * 100)}%`
        );

      await message.author.send({ embeds: [warningEmbed] }).catch(() => {});
    }
  } catch (error) {
    console.error("Error handling message:", error);
  }
}

async function notifyNewAchievements(
  message: Message,
  achievements: Achievement[]
): Promise<void> {
  const embed = new EmbedBuilder()
    .setColor(0xfbbf24)
    .setTitle("🎉 Achievement Unlocked!")
    .setDescription(
      achievements
        .map((a) => `${a.emoji} **${a.name}**\n${a.description}`)
        .join("\n\n")
    )
    .setFooter({ text: "Use /streak to see all your achievements!" });

  try {
    await message.author.send({ embeds: [embed] });
  } catch {
    // DMs disabled - react to their message instead
    await message.react("🏆").catch(() => {});
  }
}
