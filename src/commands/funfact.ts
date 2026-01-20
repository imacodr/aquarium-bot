import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";

const LANGUAGE_FACTS = [
  {
    fact: "There are over 7,000 languages spoken in the world today, but about 40% are endangered with fewer than 1,000 speakers.",
    emoji: "🌍",
  },
  {
    fact: "The longest word in English is 189,819 letters long and is the chemical name for titin, a protein. It takes over 3 hours to pronounce!",
    emoji: "📚",
  },
  {
    fact: "Mandarin Chinese is the most spoken language in the world with over 900 million native speakers.",
    emoji: "🇨🇳",
  },
  {
    fact: "The word 'set' has the most definitions of any English word - over 430 different meanings!",
    emoji: "📖",
  },
  {
    fact: "Korean was created in 1443 by King Sejong the Great. It's considered one of the most logical writing systems ever invented.",
    emoji: "🇰🇷",
  },
  {
    fact: "The sentence 'The quick brown fox jumps over the lazy dog' uses every letter in the English alphabet.",
    emoji: "🦊",
  },
  {
    fact: "Japanese has three writing systems: Hiragana, Katakana, and Kanji. A literate adult knows about 2,000 kanji characters.",
    emoji: "🇯🇵",
  },
  {
    fact: "The word 'goodbye' comes from 'God be with ye' - a blessing that evolved over centuries.",
    emoji: "👋",
  },
  {
    fact: "Basque, spoken in Spain and France, is a language isolate - it's not related to any other known language!",
    emoji: "🏔️",
  },
  {
    fact: "The Hawaiian alphabet has only 13 letters: A, E, I, O, U, H, K, L, M, N, P, W, and the 'okina (ʻ).",
    emoji: "🌺",
  },
  {
    fact: "Shakespeare invented over 1,700 words including 'assassination', 'bedroom', and 'lonely'.",
    emoji: "🎭",
  },
  {
    fact: "The German word 'Schadenfreude' means taking pleasure in someone else's misfortune. There's no single English equivalent!",
    emoji: "🇩🇪",
  },
  {
    fact: "In Finnish, the word 'juoksentelisinkohan' means 'I wonder if I should run around aimlessly' - all in one word!",
    emoji: "🏃",
  },
  {
    fact: "The @ symbol has different names worldwide. In Dutch it's 'monkey tail', in Hebrew it's 'strudel', and in Korean it's 'snail'.",
    emoji: "🐌",
  },
  {
    fact: "Portuguese and Spanish share about 89% lexical similarity - but false friends can cause hilarious misunderstandings!",
    emoji: "🇧🇷",
  },
  {
    fact: "The French Academy has been protecting the French language since 1635. They've tried (and failed) to stop words like 'le weekend'.",
    emoji: "🇫🇷",
  },
  {
    fact: "Arabic is written from right to left, but numbers are written from left to right!",
    emoji: "🔢",
  },
  {
    fact: "The shortest complete sentence in English is 'Go.' or 'I am.' depending on how you count.",
    emoji: "✨",
  },
  {
    fact: "Babies can distinguish between all 800 sounds that make up the world's languages. By age 1, they lose the ability to hear differences not in their native language.",
    emoji: "👶",
  },
  {
    fact: "The Italian word 'culaccino' describes the mark left on a table by a cold glass. There's no English word for it!",
    emoji: "🇮🇹",
  },
  {
    fact: "Sign languages aren't universal! American Sign Language (ASL) is completely different from British Sign Language (BSL).",
    emoji: "🤟",
  },
  {
    fact: "Learning a second language can delay the onset of dementia and Alzheimer's by up to 5 years.",
    emoji: "🧠",
  },
  {
    fact: "The word 'llanfairpwllgwyngyllgogerychwyrndrobwllllantysiliogogogoch' is a Welsh town name with 58 letters!",
    emoji: "🏴󠁧󠁢󠁷󠁬󠁳󠁿",
  },
  {
    fact: "Esperanto was created in 1887 as a universal second language. About 2 million people speak it today!",
    emoji: "🌐",
  },
  {
    fact: "The oldest written language still in use today is Chinese, with a history of over 3,000 years.",
    emoji: "📜",
  },
];

export default {
  data: new SlashCommandBuilder()
    .setName("funfact")
    .setDescription("Get a random fun fact about languages"),

  async execute(interaction: ChatInputCommandInteraction) {
    const randomFact = LANGUAGE_FACTS[Math.floor(Math.random() * LANGUAGE_FACTS.length)];

    const embed = new EmbedBuilder()
      .setColor(0x0ea5e9)
      .setTitle(`${randomFact.emoji} Language Fun Fact`)
      .setDescription(randomFact.fact)
      .setFooter({ text: "Keep learning! Use /funfact for another fact" });

    return interaction.reply({ embeds: [embed] });
  },
};
