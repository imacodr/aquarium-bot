/**
 * Developer Authorization Middleware
 * Protects developer-only routes
 */

import { Request, Response, NextFunction } from "express";
import { isBotDeveloper } from "../../config/developer";

/**
 * Middleware to check if the authenticated user is a bot developer
 * Must be used after isAuthenticated middleware
 */
export function isDeveloper(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  isBotDeveloper(userId)
    .then((isDev) => {
      if (isDev) {
        return next();
      }
      return res.status(403).json({ error: "Developer access required" });
    })
    .catch((error) => {
      console.error("Error checking developer status:", error);
      return res.status(500).json({ error: "Failed to verify developer status" });
    });
}

/**
 * Middleware that adds developer status to request without blocking
 * Useful for conditionally showing developer features
 */
export function checkDeveloperStatus(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated() || !req.user?.id) {
    (req as any).isDeveloper = false;
    return next();
  }

  isBotDeveloper(req.user.id)
    .then((isDev) => {
      (req as any).isDeveloper = isDev;
      next();
    })
    .catch((error) => {
      console.error("Error checking developer status:", error);
      (req as any).isDeveloper = false;
      next();
    });
}
