import { TargetLanguageCode, SourceLanguageCode } from "deepl-node";
import { deeplService, TranslationResult } from "./deepl";
import { LANGUAGES, getOtherLanguages, Language } from "../config/languages";

export interface MultiTranslationResult {
  translations: Map<string, string>;
  characterCount: number;
}

class TranslationService {
  async translateText(
    text: string,
    sourceLang: string,
    targetLang: string
  ): Promise<TranslationResult> {
    const sourceLanguage = LANGUAGES[sourceLang];
    const targetLanguage = LANGUAGES[targetLang];

    if (!sourceLanguage || !targetLanguage) {
      throw new Error(`Invalid language code: ${sourceLang} or ${targetLang}`);
    }

    return deeplService.translateText(
      text,
      sourceLanguage.deeplSourceCode as SourceLanguageCode,
      targetLanguage.deeplTargetCode as TargetLanguageCode
    );
  }

  async translateToAllLanguages(
    text: string,
    sourceLang: string
  ): Promise<MultiTranslationResult> {
    const sourceLanguage = LANGUAGES[sourceLang];
    if (!sourceLanguage) {
      throw new Error(`Invalid source language code: ${sourceLang}`);
    }

    const otherLanguages = getOtherLanguages(sourceLang);
    const translations = new Map<string, string>();

    // Translate to each target language in parallel
    const translationPromises = otherLanguages.map(async (targetLang) => {
      const result = await deeplService.translateText(
        text,
        sourceLanguage.deeplSourceCode as SourceLanguageCode,
        targetLang.deeplTargetCode as TargetLanguageCode
      );
      return { langCode: targetLang.code, text: result.text };
    });

    const results = await Promise.all(translationPromises);

    for (const result of results) {
      translations.set(result.langCode, result.text);
    }

    // Character count is the original text length multiplied by number of translations
    // (DeepL charges based on source characters)
    const characterCount = text.length * otherLanguages.length;

    return {
      translations,
      characterCount,
    };
  }

  getCharacterCount(text: string, targetCount: number): number {
    return text.length * targetCount;
  }
}

export const translationService = new TranslationService();
export default translationService;
