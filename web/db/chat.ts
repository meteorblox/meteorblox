import { env } from "cloudflare:workers";

export type ChatMessage = {
  id: number;
  address: string;
  username: string;
  message: string;
  createdAt: number;
};

async function ensureChatTable() {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    address TEXT NOT NULL,
    message TEXT NOT NULL,
    signature TEXT NOT NULL UNIQUE,
    created_at INTEGER NOT NULL
  )`).run();
  await env.DB.prepare("CREATE INDEX IF NOT EXISTS chat_messages_created_at_idx ON chat_messages(created_at)").run();
}

export async function getChatMessages(limit = 100) {
  await ensureChatTable();
  const result = await env.DB.prepare(`SELECT m.id, m.address, COALESCE(p.username, '') AS username,
      m.message, m.created_at AS createdAt
    FROM chat_messages m LEFT JOIN wallet_profiles p ON p.address = m.address
    ORDER BY m.id DESC LIMIT ?`).bind(Math.min(Math.max(limit, 1), 100)).all<ChatMessage>();
  return (result.results ?? []).reverse();
}

export async function saveChatMessage(address: string, message: string, signature: string, createdAt: number) {
  await ensureChatTable();
  const recent = await env.DB.prepare(`SELECT
      MAX(created_at) AS lastPost,
      SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS hourlyPosts
    FROM chat_messages WHERE address = ?`).bind(createdAt - 3_600_000, address).first<{ lastPost: number | null; hourlyPosts: number | null }>();
  if (recent?.lastPost && createdAt - recent.lastPost < 10_000) throw new Error("Please wait 10 seconds before posting again");
  if ((recent?.hourlyPosts ?? 0) >= 20) throw new Error("Hourly message limit reached. Please try again later");
  await env.DB.prepare("INSERT INTO chat_messages (address, message, signature, created_at) VALUES (?, ?, ?, ?)")
    .bind(address, message, signature, createdAt).run();
}
