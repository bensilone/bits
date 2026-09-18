import bcrypt from "bcryptjs";
import { config } from "../config.js";
import { query } from "../db/pool.js";

async function ensureAdmin(username: string, password: string) {
  const { rows } = await query("SELECT id FROM admin_users WHERE username = $1", [
    username,
  ]);
  if (rows.length) return;
  const hash = await bcrypt.hash(password, 10);
  await query(
    "INSERT INTO admin_users (username, password_hash) VALUES ($1, $2)",
    [username, hash]
  );
  console.log(`Seeded admin user: ${username}`);
}

export async function seedAdmins() {
  await ensureAdmin(config.adminUser, config.adminPass);
  if (config.adminUser2) {
    await ensureAdmin(config.adminUser2, config.adminPass2);
  }
}

export async function seedSettings() {
  const defaults: Record<string, unknown> = {
    credits_per_entry: config.creditsPerEntry,
    nanopool_multiplier: config.nanopoolMultiplier,
    rates_version: config.ratesVersion,
    xmr_treasury_address: config.xmrTreasuryAddress,
  };
  for (const [key, value] of Object.entries(defaults)) {
    await query(
      `INSERT INTO app_settings (key, value)
       VALUES ($1, $2::jsonb)
       ON CONFLICT (key) DO NOTHING`,
      [key, JSON.stringify(value)]
    );
  }
}
