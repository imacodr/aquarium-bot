import express from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import passport from "passport";
import { Strategy as DiscordStrategy, Profile } from "passport-discord";
import cors from "cors";
import http from "http";

// Validate environment variables before anything else
import { validateEnvAndExit } from "./config/env";
validateEnvAndExit();

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
import { webhookService } from "./services/webhook";
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
      // Don't expose internal error details to clients
      res.status(400).json({ error: "Webhook processing failed" });
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

// Session configuration with PostgreSQL store for persistence
const PgSession = connectPgSimple(session);

const sessionStore = new PgSession({
  conString: process.env.DATABASE_URL,
  tableName: "session",
  createTableIfMissing: false,
  errorLog: (error) => {
    console.error("Session store error:", error);
  },
});

app.use(
  session({
    store: sessionStore,
    name: "lebron.sid",
    secret: process.env.SESSION_SECRET!, // Validated at startup
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      maxAge: SESSION_MAX_AGE,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      httpOnly: true,
      domain: process.env.COOKIE_DOMAIN || undefined,
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

passport.serializeUser((user: Express.User, done: (err: any, id?: Express.User) => void) => {
  done(null, user);
});

passport.deserializeUser((user: Express.User, done: (err: any, user?: Express.User | false | null) => void) => {
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
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Create HTTP server for graceful shutdown
const server = http.createServer(app);

// Start Express server
server.listen(PORT, () => {
  console.log(`Express server listening on port ${PORT}`);
});

// Discord client error handling
client.on("error", (error) => {
  console.error("Discord client error:", error);
});

client.on("warn", (warning) => {
  console.warn("Discord client warning:", warning);
});

client.on("disconnect", () => {
  console.warn("Discord client disconnected, attempting to reconnect...");
});

client.on("reconnecting", () => {
  console.log("Discord client reconnecting...");
});

// Register Discord event handlers once client is ready
client.once("ready", () => {
  registerEvents(client);
});

// Graceful shutdown handling
let isShuttingDown = false;

async function gracefulShutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`\n${signal} received. Starting graceful shutdown...`);

  // Stop accepting new connections
  server.close((err) => {
    if (err) {
      console.error("Error closing HTTP server:", err);
    } else {
      console.log("HTTP server closed");
    }
  });

  // Give existing requests time to complete (30 seconds max)
  const shutdownTimeout = setTimeout(() => {
    console.error("Shutdown timeout reached, forcing exit");
    process.exit(1);
  }, 30000);

  try {
    // Close webhook service
    console.log("Closing webhook service...");
    webhookService.destroy();
    console.log("Webhook service closed");

    // Close Discord client
    console.log("Closing Discord client...");
    client.destroy();
    console.log("Discord client closed");

    // Close session store
    if (sessionStore.close) {
      console.log("Closing session store...");
      sessionStore.close();
      console.log("Session store closed");
    }

    clearTimeout(shutdownTimeout);
    console.log("Graceful shutdown complete");
    process.exit(0);
  } catch (error) {
    console.error("Error during shutdown:", error);
    clearTimeout(shutdownTimeout);
    process.exit(1);
  }
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
  console.error("Uncaught exception:", error);
  gracefulShutdown("uncaughtException");
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled rejection at:", promise, "reason:", reason);
});
