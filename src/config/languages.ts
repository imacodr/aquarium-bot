export interface Language {
  code: string;
  deeplSourceCode: string;  // For source language (simpler codes)
  deeplTargetCode: string;  // For target language (can be more specific)
  name: string;
  channelName: string;
  emoji: string;
}

export const LANGUAGES: Record<string, Language> = {
  EN: {
    code: "EN",
    deeplSourceCode: "EN",
    deeplTargetCode: "EN-US",
    name: "English",
    channelName: "english",
    emoji: "🇺🇸",
  },
  ES: {
    code: "ES",
    deeplSourceCode: "ES",
    deeplTargetCode: "ES",
    name: "Spanish",
    channelName: "spanish",
    emoji: "🇪🇸",
  },
  "PT-BR": {
    code: "PT-BR",
    deeplSourceCode: "PT",
    deeplTargetCode: "PT-BR",
    name: "Portuguese",
    channelName: "portuguese",
    emoji: "🇧🇷",
  },
  FR: {
    code: "FR",
    deeplSourceCode: "FR",
    deeplTargetCode: "FR",
    name: "French",
    channelName: "french",
    emoji: "🇫🇷",
  },
  DE: {
    code: "DE",
    deeplSourceCode: "DE",
    deeplTargetCode: "DE",
    name: "German",
    channelName: "german",
    emoji: "🇩🇪",
  },
  IT: {
    code: "IT",
    deeplSourceCode: "IT",
    deeplTargetCode: "IT",
    name: "Italian",
    channelName: "italian",
    emoji: "🇮🇹",
  },
  JA: {
    code: "JA",
    deeplSourceCode: "JA",
    deeplTargetCode: "JA",
    name: "Japanese",
    channelName: "japanese",
    emoji: "🇯🇵",
  },
  KO: {
    code: "KO",
    deeplSourceCode: "KO",
    deeplTargetCode: "KO",
    name: "Korean",
    channelName: "korean",
    emoji: "🇰🇷",
  },
  ZH: {
    code: "ZH",
    deeplSourceCode: "ZH",
    deeplTargetCode: "ZH-HANS",
    name: "Chinese",
    channelName: "chinese",
    emoji: "🇨🇳",
  },
};

export const LANGUAGE_CODES = Object.keys(LANGUAGES);

export function getLanguageByChannelName(channelName: string): Language | undefined {
  // Handle both formats: "english" and "🇺🇸︱english"
  const normalizedName = channelName.includes("︱")
    ? channelName.split("︱").pop()
    : channelName;
  return Object.values(LANGUAGES).find((lang) => lang.channelName === normalizedName);
}

export function getLanguageByCode(code: string): Language | undefined {
  return LANGUAGES[code];
}

export function getOtherLanguages(excludeCode: string): Language[] {
  return Object.values(LANGUAGES).filter((lang) => lang.code !== excludeCode);
}
