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

interface CachedWebhookClient {
  client: WebhookClient;
  lastUsed: number;
}

// Cache configuration
const WEBHOOK_CACHE_MAX_SIZE = 100;
const WEBHOOK_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

class WebhookService {
  private webhookClients: Map<string, CachedWebhookClient> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Start periodic cleanup
    this.cleanupInterval = setInterval(() => this.cleanupExpiredClients(), 5 * 60 * 1000);
  }

  private getWebhookClient(webhookId: string, webhookToken: string): WebhookClient {
    const key = `${webhookId}:${webhookToken}`;
    const cached = this.webhookClients.get(key);

    if (cached) {
      cached.lastUsed = Date.now();
      return cached.client;
    }

    // Enforce cache size limit
    if (this.webhookClients.size >= WEBHOOK_CACHE_MAX_SIZE) {
      this.evictOldestClient();
    }

    const client = new WebhookClient({ id: webhookId, token: webhookToken });
    this.webhookClients.set(key, { client, lastUsed: Date.now() });

    return client;
  }

  private evictOldestClient(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, cached] of this.webhookClients.entries()) {
      if (cached.lastUsed < oldestTime) {
        oldestTime = cached.lastUsed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      const cached = this.webhookClients.get(oldestKey);
      if (cached) {
        cached.client.destroy();
        this.webhookClients.delete(oldestKey);
      }
    }
  }

  private cleanupExpiredClients(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    for (const [key, cached] of this.webhookClients.entries()) {
      if (now - cached.lastUsed > WEBHOOK_CACHE_TTL_MS) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      const cached = this.webhookClients.get(key);
      if (cached) {
        cached.client.destroy();
        this.webhookClients.delete(key);
      }
    }

    if (keysToDelete.length > 0) {
      console.log(`Cleaned up ${keysToDelete.length} expired webhook clients`);
    }
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
        const cached = this.webhookClients.get(key);
        if (cached) {
          cached.client.destroy();
          this.webhookClients.delete(key);
        }
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
    for (const cached of this.webhookClients.values()) {
      cached.client.destroy();
    }
    this.webhookClients.clear();
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.clearCache();
  }
}

export const webhookService = new WebhookService();
export default webhookService;
