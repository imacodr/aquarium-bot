import Stripe from "stripe";
import { prisma } from "../database/prisma";
import { SUBSCRIPTION_TIERS } from "../config/subscriptions";
import { DASHBOARD_URL } from "../config/constants";

// Initialize Stripe only if API key is provided
const stripeKey = process.env.STRIPE_SECRET_KEY;
const stripe = stripeKey ? new Stripe(stripeKey) : null;

function getStripe(): Stripe {
  if (!stripe) {
    throw new Error("Stripe is not configured. Set STRIPE_SECRET_KEY environment variable.");
  }
  return stripe;
}

// Price IDs from Stripe Dashboard (you'll need to create these)
// Guild subscription price IDs
const GUILD_PRICE_IDS: Record<string, string> = {
  pro: process.env.STRIPE_PRO_PRICE_ID || "",
  premium: process.env.STRIPE_PREMIUM_PRICE_ID || "",
};

// User subscription price IDs (separate products for personal subscriptions)
const USER_PRICE_IDS: Record<string, string> = {
  pro: process.env.STRIPE_USER_PRO_PRICE_ID || "",
  premium: process.env.STRIPE_USER_PREMIUM_PRICE_ID || "",
};

// Alias for backwards compatibility
const PRICE_IDS = GUILD_PRICE_IDS;

export interface StripeService {
  // Guild subscription methods
  createCheckoutSession(
    guildId: string,
    tier: "pro" | "premium",
    userId: string
  ): Promise<{ url: string; sessionId: string }>;

  createBillingPortalSession(guildId: string): Promise<{ url: string }>;

  // User subscription methods
  createUserCheckoutSession(
    discordId: string,
    tier: "pro" | "premium"
  ): Promise<{ url: string; sessionId: string }>;

  createUserBillingPortalSession(discordId: string): Promise<{ url: string }>;

  cancelUserSubscription(discordId: string): Promise<void>;

  getUserSubscriptionStatus(discordId: string): Promise<{
    tier: string;
    expiresAt: Date | null;
    isActive: boolean;
  }>;

  handleWebhookEvent(event: Stripe.Event): Promise<void>;
}

class StripeServiceImpl implements StripeService {
  async createCheckoutSession(
    guildId: string,
    tier: "pro" | "premium",
    userId: string
  ): Promise<{ url: string; sessionId: string }> {
    const priceId = PRICE_IDS[tier];
    if (!priceId) {
      throw new Error("Invalid subscription tier");
    }

    // Get or create Stripe customer
    let config = await prisma.guildConfig.findUnique({
      where: { guildId },
    });

    if (!config) {
      throw new Error("Guild not found");
    }

    let customerId = config.stripeCustomerId;

    if (!customerId) {
      const customer = await getStripe().customers.create({
        metadata: {
          guildId,
          userId,
        },
      });
      customerId = customer.id;

      await prisma.guildConfig.update({
        where: { guildId },
        data: { stripeCustomerId: customerId },
      });
    }

    const session = await getStripe().checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${DASHBOARD_URL}/subscribe?success=true&guild=${guildId}`,
      cancel_url: `${DASHBOARD_URL}/subscribe?canceled=true&guild=${guildId}`,
      metadata: {
        guildId,
        tier,
        subscriptionType: "guild",
      },
      subscription_data: {
        metadata: {
          guildId,
          tier,
          subscriptionType: "guild",
        },
      },
    });

    if (!session.url) {
      throw new Error("Failed to create checkout session");
    }

    return {
      url: session.url,
      sessionId: session.id,
    };
  }

  async createBillingPortalSession(guildId: string): Promise<{ url: string }> {
    const config = await prisma.guildConfig.findUnique({
      where: { guildId },
    });

    if (!config?.stripeCustomerId) {
      throw new Error("No subscription found");
    }

    const session = await getStripe().billingPortal.sessions.create({
      customer: config.stripeCustomerId,
      return_url: `${DASHBOARD_URL}/subscribe?guild=${guildId}`,
    });

    return { url: session.url };
  }

  async handleWebhookEvent(event: Stripe.Event): Promise<void> {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        await this.handleCheckoutComplete(session);
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        await this.handleSubscriptionUpdate(subscription);
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        await this.handleSubscriptionCanceled(subscription);
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        await this.handlePaymentFailed(invoice);
        break;
      }
    }
  }

  private async handleCheckoutComplete(session: Stripe.Checkout.Session) {
    const subscriptionType = session.metadata?.subscriptionType;
    const tier = session.metadata?.tier as "pro" | "premium";

    if (!tier) {
      console.error("Missing tier in checkout session metadata");
      return;
    }

    // Get subscription details
    const subscriptionId = session.subscription as string;
    const subscription = await getStripe().subscriptions.retrieve(subscriptionId);
    const currentPeriodEnd = (subscription as any).current_period_end as number;

    if (subscriptionType === "user") {
      // Handle user subscription
      const discordId = session.metadata?.discordId;
      if (!discordId) {
        console.error("Missing discordId in user checkout session");
        return;
      }

      await prisma.user.update({
        where: { discordId },
        data: {
          subscriptionTier: tier,
          stripeSubscriptionId: subscriptionId,
          subscriptionExpiresAt: new Date(currentPeriodEnd * 1000),
        },
      });

      console.log(`User subscription activated for ${discordId}: ${tier}`);
    } else {
      // Handle guild subscription (default behavior)
      const guildId = session.metadata?.guildId;
      if (!guildId) {
        console.error("Missing guildId in guild checkout session");
        return;
      }

      await prisma.guildConfig.update({
        where: { guildId },
        data: {
          subscriptionTier: tier,
          stripeSubscriptionId: subscriptionId,
          subscriptionExpiresAt: new Date(currentPeriodEnd * 1000),
        },
      });

      console.log(`Guild subscription activated for ${guildId}: ${tier}`);
    }
  }

  private async handleSubscriptionUpdate(subscription: Stripe.Subscription) {
    const subscriptionType = subscription.metadata?.subscriptionType;
    const priceId = subscription.items.data[0]?.price?.id;
    const currentPeriodEnd = (subscription as any).current_period_end as number;

    // Determine tier from price (check both guild and user price IDs)
    let tier: string = "free";
    for (const [tierName, id] of Object.entries(GUILD_PRICE_IDS)) {
      if (id === priceId) {
        tier = tierName;
        break;
      }
    }
    if (tier === "free") {
      for (const [tierName, id] of Object.entries(USER_PRICE_IDS)) {
        if (id === priceId) {
          tier = tierName;
          break;
        }
      }
    }

    if (subscriptionType === "user") {
      const discordId = subscription.metadata?.discordId;
      if (!discordId) return;

      await prisma.user.update({
        where: { discordId },
        data: {
          subscriptionTier: tier,
          subscriptionExpiresAt: new Date(currentPeriodEnd * 1000),
        },
      });

      console.log(`User subscription updated for ${discordId}: ${tier}`);
    } else {
      const guildId = subscription.metadata?.guildId;
      if (!guildId) return;

      await prisma.guildConfig.update({
        where: { guildId },
        data: {
          subscriptionTier: tier,
          subscriptionExpiresAt: new Date(currentPeriodEnd * 1000),
        },
      });

      console.log(`Guild subscription updated for ${guildId}: ${tier}`);
    }
  }

  private async handleSubscriptionCanceled(subscription: Stripe.Subscription) {
    const subscriptionType = subscription.metadata?.subscriptionType;

    if (subscriptionType === "user") {
      const discordId = subscription.metadata?.discordId;
      if (!discordId) return;

      await prisma.user.update({
        where: { discordId },
        data: {
          subscriptionTier: "free",
          subscriptionExpiresAt: null,
          stripeSubscriptionId: null,
        },
      });

      console.log(`User subscription canceled for ${discordId}`);
    } else {
      const guildId = subscription.metadata?.guildId;
      if (!guildId) return;

      await prisma.guildConfig.update({
        where: { guildId },
        data: {
          subscriptionTier: "free",
          subscriptionExpiresAt: null,
          stripeSubscriptionId: null,
        },
      });

      console.log(`Guild subscription canceled for ${guildId}`);
    }
  }

  private async handlePaymentFailed(invoice: Stripe.Invoice) {
    const customerId = invoice.customer as string;

    const config = await prisma.guildConfig.findFirst({
      where: { stripeCustomerId: customerId },
    });

    if (config) {
      console.log(`Payment failed for guild ${config.guildId}`);
      // Optionally notify guild admins
    }
  }

  async cancelSubscription(guildId: string): Promise<void> {
    const config = await prisma.guildConfig.findUnique({
      where: { guildId },
    });

    if (!config?.stripeSubscriptionId) {
      throw new Error("No subscription found");
    }

    await getStripe().subscriptions.cancel(config.stripeSubscriptionId);
  }

  async getSubscriptionStatus(guildId: string): Promise<{
    tier: string;
    expiresAt: Date | null;
    isActive: boolean;
  }> {
    const config = await prisma.guildConfig.findUnique({
      where: { guildId },
    });

    if (!config) {
      return { tier: "free", expiresAt: null, isActive: true };
    }

    const isActive =
      config.subscriptionTier === "free" ||
      !config.subscriptionExpiresAt ||
      config.subscriptionExpiresAt > new Date();

    return {
      tier: config.subscriptionTier,
      expiresAt: config.subscriptionExpiresAt,
      isActive,
    };
  }

  // User subscription methods
  async createUserCheckoutSession(
    discordId: string,
    tier: "pro" | "premium"
  ): Promise<{ url: string; sessionId: string }> {
    const priceId = USER_PRICE_IDS[tier];
    if (!priceId) {
      throw new Error("Invalid subscription tier");
    }

    // Get or create global User and Stripe customer
    let user = await prisma.user.findUnique({
      where: { discordId },
    });

    if (!user) {
      throw new Error("User not found. Please verify in a server first.");
    }

    let customerId = user.stripeCustomerId;

    if (!customerId) {
      const customer = await getStripe().customers.create({
        metadata: {
          discordId,
          subscriptionType: "user",
        },
      });
      customerId = customer.id;

      await prisma.user.update({
        where: { discordId },
        data: { stripeCustomerId: customerId },
      });
    }

    const session = await getStripe().checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${DASHBOARD_URL}/subscribe?success=true&type=personal`,
      cancel_url: `${DASHBOARD_URL}/subscribe?canceled=true&type=personal`,
      metadata: {
        discordId,
        tier,
        subscriptionType: "user",
      },
      subscription_data: {
        metadata: {
          discordId,
          tier,
          subscriptionType: "user",
        },
      },
    });

    if (!session.url) {
      throw new Error("Failed to create checkout session");
    }

    return {
      url: session.url,
      sessionId: session.id,
    };
  }

  async createUserBillingPortalSession(discordId: string): Promise<{ url: string }> {
    const user = await prisma.user.findUnique({
      where: { discordId },
    });

    if (!user?.stripeCustomerId) {
      throw new Error("No subscription found");
    }

    const session = await getStripe().billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${DASHBOARD_URL}/subscribe?type=personal`,
    });

    return { url: session.url };
  }

  async cancelUserSubscription(discordId: string): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { discordId },
    });

    if (!user?.stripeSubscriptionId) {
      throw new Error("No subscription found");
    }

    await getStripe().subscriptions.cancel(user.stripeSubscriptionId);
  }

  async getUserSubscriptionStatus(discordId: string): Promise<{
    tier: string;
    expiresAt: Date | null;
    isActive: boolean;
  }> {
    const user = await prisma.user.findUnique({
      where: { discordId },
    });

    if (!user) {
      return { tier: "free", expiresAt: null, isActive: true };
    }

    const isActive =
      user.subscriptionTier === "free" ||
      !user.subscriptionExpiresAt ||
      user.subscriptionExpiresAt > new Date();

    return {
      tier: user.subscriptionTier,
      expiresAt: user.subscriptionExpiresAt,
      isActive,
    };
  }
}

export const stripeService = new StripeServiceImpl();
export default stripeService;

// Webhook signature verification helper
export function constructWebhookEvent(
  payload: Buffer,
  signature: string
): Stripe.Event {
  return getStripe().webhooks.constructEvent(
    payload,
    signature,
    process.env.STRIPE_WEBHOOK_SECRET || ""
  );
}
