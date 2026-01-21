export interface SubscriptionTier {
  id: string;
  name: string;
  description: string;
  price: number; // Monthly price in cents
  limits: {
    perUser: number;
    perGuild: number;
  };
  features: string[];
  isUserTier?: boolean; // true for personal subscriptions, false/undefined for guild subscriptions
}

export const SUBSCRIPTION_TIERS: Record<string, SubscriptionTier> = {
  free: {
    id: "free",
    name: "Free",
    description: "Perfect for trying out language immersion",
    price: 0,
    limits: {
      perUser: 5000,
      perGuild: 25000,
    },
    features: [
      "9 language channels",
      "5,000 characters/user/month",
      "25,000 characters/server/month",
      "Basic translation",
    ],
  },
  pro: {
    id: "pro",
    name: "Pro",
    description: "For active language learning communities",
    price: 999, // $9.99/month
    limits: {
      perUser: 25000,
      perGuild: 150000,
    },
    features: [
      "Everything in Free",
      "25,000 characters/user/month",
      "150,000 characters/server/month",
      "Priority support",
      "Usage analytics",
    ],
  },
  premium: {
    id: "premium",
    name: "Premium",
    description: "For large servers with high translation needs",
    price: 2499, // $24.99/month
    limits: {
      perUser: 100000,
      perGuild: 500000,
    },
    features: [
      "Everything in Pro",
      "100,000 characters/user/month",
      "500,000 characters/server/month",
      "Custom branding",
      "API access",
      "Dedicated support",
    ],
  },
};

export function getTierLimits(tier: string): { perUser: number; perGuild: number } {
  return SUBSCRIPTION_TIERS[tier]?.limits ?? SUBSCRIPTION_TIERS.free.limits;
}

export function getTierName(tier: string): string {
  return SUBSCRIPTION_TIERS[tier]?.name ?? "Free";
}

export function formatPrice(cents: number): string {
  if (cents === 0) return "Free";
  return `$${(cents / 100).toFixed(2)}/month`;
}

// User subscription tiers - same limits as guild tiers but for personal use
// These use different Stripe price IDs so we can track user vs guild subscriptions
export const USER_SUBSCRIPTION_TIERS: Record<string, SubscriptionTier> = {
  free: {
    id: "free",
    name: "Free",
    description: "Basic access across all servers",
    price: 0,
    limits: {
      perUser: 5000,
      perGuild: 0, // Not applicable for user tiers
    },
    features: [
      "5,000 characters/month across all servers",
      "Basic translation",
    ],
    isUserTier: true,
  },
  pro: {
    id: "pro",
    name: "Pro",
    description: "Higher limits on any server you use",
    price: 499, // $4.99/month
    limits: {
      perUser: 25000,
      perGuild: 0,
    },
    features: [
      "25,000 characters/month across all servers",
      "Priority support",
      "Works on any server with Aquarium",
    ],
    isUserTier: true,
  },
  premium: {
    id: "premium",
    name: "Premium",
    description: "Maximum limits for power users",
    price: 1249, // $12.49/month
    limits: {
      perUser: 100000,
      perGuild: 0,
    },
    features: [
      "100,000 characters/month across all servers",
      "Dedicated support",
      "Works on any server with Aquarium",
      "Early access to new features",
    ],
    isUserTier: true,
  },
};

// Get the effective per-user limit considering both user and guild tiers
// Returns the HIGHER of the two limits
export function getEffectiveUserLimit(userTier: string, guildTier: string): number {
  const userLimits = USER_SUBSCRIPTION_TIERS[userTier]?.limits ?? USER_SUBSCRIPTION_TIERS.free.limits;
  const guildLimits = SUBSCRIPTION_TIERS[guildTier]?.limits ?? SUBSCRIPTION_TIERS.free.limits;
  return Math.max(userLimits.perUser, guildLimits.perUser);
}

// Get the tier that provides the effective limit
export function getEffectiveTierSource(userTier: string, guildTier: string): "user" | "guild" {
  const userLimits = USER_SUBSCRIPTION_TIERS[userTier]?.limits ?? USER_SUBSCRIPTION_TIERS.free.limits;
  const guildLimits = SUBSCRIPTION_TIERS[guildTier]?.limits ?? SUBSCRIPTION_TIERS.free.limits;
  return userLimits.perUser >= guildLimits.perUser ? "user" : "guild";
}

// Get the effective tier name for display
export function getEffectiveTierName(userTier: string, guildTier: string): string {
  const source = getEffectiveTierSource(userTier, guildTier);
  const tier = source === "user" ? userTier : guildTier;
  return getTierName(tier);
}
