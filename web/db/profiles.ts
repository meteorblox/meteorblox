import { env } from "cloudflare:workers";

async function ensureProfilesTable() {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS wallet_profiles (
    address TEXT PRIMARY KEY NOT NULL,
    username TEXT NOT NULL COLLATE NOCASE UNIQUE,
    updated_at INTEGER NOT NULL
  )`).run();
}

export async function getProfiles(addresses: string[]) {
  await ensureProfilesTable();
  const unique = [...new Set(addresses.map((address) => address.toLowerCase()))].filter(Boolean);
  if (!unique.length) return new Map<string, string>();
  const placeholders = unique.map(() => "?").join(",");
  const result = await env.DB.prepare(`SELECT address, username FROM wallet_profiles WHERE address IN (${placeholders})`)
    .bind(...unique).all<{ address: string; username: string }>();
  return new Map((result.results ?? []).map((row) => [row.address, row.username]));
}

export async function saveProfile(address: string, username: string) {
  await ensureProfilesTable();
  await env.DB.prepare(`INSERT INTO wallet_profiles (address, username, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(address) DO UPDATE SET username = excluded.username, updated_at = excluded.updated_at`)
    .bind(address.toLowerCase(), username, Date.now()).run();
}
