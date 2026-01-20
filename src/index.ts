import express from "express";
import session from "express-session";
import passport from "passport";
import { Strategy as DiscordStrategy, Profile } from "passport-discord";
import cors from "cors";

import { client } from "./client";
import { registerEvents } from "./events";
import authRoutes from "./web/routes/auth";
import apiRoutes from "./web/routes/api";
import adminRoutes from "./web/routes/admin";
import immersionRoutes from "./web/routes/immersion";
import moderationRoutes from "./web/routes/moderation";
import {
  BASE_URL,
  DASHBOARD_URL,
  DISCORD_OAUTH_SCOPES,
  SESSION_MAX_AGE,
} from "./config/constants";
import { stripeService, constructWebhookEvent } from "./services/stripe";
import {
  securityHeaders,
  apiRateLimiter,
  authRateLimiter,
} from "./web/middleware/security";

const PORT = process.env.PORT || 4001;

const app = express();

// CORS configuration for Next.js dashboard
app.use(
  cors({
    origin: DASHBOARD_URL,
    credentials: true,
  })
);

// Stripe webhook endpoint (must be before json parser)
app.post(
  "/webhooks/stripe",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const signature = req.headers["stripe-signature"] as string;

    try {
      const event = constructWebhookEvent(req.body, signature);
      await stripeService.handleWebhookEvent(event);
      res.json({ received: true });
    } catch (error: any) {
      console.error("Webhook error:", error.message);
      res.status(400).json({ error: error.message });
    }
  }
);

app.use(express.json());

// Security headers
app.use(securityHeaders);

// Trust proxy for production (Render, Railway, etc.)
if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

// Session configuration
app.use(
  session({
    secret: process.env.SESSION_SECRET || "change-this-secret-in-production",
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: SESSION_MAX_AGE,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      httpOnly: true,
    },
  })
);

// Passport configuration
app.use(passport.initialize());
app.use(passport.session());

// Discord OAuth2 Strategy
passport.use(
  new DiscordStrategy(
    {
      clientID: process.env.CLIENTID!,
      clientSecret: process.env.DISCORD_CLIENT_SECRET!,
      callbackURL: `${BASE_URL}/auth/discord/callback`,
      scope: DISCORD_OAUTH_SCOPES,
    },
    (accessToken: string, refreshToken: string, profile: Profile, done: (err: any, user?: any) => void) => {
      // Return the Discord profile as the user
      return done(null, {
        id: profile.id,
        username: profile.username,
        discriminator: profile.discriminator,
        avatar: profile.avatar,
      });
    }
  )
);

passport.serializeUser((user: any, done) => {
  done(null, user);
});

passport.deserializeUser((user: any, done) => {
  done(null, user);
});

// Routes with rate limiting
app.use("/auth", authRateLimiter, authRoutes);
app.use("/api", apiRateLimiter, apiRoutes);
app.use("/api/admin", apiRateLimiter, adminRoutes);
app.use("/api/immersion", apiRateLimiter, immersionRoutes);
app.use("/api/moderation", apiRateLimiter, moderationRoutes);

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// Start Express server
app.listen(PORT, () => {
  console.log(`Express server listening on port ${PORT}`);
});

// Register Discord event handlers once client is ready
client.once("ready", () => {
  registerEvents(client);
});
