import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });
dotenv.config();

function num(name: string, fallback: number): number {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export const config = {
  port: num("PORT", 8787),
  nodeEnv: process.env.NODE_ENV ?? "development",
  databaseUrl:
    process.env.DATABASE_URL ?? "postgres://sparks:sparks@localhost:5432/sparks",
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
  jwtSecret: process.env.JWT_SECRET ?? "dev-jwt-secret-change-me",
  sessionSecret: process.env.SESSION_SECRET ?? "dev-session-secret",
  adminUser: process.env.ADMIN_USER ?? "admin",
  adminPass: process.env.ADMIN_PASS ?? "changeme",
  adminUser2: process.env.ADMIN_USER_2 ?? "admin2",
  adminPass2: process.env.ADMIN_PASS_2 ?? "changeme2",
  xmrTreasuryAddress: process.env.XMR_TREASURY_ADDRESS ?? "",
  creditsPerEntry: num("CREDITS_PER_ENTRY", 1000),
  nanopoolMultiplier: num("NANOPOOL_MULTIPLIER", 1.0),
  ratesVersion: num("RATES_VERSION", 1),
  isDev: (process.env.NODE_ENV ?? "development") !== "production",
};
