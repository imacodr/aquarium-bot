import { LANGUAGES, LANGUAGE_CODES } from "./languages";

// Display modes for translation output
export type DisplayMode = "detailed" | "compact";

// Notification preferences structure
export interface NotificationPrefs {
  achievements: boolean;
  streaks: boolean;
}

// Per-guild preferences (stored in VerifiedUser)
export interface GuildPreferences {
  subscribedLanguages: string[]; // Empty array = all languages
  displayMode: DisplayMode;
  showOnLeaderboard: boolean;
}

// Global preferences (stored in User)
export interface GlobalPreferences {
  nativeLanguage: string | null;
  notificationPrefs: NotificationPrefs;
  dmNotificationsEnabled: boolean;
}

// Default values
export const DEFAULT_GUILD_PREFERENCES: GuildPreferences = {
  subscribedLanguages: [], // Empty = subscribed to all
  displayMode: "detailed",
  showOnLeaderboard: true,
};

export const DEFAULT_GLOBAL_PREFERENCES: GlobalPreferences = {
  nativeLanguage: null,
  notificationPrefs: {
    achievements: true,
    streaks: true,
  },
  dmNotificationsEnabled: true,
};

// Helper functions

/**
 * Parse subscribed languages from JSON string
 */
export function parseSubscribedLanguages(jsonString: string): string[] {
  try {
    const parsed = JSON.parse(jsonString);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((code) => typeof code === "string" && LANGUAGES[code]);
  } catch {
    return [];
  }
}

/**
 * Serialize subscribed languages to JSON string
 */
export function serializeSubscribedLanguages(languages: string[]): string {
  return JSON.stringify(languages);
}

/**
 * Validate that all language codes are valid
 */
export function validateLanguageCodes(codes: string[]): {
  valid: string[];
  invalid: string[];
} {
  const valid: string[] = [];
  const invalid: string[] = [];

  for (const code of codes) {
    if (LANGUAGES[code]) {
      valid.push(code);
    } else {
      invalid.push(code);
    }
  }

  return { valid, invalid };
}

/**
 * Check if a user is subscribed to a specific language
 * Empty subscription list = subscribed to all
 */
export function isSubscribedToLanguage(
  subscribedLanguages: string[],
  languageCode: string
): boolean {
  if (subscribedLanguages.length === 0) return true;
  return subscribedLanguages.includes(languageCode);
}

/**
 * Get display text for subscribed languages
 */
export function getSubscribedLanguagesDisplay(
  subscribedLanguages: string[]
): string {
  if (subscribedLanguages.length === 0) {
    return "All languages";
  }
  return subscribedLanguages
    .map((code) => {
      const lang = LANGUAGES[code];
      return lang ? `${lang.emoji} ${lang.name}` : code;
    })
    .join(", ");
}

/**
 * Parse notification preferences from JSON string
 */
export function parseNotificationPrefs(jsonString: string): NotificationPrefs {
  try {
    const parsed = JSON.parse(jsonString);
    return {
      achievements:
        typeof parsed.achievements === "boolean"
          ? parsed.achievements
          : DEFAULT_GLOBAL_PREFERENCES.notificationPrefs.achievements,
      streaks:
        typeof parsed.streaks === "boolean"
          ? parsed.streaks
          : DEFAULT_GLOBAL_PREFERENCES.notificationPrefs.streaks,
    };
  } catch {
    return DEFAULT_GLOBAL_PREFERENCES.notificationPrefs;
  }
}

/**
 * Serialize notification preferences to JSON string
 */
export function serializeNotificationPrefs(prefs: NotificationPrefs): string {
  return JSON.stringify(prefs);
}

/**
 * Validate display mode
 */
export function isValidDisplayMode(mode: string): mode is DisplayMode {
  return mode === "detailed" || mode === "compact";
}
