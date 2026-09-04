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

export async function getD1(): Promise<D1DatabaseLike | null> {
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

