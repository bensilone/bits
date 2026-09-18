import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config.js";

export interface AdminClaims {
  sub: string;
  username: string;
}

declare global {
  namespace Express {
    interface Request {
      admin?: AdminClaims;
    }
  }
}

export function signAdminToken(username: string, id: number): string {
  return jwt.sign(
    { sub: String(id), username } satisfies AdminClaims,
    config.jwtSecret,
    { expiresIn: "7d" }
  );
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const cookie = req.cookies?.sparks_admin;
  const token =
    (header?.startsWith("Bearer ") ? header.slice(7) : null) || cookie || null;
  if (!token) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  try {
    const claims = jwt.verify(token, config.jwtSecret) as AdminClaims;
    req.admin = claims;
    next();
  } catch {
    res.status(401).json({ error: "unauthorized" });
  }
}
