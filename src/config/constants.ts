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
export const SUPPORT_SERVER_URL = process.env.SUPPORT_SERVER_URL || "https://discord.gg/SbA5ef57QZ";

// OAuth2
export const DISCORD_OAUTH_SCOPES = ["identify", "guilds"];

// Session
export const SESSION_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days

// Category and channel settings
export const IMMERSION_CATEGORY_NAME = "Language Immersion";
export const IMMERSION_CHANNEL_SLOWMODE = 5; // Slowmode in seconds for language channels
export const IMMERSION_INSTRUCTIONS_CHANNEL_NAME = "instructions";
export const IMMERSION_INSTRUCTIONS_TEXT = `# How to Use Language Immersion

Welcome to the Language Immersion system! This feature allows you to chat with others while messages are automatically translated across different language channels.

## Getting Started

**Step 1: Verify Your Account**
Before you can use the language channels, you need to verify your account:

1. Go to the bot's [web dashboard](${DASHBOARD_URL})
2. Click "Login with Discord"
3. Select this server and click "Verify"

That's it! Once verified, you can start using the language channels.

## How It Works

- Write a message in any language channel (e.g., #english, #spanish, #japanese)
- Your message will automatically be translated and posted to all other language channels
- Other users can respond in their preferred language, and you'll see their messages translated in your channel

## Tips

- Write clearly and avoid slang for better translations
- Use the channel that matches the language you're writing in
- Check your usage with the \`/usage\` command

## Need Help?

Use the \`/support\` command or \`/help\` for more information.`;

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
