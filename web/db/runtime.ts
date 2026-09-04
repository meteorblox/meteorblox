type D1Result<T> = { results?: T[] };

export type D1DatabaseLike = {
  prepare(query: string): {
    bind(...values: unknown[]): {
      all<T>(): Promise<D1Result<T>>;
      first<T>(): Promise<T | null>;
      run(): Promise<unknown>;
    };
    run(): Promise<unknown>;
  };
};

type SqliteStatement = {
  all(...values: unknown[]): unknown[];
  get(...values: unknown[]): unknown;
  run(...values: unknown[]): unknown;
};

type SqliteDatabase = {
  prepare(query: string): SqliteStatement;
};

const sqliteKey = Symbol.for("slvrblox.sqlite-store");

async function getSqlite(): Promise<D1DatabaseLike | null> {
  if (typeof process === "undefined" || !process.env.CHAT_DB_PATH) return null;
  const root = globalThis as typeof globalThis & { [sqliteKey]?: SqliteDatabase };
  if (!root[sqliteKey]) {
    const specifier = ["node", "sqlite"].join(":");
    const runtime = await import(/* @vite-ignore */ specifier) as { DatabaseSync: new (path: string) => SqliteDatabase };
    root[sqliteKey] = new runtime.DatabaseSync(process.env.CHAT_DB_PATH);
  }
  const database = root[sqliteKey];
  return {
    prepare(query: string) {
      const statement = database.prepare(query);
      const bound = (values: unknown[]) => ({
        async all<T>() { return { results: statement.all(...values) as T[] }; },
        async first<T>() { return (statement.get(...values) as T | undefined) ?? null; },
        async run() { return statement.run(...values); },
      });
      return {
        bind(...values: unknown[]) { return bound(values); },
        async run() { return statement.run(); },
      };
    },
  };
}

export async function getD1(): Promise<D1DatabaseLike | null> {
  const sqlite = await getSqlite();
  if (sqlite) return sqlite;
  try {
    // Keep the Cloudflare-only protocol out of Railway's Node module graph.
    const specifier = ["cloudflare", "workers"].join(":");
    const runtime = await import(/* @vite-ignore */ specifier) as { env?: { DB?: D1DatabaseLike } };
    return runtime.env?.DB ?? null;
  } catch {
    return null;
  }
}

type MemoryChat = { id: number; address: string; message: string; signature: string; createdAt: number };
type MemoryStore = { chats: MemoryChat[]; profiles: Map<string, string>; nextChatId: number };

const storeKey = Symbol.for("slvrblox.runtime-store");

export function getMemoryStore(): MemoryStore {
  const root = globalThis as typeof globalThis & { [storeKey]?: MemoryStore };
  root[storeKey] ??= { chats: [], profiles: new Map(), nextChatId: 1 };
  return root[storeKey];
}

