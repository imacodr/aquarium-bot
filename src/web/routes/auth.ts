import { Router } from "express";
import passport from "passport";
import { DASHBOARD_URL } from "../../config/constants";

const router = Router();

// Initiate Discord OAuth
router.get("/discord", passport.authenticate("discord"));

// OAuth callback
router.get(
  "/discord/callback",
  passport.authenticate("discord", {
    failureRedirect: `${DASHBOARD_URL}/login?error=auth_failed`,
  }),
  (req, res) => {
    // Successful authentication, redirect to dashboard
    res.redirect(`${DASHBOARD_URL}/dashboard`);
  }
);

// Logout - properly destroy session and clear cookie
router.get("/logout", (req, res, next) => {
  req.logout((err) => {
    if (err) {
      return next(err);
    }
    // Destroy session in database
    req.session.destroy((destroyErr) => {
      if (destroyErr) {
        console.error("Error destroying session:", destroyErr);
      }
      // Clear the session cookie
      res.clearCookie("lebron.sid", {
        path: "/",
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      });
      res.redirect(DASHBOARD_URL);
    });
  });
});

export default router;
