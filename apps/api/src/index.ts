import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import { pool } from "./db/pool.js";
import { seedAdmins, seedSettings } from "./services/seed.js";
import { devicesRouter } from "./routes/devices.js";
import { publicRouter } from "./routes/public.js";
import { adminRouter } from "./routes/admin.js";
import { devRouter } from "./routes/dev.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function runMigrations() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  const dir = path.join(__dirname, "db/migrations");
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    const { rows } = await pool.query(
      "SELECT 1 FROM schema_migrations WHERE filename = $1",
      [file]
    );
    if (rows.length) continue;
    const sql = fs.readFileSync(path.join(dir, file), "utf8");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [
        file,
      ]);
      await client.query("COMMIT");
      console.log(`Migrated ${file}`);
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }
}

async function main() {
  await runMigrations();
  await seedAdmins();
  await seedSettings();

  const app = express();
  const allowedOrigins = config.corsOrigin.split(",").map((s) => s.trim()).filter(Boolean);
  const tauriOrigins = new Set([
    "tauri://localhost",
    "http://tauri.localhost",
    "https://tauri.localhost",
  ]);
  // Chrome/WKWebView private-network preflight (Access-Control-Request-Private-Network)
  app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Private-Network", "true");
    if (
      req.method === "OPTIONS" &&
      req.headers["access-control-request-private-network"] === "true"
    ) {
      const origin = req.headers.origin;
      if (
        !origin ||
        allowedOrigins.includes(origin) ||
        allowedOrigins.includes("*") ||
        tauriOrigins.has(origin) ||
        (config.isDev &&
          /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin))
      ) {
        if (origin) res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Access-Control-Allow-Credentials", "true");
        res.setHeader(
          "Access-Control-Allow-Methods",
          "GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS"
        );
        const reqHeaders = req.headers["access-control-request-headers"];
        if (reqHeaders) {
          res.setHeader("Access-Control-Allow-Headers", reqHeaders);
        }
        return res.status(204).end();
      }
    }
    next();
  });
  app.use(
    cors({
      origin(origin, cb) {
        // Non-browser / same-origin tools (no Origin header)
        if (!origin) return cb(null, true);
        if (allowedOrigins.includes(origin) || allowedOrigins.includes("*")) {
          return cb(null, true);
        }
        // Packaged Tauri WebView origins (WKWebView / WebView2)
        if (tauriOrigins.has(origin)) {
          return cb(null, true);
        }
        // Local Tauri/Vite ports during development
        if (
          config.isDev &&
          /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
        ) {
          return cb(null, true);
        }
        return cb(new Error(`CORS blocked for origin: ${origin}`));
      },
      credentials: true,
    })
  );
  app.use(express.json());
  app.use(cookieParser(config.sessionSecret));

  app.get("/health", (_req, res) => res.json({ ok: true, service: "sparks-api" }));

  app.use("/v1/devices", devicesRouter);
  app.use("/v1/public", publicRouter);
  app.use("/v1/admin", adminRouter);
  app.use("/v1/dev", devRouter);

  // Spec path alias
  app.use("/v1", publicRouter);

  app.use(
    (
      err: Error,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      console.error(err);
      res.status(500).json({ error: "internal_error", message: err.message });
    }
  );

  app.listen(config.port, () => {
    console.log(`Sparks API listening on http://localhost:${config.port}`);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
