import {
  TextChannel,
  Webhook,
  WebhookClient,
  Message,
  EmbedBuilder,
} from "discord.js";
import { prisma } from "../database/prisma";
import { LANGUAGES, Language } from "../config/languages";
import { TRANSLATION_PREFIXES } from "../config/constants";

interface WebhookInfo {
  id: string;
  token: string;
}

class WebhookService {
  private webhookClients: Map<string, WebhookClient> = new Map();

  private getWebhookClient(webhookId: string, webhookToken: string): WebhookClient {
    const key = `${webhookId}:${webhookToken}`;
    let client = this.webhookClients.get(key);

    if (!client) {
      client = new WebhookClient({ id: webhookId, token: webhookToken });
      this.webhookClients.set(key, client);
    }

    return client;
  }

  async createWebhookForChannel(channel: TextChannel): Promise<Webhook> {
    const webhook = await channel.createWebhook({
      name: "Language Immersion",
      reason: "Created for language immersion translations",
    });
    return webhook;
  }

  async sendTranslatedMessage(
    webhookId: string,
    webhookToken: string,
    originalMessage: Message,
    translatedText: string,
    targetLang: Language,
    sourceLang: Language
  ): Promise<void> {
    try {
      const webhookClient = this.getWebhookClient(webhookId, webhookToken);
      const sourceChannel = originalMessage.channel as TextChannel;

      await webhookClient.send({
        content: translatedText,
        username: originalMessage.author.displayName || originalMessage.author.username,
        avatarURL: originalMessage.author.displayAvatarURL(),
        embeds: [
          new EmbedBuilder()
            .setColor(0x2b2d31)
            .setAuthor({
              name: `${sourceLang.emoji} Original (${sourceLang.name})`,
            })
            .setDescription(originalMessage.content)
            .setFooter({
              text: `#${sourceChannel.name}`,
              iconURL: originalMessage.guild?.iconURL() || undefined,
            })
            .setTimestamp(originalMessage.createdAt),
        ],
      });
    } catch (error: any) {
      // If webhook was deleted, remove from cache
      if (error.code === 10015) {
        // Unknown Webhook
        const key = `${webhookId}:${webhookToken}`;
        this.webhookClients.delete(key);
        throw new Error("Webhook was deleted and needs to be recreated");
      }
      throw error;
    }
  }

  async getWebhookInfoForLanguage(
    guildId: string,
    langCode: string
  ): Promise<WebhookInfo | null> {
    const config = await prisma.guildConfig.findUnique({
      where: { guildId },
    });

    if (!config) return null;

    switch (langCode) {
      case "EN":
        return config.englishWebhookId && config.englishWebhookToken
          ? { id: config.englishWebhookId, token: config.englishWebhookToken }
          : null;
      case "ES":
        return config.spanishWebhookId && config.spanishWebhookToken
          ? { id: config.spanishWebhookId, token: config.spanishWebhookToken }
          : null;
      case "PT-BR":
        return config.portugueseWebhookId && config.portugueseWebhookToken
          ? { id: config.portugueseWebhookId, token: config.portugueseWebhookToken }
          : null;
      case "FR":
        return config.frenchWebhookId && config.frenchWebhookToken
          ? { id: config.frenchWebhookId, token: config.frenchWebhookToken }
          : null;
      case "DE":
        return config.germanWebhookId && config.germanWebhookToken
          ? { id: config.germanWebhookId, token: config.germanWebhookToken }
          : null;
      case "IT":
        return config.italianWebhookId && config.italianWebhookToken
          ? { id: config.italianWebhookId, token: config.italianWebhookToken }
          : null;
      case "JA":
        return config.japaneseWebhookId && config.japaneseWebhookToken
          ? { id: config.japaneseWebhookId, token: config.japaneseWebhookToken }
          : null;
      case "KO":
        return config.koreanWebhookId && config.koreanWebhookToken
          ? { id: config.koreanWebhookId, token: config.koreanWebhookToken }
          : null;
      case "ZH":
        return config.chineseWebhookId && config.chineseWebhookToken
          ? { id: config.chineseWebhookId, token: config.chineseWebhookToken }
          : null;
      default:
        return null;
    }
  }

  clearCache(): void {
    for (const client of this.webhookClients.values()) {
      client.destroy();
    }
    this.webhookClients.clear();
  }
}

export const webhookService = new WebhookService();
export default webhookService;
