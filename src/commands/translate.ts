import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { LANGUAGES, LANGUAGE_CODES } from "../config/languages";
import { deeplService } from "../services/deepl";

export default {
  data: new SlashCommandBuilder()
    .setName("translate")
    .setDescription("Quickly translate text to another language")
    .addStringOption((option) =>
      option
        .setName("text")
        .setDescription("The text to translate")
        .setRequired(true)
        .setMaxLength(500)
    )
    .addStringOption((option) =>
      option
        .setName("to")
        .setDescription("Target language")
        .setRequired(true)
        .addChoices(
          ...Object.values(LANGUAGES).map((lang) => ({
            name: `${lang.emoji} ${lang.name}`,
            value: lang.code,
          }))
        )
    )
    .addStringOption((option) =>
      option
        .setName("from")
        .setDescription("Source language (auto-detect if not specified)")
        .setRequired(false)
        .addChoices(
          ...Object.values(LANGUAGES).map((lang) => ({
            name: `${lang.emoji} ${lang.name}`,
            value: lang.code,
          }))
        )
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const text = interaction.options.getString("text", true);
    const targetCode = interaction.options.getString("to", true);
    const sourceCode = interaction.options.getString("from");

    await interaction.deferReply({ ephemeral: true });

    try {
      const targetLang = LANGUAGES[targetCode];
      const sourceLang = sourceCode ? LANGUAGES[sourceCode] : null;

      const result = await deeplService.translateText(
        text,
        (sourceLang?.deeplSourceCode as any) || null,
        targetLang.deeplTargetCode as any
      );

      const detectedLang = Object.values(LANGUAGES).find(
        (l) => l.deeplSourceCode === result.detectedSourceLang
      );

      const embed = new EmbedBuilder()
        .setColor(0x0ea5e9)
        .setDescription(result.text)
        .setFooter({
          text: `${detectedLang?.emoji || "🌐"} ${detectedLang?.name || result.detectedSourceLang} → ${targetLang.emoji} ${targetLang.name}`,
        });

      return interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error("Error translating:", error);
      return interaction.editReply({
        content: "An error occurred while translating. Please try again.",
      });
    }
  },
};
