import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";

interface Phrase {
  english: string;
  spanish: string;
  portuguese: string;
  french: string;
  german: string;
  italian: string;
  japanese: string;
  korean: string;
  chinese: string;
  category: string;
  pronunciation?: {
    japanese?: string;
    korean?: string;
    chinese?: string;
  };
}

const PHRASES: Phrase[] = [
  {
    english: "The early bird catches the worm",
    spanish: "El que madruga, Dios le ayuda",
    portuguese: "Deus ajuda quem cedo madruga",
    french: "L'avenir appartient à ceux qui se lèvent tôt",
    german: "Morgenstund hat Gold im Mund",
    italian: "Chi dorme non piglia pesci",
    japanese: "早起きは三文の徳",
    korean: "일찍 일어나는 새가 벌레를 잡는다",
    chinese: "早起的鸟儿有虫吃",
    category: "Proverb",
    pronunciation: {
      japanese: "Hayaoki wa sanmon no toku",
      korean: "Iljjik ileonaneun saega beolleleul jamneunda",
      chinese: "Zǎoqǐ de niǎo'er yǒu chóng chī",
    },
  },
  {
    english: "Actions speak louder than words",
    spanish: "Obras son amores y no buenas razones",
    portuguese: "Ações falam mais alto que palavras",
    french: "Les actes valent mieux que les paroles",
    german: "Taten sagen mehr als Worte",
    italian: "I fatti contano più delle parole",
    japanese: "行動は言葉よりも雄弁",
    korean: "행동이 말보다 중요하다",
    chinese: "行动胜于言语",
    category: "Proverb",
    pronunciation: {
      japanese: "Kōdō wa kotoba yori mo yūben",
      korean: "Haengdongi malboda jungyohada",
      chinese: "Xíngdòng shèng yú yányǔ",
    },
  },
  {
    english: "Practice makes perfect",
    spanish: "La práctica hace al maestro",
    portuguese: "A prática leva à perfeição",
    french: "C'est en forgeant qu'on devient forgeron",
    german: "Übung macht den Meister",
    italian: "La pratica rende perfetti",
    japanese: "習うより慣れよ",
    korean: "연습이 완벽을 만든다",
    chinese: "熟能生巧",
    category: "Proverb",
    pronunciation: {
      japanese: "Narau yori nareyo",
      korean: "Yeonseubi wanbyeok-eul mandeunda",
      chinese: "Shú néng shēng qiǎo",
    },
  },
  {
    english: "Nice to meet you!",
    spanish: "¡Mucho gusto!",
    portuguese: "Prazer em conhecê-lo!",
    french: "Enchanté(e)!",
    german: "Freut mich!",
    italian: "Piacere di conoscerti!",
    japanese: "はじめまして！",
    korean: "만나서 반갑습니다!",
    chinese: "很高兴认识你！",
    category: "Greeting",
    pronunciation: {
      japanese: "Hajimemashite!",
      korean: "Mannaseo bangapseumnida!",
      chinese: "Hěn gāoxìng rènshi nǐ!",
    },
  },
  {
    english: "How are you doing?",
    spanish: "¿Cómo estás?",
    portuguese: "Como você está?",
    french: "Comment allez-vous?",
    german: "Wie geht es dir?",
    italian: "Come stai?",
    japanese: "お元気ですか？",
    korean: "어떻게 지내세요?",
    chinese: "你好吗？",
    category: "Greeting",
    pronunciation: {
      japanese: "Ogenki desu ka?",
      korean: "Eotteoke jinaeseyo?",
      chinese: "Nǐ hǎo ma?",
    },
  },
  {
    english: "Thank you very much!",
    spanish: "¡Muchas gracias!",
    portuguese: "Muito obrigado!",
    french: "Merci beaucoup!",
    german: "Vielen Dank!",
    italian: "Grazie mille!",
    japanese: "どうもありがとうございます！",
    korean: "정말 감사합니다!",
    chinese: "非常感谢！",
    category: "Courtesy",
    pronunciation: {
      japanese: "Dōmo arigatō gozaimasu!",
      korean: "Jeongmal gamsahamnida!",
      chinese: "Fēicháng gǎnxiè!",
    },
  },
  {
    english: "I don't understand",
    spanish: "No entiendo",
    portuguese: "Eu não entendo",
    french: "Je ne comprends pas",
    german: "Ich verstehe nicht",
    italian: "Non capisco",
    japanese: "分かりません",
    korean: "이해가 안 돼요",
    chinese: "我不明白",
    category: "Useful",
    pronunciation: {
      japanese: "Wakarimasen",
      korean: "Ihaega an dwaeyo",
      chinese: "Wǒ bù míngbái",
    },
  },
  {
    english: "Could you repeat that, please?",
    spanish: "¿Podría repetir, por favor?",
    portuguese: "Poderia repetir, por favor?",
    french: "Pourriez-vous répéter, s'il vous plaît?",
    german: "Könnten Sie das bitte wiederholen?",
    italian: "Potrebbe ripetere, per favore?",
    japanese: "もう一度言ってもらえますか？",
    korean: "다시 말씀해 주시겠어요?",
    chinese: "请再说一遍好吗？",
    category: "Useful",
    pronunciation: {
      japanese: "Mō ichido itte moraemasu ka?",
      korean: "Dasi malsseumhae jusigesseoyo?",
      chinese: "Qǐng zài shuō yībiàn hǎo ma?",
    },
  },
  {
    english: "Where is the bathroom?",
    spanish: "¿Dónde está el baño?",
    portuguese: "Onde fica o banheiro?",
    french: "Où sont les toilettes?",
    german: "Wo ist die Toilette?",
    italian: "Dov'è il bagno?",
    japanese: "トイレはどこですか？",
    korean: "화장실이 어디예요?",
    chinese: "洗手间在哪里？",
    category: "Travel",
    pronunciation: {
      japanese: "Toire wa doko desu ka?",
      korean: "Hwajangsiri eodiyeyo?",
      chinese: "Xǐshǒujiān zài nǎlǐ?",
    },
  },
  {
    english: "I would like to order, please",
    spanish: "Me gustaría pedir, por favor",
    portuguese: "Gostaria de fazer um pedido, por favor",
    french: "Je voudrais commander, s'il vous plaît",
    german: "Ich möchte bestellen, bitte",
    italian: "Vorrei ordinare, per favore",
    japanese: "注文したいのですが",
    korean: "주문하고 싶어요",
    chinese: "我想点餐",
    category: "Restaurant",
    pronunciation: {
      japanese: "Chūmon shitai no desu ga",
      korean: "Jumunhago sipeoyo",
      chinese: "Wǒ xiǎng diǎn cān",
    },
  },
  {
    english: "What time is it?",
    spanish: "¿Qué hora es?",
    portuguese: "Que horas são?",
    french: "Quelle heure est-il?",
    german: "Wie spät ist es?",
    italian: "Che ora è?",
    japanese: "今何時ですか？",
    korean: "지금 몇 시예요?",
    chinese: "现在几点了？",
    category: "Time",
    pronunciation: {
      japanese: "Ima nanji desu ka?",
      korean: "Jigeum myeot siyeyo?",
      chinese: "Xiànzài jǐ diǎn le?",
    },
  },
  {
    english: "I love learning languages!",
    spanish: "¡Me encanta aprender idiomas!",
    portuguese: "Eu amo aprender idiomas!",
    french: "J'adore apprendre les langues!",
    german: "Ich liebe es, Sprachen zu lernen!",
    italian: "Amo imparare le lingue!",
    japanese: "言語を学ぶのが大好きです！",
    korean: "언어 배우는 것을 좋아해요!",
    chinese: "我喜欢学习语言！",
    category: "Expression",
    pronunciation: {
      japanese: "Gengo wo manabu no ga daisuki desu!",
      korean: "Eoneo baeuneun geoseul joahaeyo!",
      chinese: "Wǒ xǐhuān xuéxí yǔyán!",
    },
  },
  {
    english: "Let's keep in touch!",
    spanish: "¡Mantengamos el contacto!",
    portuguese: "Vamos manter contato!",
    french: "Restons en contact!",
    german: "Lass uns in Kontakt bleiben!",
    italian: "Restiamo in contatto!",
    japanese: "連絡を取り合いましょう！",
    korean: "연락하고 지내요!",
    chinese: "保持联系！",
    category: "Social",
    pronunciation: {
      japanese: "Renraku wo toriaimashou!",
      korean: "Yeollaghago jinaeyo!",
      chinese: "Bǎochí liánxì!",
    },
  },
  {
    english: "Have a great day!",
    spanish: "¡Que tengas un buen día!",
    portuguese: "Tenha um ótimo dia!",
    french: "Bonne journée!",
    german: "Einen schönen Tag noch!",
    italian: "Buona giornata!",
    japanese: "良い一日を！",
    korean: "좋은 하루 보내세요!",
    chinese: "祝你今天愉快！",
    category: "Greeting",
    pronunciation: {
      japanese: "Yoi ichinichi wo!",
      korean: "Joeun haru bonaeseyo!",
      chinese: "Zhù nǐ jīntiān yúkuài!",
    },
  },
  {
    english: "Better late than never",
    spanish: "Más vale tarde que nunca",
    portuguese: "Antes tarde do que nunca",
    french: "Mieux vaut tard que jamais",
    german: "Besser spät als nie",
    italian: "Meglio tardi che mai",
    japanese: "遅くても何もないよりまし",
    korean: "안 하는 것보다 늦는 게 낫다",
    chinese: "迟到总比不到好",
    category: "Proverb",
    pronunciation: {
      japanese: "Osokute mo nani mo nai yori mashi",
      korean: "An haneun geotboda neunneun ge natda",
      chinese: "Chídào zǒng bǐ bù dào hǎo",
    },
  },
  {
    english: "When in Rome, do as the Romans do",
    spanish: "Donde fueres, haz lo que vieres",
    portuguese: "Em Roma, faça como os romanos",
    french: "À Rome, fais comme les Romains",
    german: "Wenn du in Rom bist, tu wie die Römer",
    italian: "Paese che vai, usanza che trovi",
    japanese: "郷に入っては郷に従え",
    korean: "로마에 가면 로마법을 따르라",
    chinese: "入乡随俗",
    category: "Proverb",
    pronunciation: {
      japanese: "Gō ni itte wa gō ni shitagae",
      korean: "Roma-e gamyeon romabeop-eul ttarara",
      chinese: "Rùxiāng suísú",
    },
  },
  {
    english: "Every cloud has a silver lining",
    spanish: "No hay mal que por bien no venga",
    portuguese: "Há males que vêm para bem",
    french: "Après la pluie, le beau temps",
    german: "Auf Regen folgt Sonnenschein",
    italian: "Dopo la tempesta viene il sereno",
    japanese: "捨てる神あれば拾う神あり",
    korean: "고생 끝에 낙이 온다",
    chinese: "塞翁失马，焉知非福",
    category: "Proverb",
    pronunciation: {
      japanese: "Suteru kami areba hirou kami ari",
      korean: "Gosaeng kkeute nagi onda",
      chinese: "Sàiwēng shīmǎ, yān zhī fēi fú",
    },
  },
  {
    english: "Don't judge a book by its cover",
    spanish: "Las apariencias engañan",
    portuguese: "As aparências enganam",
    french: "L'habit ne fait pas le moine",
    german: "Man soll ein Buch nicht nach seinem Einband beurteilen",
    italian: "L'abito non fa il monaco",
    japanese: "人は見かけによらない",
    korean: "겉모습만 보고 판단하지 마라",
    chinese: "不要以貌取人",
    category: "Proverb",
    pronunciation: {
      japanese: "Hito wa mikake ni yoranai",
      korean: "Geotmoseupman bogo pandanhaji mara",
      chinese: "Bùyào yǐ mào qǔ rén",
    },
  },
  {
    english: "Excuse me, can you help me?",
    spanish: "Disculpe, ¿puede ayudarme?",
    portuguese: "Com licença, pode me ajudar?",
    french: "Excusez-moi, pouvez-vous m'aider?",
    german: "Entschuldigung, können Sie mir helfen?",
    italian: "Mi scusi, può aiutarmi?",
    japanese: "すみません、手伝ってもらえますか？",
    korean: "실례합니다, 도와주실 수 있나요?",
    chinese: "请问，您能帮我吗？",
    category: "Useful",
    pronunciation: {
      japanese: "Sumimasen, tetsudatte moraemasu ka?",
      korean: "Sillyehamnida, dowajusil su innayo?",
      chinese: "Qǐngwèn, nín néng bāng wǒ ma?",
    },
  },
  {
    english: "I'm still learning",
    spanish: "Todavía estoy aprendiendo",
    portuguese: "Ainda estou aprendendo",
    french: "Je suis encore en train d'apprendre",
    german: "Ich lerne noch",
    italian: "Sto ancora imparando",
    japanese: "まだ勉強中です",
    korean: "아직 배우는 중이에요",
    chinese: "我还在学习中",
    category: "Useful",
    pronunciation: {
      japanese: "Mada benkyōchū desu",
      korean: "Ajik baeuneun jungieyo",
      chinese: "Wǒ hái zài xuéxí zhōng",
    },
  },
];

const CATEGORY_EMOJIS: Record<string, string> = {
  Proverb: "📜",
  Greeting: "👋",
  Courtesy: "🙏",
  Useful: "💡",
  Travel: "✈️",
  Restaurant: "🍽️",
  Time: "⏰",
  Expression: "💬",
  Social: "🤝",
};

const FLAG_EMOJIS: Record<string, string> = {
  english: "🇬🇧",
  spanish: "🇪🇸",
  portuguese: "🇧🇷",
  french: "🇫🇷",
  german: "🇩🇪",
  italian: "🇮🇹",
  japanese: "🇯🇵",
  korean: "🇰🇷",
  chinese: "🇨🇳",
};

function getPhraseOfTheDay(): Phrase {
  // Use date as seed for consistent phrase per day
  const today = new Date();
  const seed = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
  const index = seed % PHRASES.length;
  return PHRASES[index];
}

export default {
  data: new SlashCommandBuilder()
    .setName("phrase")
    .setDescription("Get the phrase of the day in multiple languages")
    .addStringOption((option) =>
      option
        .setName("language")
        .setDescription("Focus on a specific language (optional)")
        .setRequired(false)
        .addChoices(
          { name: "English", value: "english" },
          { name: "Spanish", value: "spanish" },
          { name: "Portuguese", value: "portuguese" },
          { name: "French", value: "french" },
          { name: "German", value: "german" },
          { name: "Italian", value: "italian" },
          { name: "Japanese", value: "japanese" },
          { name: "Korean", value: "korean" },
          { name: "Chinese", value: "chinese" }
        )
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const phrase = getPhraseOfTheDay();
    const focusLang = interaction.options.getString("language");
    const categoryEmoji = CATEGORY_EMOJIS[phrase.category] || "📝";

    if (focusLang) {
      // Show focused view for one language
      const translation = phrase[focusLang as keyof Phrase] as string;
      const flag = FLAG_EMOJIS[focusLang];
      const langName = focusLang.charAt(0).toUpperCase() + focusLang.slice(1);

      const embed = new EmbedBuilder()
        .setColor(0x0ea5e9)
        .setTitle(`${categoryEmoji} Phrase of the Day - ${flag} ${langName}`)
        .setDescription(`**${translation}**`)
        .addFields({
          name: "🇬🇧 English",
          value: phrase.english,
          inline: false,
        });

      // Add pronunciation for Asian languages
      if (phrase.pronunciation && focusLang in phrase.pronunciation) {
        const pron = phrase.pronunciation[focusLang as keyof typeof phrase.pronunciation];
        if (pron) {
          embed.addFields({
            name: "🔊 Pronunciation",
            value: `*${pron}*`,
            inline: false,
          });
        }
      }

      embed.setFooter({ text: `Category: ${phrase.category} • Use /phrase for all languages` });

      return interaction.reply({ embeds: [embed] });
    }

    // Show all languages
    const embed = new EmbedBuilder()
      .setColor(0x0ea5e9)
      .setTitle(`${categoryEmoji} Phrase of the Day`)
      .setDescription(`**Category:** ${phrase.category}`)
      .addFields(
        { name: "🇬🇧 English", value: phrase.english, inline: true },
        { name: "🇪🇸 Spanish", value: phrase.spanish, inline: true },
        { name: "🇧🇷 Portuguese", value: phrase.portuguese, inline: true },
        { name: "🇫🇷 French", value: phrase.french, inline: true },
        { name: "🇩🇪 German", value: phrase.german, inline: true },
        { name: "🇮🇹 Italian", value: phrase.italian, inline: true },
        { name: "🇯🇵 Japanese", value: phrase.japanese, inline: true },
        { name: "🇰🇷 Korean", value: phrase.korean, inline: true },
        { name: "🇨🇳 Chinese", value: phrase.chinese, inline: true }
      )
      .setFooter({ text: "Use /phrase language:<lang> to see pronunciation guides" });

    return interaction.reply({ embeds: [embed] });
  },
};
