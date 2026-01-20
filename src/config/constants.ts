// Rate limits (characters per month) - Default/Free tier
// For tier-specific limits, use src/config/subscriptions.ts
export const RATE_LIMITS = {
  PER_USER: 5000,
  PER_GUILD: 25000,
  GLOBAL: 500000, // DeepL free tier limit
};

// Warning threshold (percentage)
export const USAGE_WARNING_THRESHOLD = 0.8; // Warn at 80% usage

// URLs
export const BASE_URL = process.env.BASE_URL || "http://localhost:4001";
export const DASHBOARD_URL = process.env.DASHBOARD_URL || "http://localhost:3000";

// OAuth2
export const DISCORD_OAUTH_SCOPES = ["identify", "guilds"];

// Session
export const SESSION_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days

// Category and channel settings
export const IMMERSION_CATEGORY_NAME = "Language Immersion";

// Message formatting
export const TRANSLATION_PREFIX = "Translated";
export const TRANSLATION_PREFIXES: Record<string, string> = {
  EN: "Translated",
  ES: "Traducido",
  "PT-BR": "Traduzido",
  FR: "Traduit",
  DE: "Übersetzt",
  IT: "Tradotto",
  JA: "翻訳",
  KO: "번역됨",
  ZH: "已翻译",
};
