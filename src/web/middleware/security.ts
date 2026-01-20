import { Request, Response, NextFunction } from "express";
import rateLimit from "express-rate-limit";

// Rate limiters for different endpoints
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 requests per window
  message: { error: "Too many authentication attempts, please try again later" },
  standardHeaders: true,
  legacyHeaders: false,
});

export const apiRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 60, // 60 requests per minute
  message: { error: "Too many requests, please try again later" },
  standardHeaders: true,
  legacyHeaders: false,
});

export const strictRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 10, // 10 requests per minute for sensitive operations
  message: { error: "Too many requests, please try again later" },
  standardHeaders: true,
  legacyHeaders: false,
});

// Input sanitization helper
export function sanitizeString(input: string, maxLength: number = 1000): string {
  if (typeof input !== "string") return "";
  return input.trim().slice(0, maxLength);
}

// Validate Discord snowflake ID format
export function isValidSnowflake(id: string): boolean {
  if (typeof id !== "string") return false;
  // Discord snowflakes are 17-19 digit numbers
  return /^\d{17,19}$/.test(id);
}

// Validate guild ID parameter
export function validateGuildId(req: Request, res: Response, next: NextFunction) {
  const guildId = req.params.id || req.params.guildId;
  if (!guildId || !isValidSnowflake(guildId)) {
    return res.status(400).json({ error: "Invalid guild ID format" });
  }
  next();
}

// Validate user ID parameter
export function validateUserId(req: Request, res: Response, next: NextFunction) {
  const userId = req.params.userId;
  if (userId && !isValidSnowflake(userId)) {
    return res.status(400).json({ error: "Invalid user ID format" });
  }
  next();
}

// Security headers middleware
export function securityHeaders(req: Request, res: Response, next: NextFunction) {
  // Prevent clickjacking
  res.setHeader("X-Frame-Options", "DENY");
  // Prevent MIME type sniffing
  res.setHeader("X-Content-Type-Options", "nosniff");
  // XSS protection
  res.setHeader("X-XSS-Protection", "1; mode=block");
  // Referrer policy
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
}

// Request logging for audit trail
export function auditLog(action: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const userId = req.user?.id || "anonymous";
    const guildId = req.params.id || req.params.guildId || "N/A";
    const timestamp = new Date().toISOString();
    console.log(`[AUDIT] ${timestamp} | User: ${userId} | Guild: ${guildId} | Action: ${action} | IP: ${req.ip}`);
    next();
  };
}

// Validate JSON body has expected fields
export function validateBody(requiredFields: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.body || typeof req.body !== "object") {
      return res.status(400).json({ error: "Invalid request body" });
    }

    const missingFields = requiredFields.filter((field) => !(field in req.body));
    if (missingFields.length > 0) {
      return res.status(400).json({
        error: `Missing required fields: ${missingFields.join(", ")}`,
      });
    }
    next();
  };
}

// Validate language codes
export function isValidLanguageCode(code: string): boolean {
  const validCodes = ["EN", "ES", "PT-BR", "FR", "DE", "IT", "JA", "KO", "ZH"];
  return validCodes.includes(code);
}

// Validate array of language codes
export function validateLanguageCodes(codes: unknown): string[] | null {
  if (!Array.isArray(codes)) return null;
  const validCodes = codes.filter(
    (code) => typeof code === "string" && isValidLanguageCode(code)
  );
  return validCodes.length === codes.length ? validCodes : null;
}
