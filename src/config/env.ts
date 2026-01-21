/**
 * Environment variable validation
 * Validates required environment variables at startup
 */

interface EnvConfig {
  // Required
  TOKEN: string;
  CLIENTID: string;
  DISCORD_CLIENT_SECRET: string;
  DATABASE_URL: string;
  SESSION_SECRET: string;
  BASE_URL: string;
  DASHBOARD_URL: string;
  DEEPL_API_KEY: string;

  // Optional
  NODE_ENV: string;
  PORT: string;
  GUILDID?: string;
  COOKIE_DOMAIN?: string;

  // Stripe (optional but validated if present)
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_PRO_PRICE_ID?: string;
  STRIPE_PREMIUM_PRICE_ID?: string;
  STRIPE_USER_PRO_PRICE_ID?: string;
  STRIPE_USER_PREMIUM_PRICE_ID?: string;
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

const REQUIRED_VARS = [
  "TOKEN",
  "CLIENTID",
  "DISCORD_CLIENT_SECRET",
  "DATABASE_URL",
  "SESSION_SECRET",
  "BASE_URL",
  "DASHBOARD_URL",
  "DEEPL_API_KEY",
] as const;

const STRIPE_VARS = [
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_PRO_PRICE_ID",
  "STRIPE_PREMIUM_PRICE_ID",
  "STRIPE_USER_PRO_PRICE_ID",
  "STRIPE_USER_PREMIUM_PRICE_ID",
] as const;

export function validateEnv(): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check required variables
  for (const varName of REQUIRED_VARS) {
    const value = process.env[varName];
    if (!value || value.trim() === "") {
      errors.push(`Missing required environment variable: ${varName}`);
    }
  }

  // Validate SESSION_SECRET strength
  const sessionSecret = process.env.SESSION_SECRET;
  if (sessionSecret) {
    if (sessionSecret.length < 32) {
      errors.push("SESSION_SECRET must be at least 32 characters long");
    }
    if (sessionSecret === "change-this-secret-in-production") {
      errors.push("SESSION_SECRET is using the default value - please set a secure random string");
    }
  }

  // Validate URLs
  const baseUrl = process.env.BASE_URL;
  const dashboardUrl = process.env.DASHBOARD_URL;

  if (baseUrl && !isValidUrl(baseUrl)) {
    errors.push(`BASE_URL is not a valid URL: ${baseUrl}`);
  }

  if (dashboardUrl && !isValidUrl(dashboardUrl)) {
    errors.push(`DASHBOARD_URL is not a valid URL: ${dashboardUrl}`);
  }

  // Production-specific validations
  if (process.env.NODE_ENV === "production") {
    if (baseUrl && !baseUrl.startsWith("https://")) {
      warnings.push("BASE_URL should use HTTPS in production");
    }
    if (dashboardUrl && !dashboardUrl.startsWith("https://")) {
      warnings.push("DASHBOARD_URL should use HTTPS in production");
    }
  }

  // Validate DATABASE_URL format
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl && !databaseUrl.startsWith("postgres")) {
    errors.push("DATABASE_URL must be a PostgreSQL connection string");
  }

  // Validate Stripe configuration (only if any Stripe var is set)
  const hasAnyStripeVar = STRIPE_VARS.some((v) => process.env[v]);
  if (hasAnyStripeVar) {
    for (const varName of STRIPE_VARS) {
      if (!process.env[varName]) {
        warnings.push(`Stripe is partially configured but missing: ${varName}`);
      }
    }

    // Validate webhook secret format
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (webhookSecret && !webhookSecret.startsWith("whsec_")) {
      warnings.push("STRIPE_WEBHOOK_SECRET should start with 'whsec_'");
    }
  }

  // Validate Discord token format (basic check)
  const token = process.env.TOKEN;
  if (token && token.split(".").length !== 3) {
    warnings.push("TOKEN does not appear to be a valid Discord bot token format");
  }

  // Validate CLIENTID is a snowflake
  const clientId = process.env.CLIENTID;
  if (clientId && !/^\d{17,19}$/.test(clientId)) {
    errors.push("CLIENTID must be a valid Discord snowflake (17-19 digit number)");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

function isValidUrl(urlString: string): boolean {
  try {
    new URL(urlString);
    return true;
  } catch {
    return false;
  }
}

export function validateEnvAndExit(): void {
  const isDev = process.env.NODE_ENV !== "production";

  // Skip strict validation in development
  if (isDev) {
    console.log("🔧 Development mode - skipping strict environment validation");
    return;
  }

  const result = validateEnv();

  // Print warnings
  for (const warning of result.warnings) {
    console.warn(`⚠️  Warning: ${warning}`);
  }

  // Print errors
  for (const error of result.errors) {
    console.error(`❌ Error: ${error}`);
  }

  if (!result.valid) {
    console.error("\n🚫 Environment validation failed. Please fix the above errors before starting.");
    process.exit(1);
  }

  if (result.warnings.length > 0) {
    console.log("\n⚠️  Starting with warnings. Review the above messages.");
  } else {
    console.log("✅ Environment validation passed");
  }
}

// Export typed env access
export function getEnv(): EnvConfig {
  return process.env as unknown as EnvConfig;
}
