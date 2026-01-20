export interface Achievement {
  id: string;
  name: string;
  description: string;
  emoji: string;
  requirement: {
    type: "translations" | "streak" | "characters" | "languages";
    value: number;
  };
}

export const ACHIEVEMENTS: Achievement[] = [
  // Translation count achievements
  {
    id: "first_words",
    name: "First Words",
    description: "Send your first translation",
    emoji: "🎒",
    requirement: { type: "translations", value: 1 },
  },
  {
    id: "getting_started",
    name: "Getting Started",
    description: "Send 10 translations",
    emoji: "📝",
    requirement: { type: "translations", value: 10 },
  },
  {
    id: "conversationalist",
    name: "Conversationalist",
    description: "Send 50 translations",
    emoji: "💬",
    requirement: { type: "translations", value: 50 },
  },
  {
    id: "chatterbox",
    name: "Chatterbox",
    description: "Send 100 translations",
    emoji: "🗣️",
    requirement: { type: "translations", value: 100 },
  },
  {
    id: "polyglot_apprentice",
    name: "Polyglot Apprentice",
    description: "Send 500 translations",
    emoji: "📚",
    requirement: { type: "translations", value: 500 },
  },
  {
    id: "polyglot_master",
    name: "Polyglot Master",
    description: "Send 1,000 translations",
    emoji: "🎓",
    requirement: { type: "translations", value: 1000 },
  },
  {
    id: "language_legend",
    name: "Language Legend",
    description: "Send 5,000 translations",
    emoji: "👑",
    requirement: { type: "translations", value: 5000 },
  },

  // Streak achievements
  {
    id: "streak_starter",
    name: "Streak Starter",
    description: "Maintain a 3-day streak",
    emoji: "🔥",
    requirement: { type: "streak", value: 3 },
  },
  {
    id: "week_warrior",
    name: "Week Warrior",
    description: "Maintain a 7-day streak",
    emoji: "⚡",
    requirement: { type: "streak", value: 7 },
  },
  {
    id: "dedicated_learner",
    name: "Dedicated Learner",
    description: "Maintain a 14-day streak",
    emoji: "💪",
    requirement: { type: "streak", value: 14 },
  },
  {
    id: "monthly_master",
    name: "Monthly Master",
    description: "Maintain a 30-day streak",
    emoji: "🌟",
    requirement: { type: "streak", value: 30 },
  },
  {
    id: "unstoppable",
    name: "Unstoppable",
    description: "Maintain a 100-day streak",
    emoji: "🏆",
    requirement: { type: "streak", value: 100 },
  },

  // Character count achievements
  {
    id: "wordsmith",
    name: "Wordsmith",
    description: "Translate 10,000 characters",
    emoji: "✍️",
    requirement: { type: "characters", value: 10000 },
  },
  {
    id: "author",
    name: "Author",
    description: "Translate 50,000 characters",
    emoji: "📖",
    requirement: { type: "characters", value: 50000 },
  },
  {
    id: "novelist",
    name: "Novelist",
    description: "Translate 100,000 characters",
    emoji: "📕",
    requirement: { type: "characters", value: 100000 },
  },
];

export function getAchievementById(id: string): Achievement | undefined {
  return ACHIEVEMENTS.find((a) => a.id === id);
}

export function checkNewAchievements(
  currentAchievements: string[],
  stats: {
    translations: number;
    streak: number;
    characters: number;
  }
): Achievement[] {
  const newAchievements: Achievement[] = [];

  for (const achievement of ACHIEVEMENTS) {
    if (currentAchievements.includes(achievement.id)) continue;

    let earned = false;
    switch (achievement.requirement.type) {
      case "translations":
        earned = stats.translations >= achievement.requirement.value;
        break;
      case "streak":
        earned = stats.streak >= achievement.requirement.value;
        break;
      case "characters":
        earned = stats.characters >= achievement.requirement.value;
        break;
    }

    if (earned) {
      newAchievements.push(achievement);
    }
  }

  return newAchievements;
}
