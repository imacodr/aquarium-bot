import * as deepl from "deepl-node";

export interface TranslationResult {
  text: string;
  detectedSourceLang: string;
}

class DeepLService {
  private translator: deepl.Translator | null = null;

  private getTranslator(): deepl.Translator {
    if (!this.translator) {
      const apiKey = process.env.DEEPL_API_KEY;
      if (!apiKey) {
        throw new Error("DEEPL_API_KEY environment variable is not set");
      }
      this.translator = new deepl.Translator(apiKey);
    }
    return this.translator;
  }

  async translateText(
    text: string,
    sourceLang: deepl.SourceLanguageCode | null,
    targetLang: deepl.TargetLanguageCode
  ): Promise<TranslationResult> {
    const translator = this.getTranslator();
    const result = await translator.translateText(text, sourceLang, targetLang);

    return {
      text: result.text,
      detectedSourceLang: result.detectedSourceLang,
    };
  }

  async getUsage(): Promise<deepl.Usage> {
    const translator = this.getTranslator();
    return translator.getUsage();
  }

  async getSupportedLanguages(): Promise<{
    source: readonly deepl.Language[];
    target: readonly deepl.Language[];
  }> {
    const translator = this.getTranslator();
    const [source, target] = await Promise.all([
      translator.getSourceLanguages(),
      translator.getTargetLanguages(),
    ]);
    return { source, target };
  }
}

export const deeplService = new DeepLService();
export default deeplService;
