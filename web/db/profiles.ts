import { getD1, getMemoryStore } from "./runtime";

async function ensureProfilesTable(db: NonNullable<Awaited<ReturnType<typeof getD1>>>) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS wallet_profiles (
    address TEXT PRIMARY KEY NOT NULL,
    username TEXT NOT NULL COLLATE NOCASE UNIQUE,
    updated_at INTEGER NOT NULL
  )`).run();
}

export async function getProfiles(addresses: string[]) {
  const unique = [...new Set(addresses.map((address) => address.toLowerCase()))].filter(Boolean);
  if (!unique.length) return new Map<string, string>();
  const db = await getD1();
  if (!db) {
    const profiles = getMemoryStore().profiles;
    return new Map(unique.flatMap((address) => profiles.has(address) ? [[address, profiles.get(address)!] as const] : []));
  }
  await ensureProfilesTable(db);
  const placeholders = unique.map(() => "?").join(",");
  const result = await db.prepare(`SELECT address, username FROM wallet_profiles WHERE address IN (${placeholders})`)
    .bind(...unique).all<{ address: string; username: string }>();
  return new Map((result.results ?? []).map((row) => [row.address, row.username]));
}

export async function saveProfile(address: string, username: string) {
  const db = await getD1();
  if (!db) {
    const profiles = getMemoryStore().profiles;
    for (const [savedAddress, savedUsername] of profiles) {
      if (savedAddress !== address.toLowerCase() && savedUsername.toLowerCase() === username.toLowerCase()) throw new Error("UNIQUE username");
    }
    profiles.set(address.toLowerCase(), username);
    return;
  }
  await ensureProfilesTable(db);
  await db.prepare(`INSERT INTO wallet_profiles (address, username, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(address) DO UPDATE SET username = excluded.username, updated_at = excluded.updated_at`)
    .bind(address.toLowerCase(), username, Date.now()).run();
}

