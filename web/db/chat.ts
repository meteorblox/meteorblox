import { getD1, getMemoryStore } from "./runtime";

export type ChatMessage = {
  id: number;
  address: string;
  username: string;
  message: string;
  createdAt: number;
};

async function ensureChatTable(db: NonNullable<Awaited<ReturnType<typeof getD1>>>) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    address TEXT NOT NULL,
    message TEXT NOT NULL,
    signature TEXT NOT NULL UNIQUE,
    created_at INTEGER NOT NULL
  )`).run();
  await db.prepare("CREATE INDEX IF NOT EXISTS chat_messages_created_at_idx ON chat_messages(created_at)").run();
}

export async function getChatMessages(limit = 100) {
  const boundedLimit = Math.min(Math.max(limit, 1), 100);
  const db = await getD1();
  if (!db) {
    const memory = getMemoryStore();
    return memory.chats.slice(-boundedLimit).map((item) => ({ ...item, username: memory.profiles.get(item.address) ?? "" }));
  }
  await ensureChatTable(db);
  const result = await db.prepare(`SELECT m.id, m.address, COALESCE(p.username, '') AS username,
      m.message, m.created_at AS createdAt
    FROM chat_messages m LEFT JOIN wallet_profiles p ON p.address = m.address
    ORDER BY m.id DESC LIMIT ?`).bind(boundedLimit).all<ChatMessage>();
  return (result.results ?? []).reverse();
}

export async function saveChatMessage(address: string, message: string, signature: string, createdAt: number) {
  const db = await getD1();
  if (!db) {
    const memory = getMemoryStore();
    const posts = memory.chats.filter((item) => item.address === address);
    const lastPost = posts.at(-1)?.createdAt ?? 0;
    if (lastPost && createdAt - lastPost < 10_000) throw new Error("Please wait 10 seconds before posting again");
    if (posts.filter((item) => item.createdAt >= createdAt - 3_600_000).length >= 20) throw new Error("Hourly message limit reached. Please try again later");
    if (memory.chats.some((item) => item.signature === signature)) throw new Error("Duplicate message");
    memory.chats.push({ id: memory.nextChatId++, address, message, signature, createdAt });
    if (memory.chats.length > 500) memory.chats.splice(0, memory.chats.length - 500);
    return;
  }
  await ensureChatTable(db);
  const recent = await db.prepare(`SELECT
      MAX(created_at) AS lastPost,
      SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS hourlyPosts
    FROM chat_messages WHERE address = ?`).bind(createdAt - 3_600_000, address).first<{ lastPost: number | null; hourlyPosts: number | null }>();
  if (recent?.lastPost && createdAt - recent.lastPost < 10_000) throw new Error("Please wait 10 seconds before posting again");
  if ((recent?.hourlyPosts ?? 0) >= 20) throw new Error("Hourly message limit reached. Please try again later");
  await db.prepare("INSERT INTO chat_messages (address, message, signature, created_at) VALUES (?, ?, ?, ?)")
    .bind(address, message, signature, createdAt).run();
}

