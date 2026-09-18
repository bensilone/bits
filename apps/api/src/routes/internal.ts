import { Router, type Request, type Response, type NextFunction } from "express";
import crypto from "node:crypto";
import { config } from "../config.js";
import { pollNanopool } from "../services/nanopool.js";

export const internalRouter = Router();

function timingSafeEqualString(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    // Still compare to avoid leaking length via early return timing alone on short paths.
    crypto.timingSafeEqual(bufA, Buffer.alloc(bufA.length));
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Require header: X-Sparks-Poll-Secret: $INTERNAL_POLL_SECRET
 * Used by Cloud Scheduler — do not leave poll endpoints public.
 */
function requirePollSecret(req: Request, res: Response, next: NextFunction) {
  const expected = config.internalPollSecret;
  if (!expected) {
    res.status(503).json({ error: "poll_secret_not_configured" });
    return;
  }
  const provided = req.headers["x-sparks-poll-secret"];
  if (typeof provided !== "string" || !timingSafeEqualString(provided, expected)) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  next();
}

/**
 * POST /v1/internal/poll-nanopool
 * Cloud Scheduler target. Header: X-Sparks-Poll-Secret
 */
internalRouter.post("/poll-nanopool", requirePollSecret, async (_req, res) => {
  const result = await pollNanopool();
  res.json(result);
});
