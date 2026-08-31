import { SuiGrpcClient } from "@mysten/sui/grpc";

const gameId = "0x2133b5403f7513b64ecd9d314d951e5969a6064f3682b3ac3d444a3ab95c2522";
const originPackageId = "0xb0097a3ef50e48294eb15a4a0fb7a1c9d2c421b217dc384e44cec478e4072771";
const entryEventType = `${originPackageId}::game::EntryPlaced`;
const rpcUrl = process.env.SUI_GRPC_URL ?? process.env.SUI_RPC_URL ?? "https://fullnode.testnet.sui.io:443";
const graphqlUrl = "https://graphql.testnet.sui.io/graphql";
const client = new SuiGrpcClient({ network: "testnet", baseUrl: rpcUrl });

type EntryJson = { player?: string; round?: string | number };
type IndexedEntry = { player: string; round: number; checkpoint: string };
type GameJson = { round: string; settled: boolean };
type Level = { name: string; rounds: number; days: number };

const levels: Level[] = [
  { name: "BLOX TESTER", rounds: 25, days: 5 },
  { name: "ACTIVE MINER", rounds: 75, days: 10 },
  { name: "CORE TESTER", rounds: 200, days: 20 },
  { name: "MASTER MINER", rounds: 1_000, days: 30 },
];

let entryCache: { expiresAt: number; entries: IndexedEntry[] } | null = null;
const checkpointDayCache = new Map<string, string>();

async function loadEntryIndex() {
  if (entryCache && entryCache.expiresAt > Date.now()) return entryCache.entries;
  const entries: IndexedEntry[] = [];
  let before: string | null = null;
  let pageCount = 0;

  do {
    const page = await client.core.listEvents({
      filter: { eventType: entryEventType },
      limit: 50,
      order: "descending",
      ...(before ? { before } : {}),
    });
    for (const event of page.events) {
      const json = event.json as EntryJson | null;
      const round = Number(json?.round);
      const player = json?.player?.toLowerCase();
      if (player && Number.isSafeInteger(round) && event.checkpoint) entries.push({ player, round, checkpoint: event.checkpoint });
    }
    pageCount += 1;
    if (!page.hasNextPage) break;
    if (!page.endCursor || page.endCursor === before) throw new Error("Entry history pagination stalled");
    before = page.endCursor;
  } while (pageCount < 1_000);

  entryCache = { entries, expiresAt: Date.now() + 5 * 60_000 };
  return entries;
}

async function loadCheckpointDays(checkpoints: string[]) {
  const missing = checkpoints.filter((checkpoint) => !checkpointDayCache.has(checkpoint));
  for (let offset = 0; offset < missing.length; offset += 40) {
    const batch = missing.slice(offset, offset + 40);
    const fields = batch.map((checkpoint, index) => `c${index}: checkpoint(sequenceNumber: ${checkpoint}) { timestamp }`).join("\n");
    const response = await fetch(graphqlUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: `query CheckpointDates { ${fields} }` }),
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Checkpoint date request failed (${response.status})`);
    const payload = await response.json() as { data?: Record<string, { timestamp?: string } | null>; errors?: unknown[] };
    if (!payload.data || payload.errors?.length) throw new Error("Checkpoint dates unavailable");
    batch.forEach((checkpoint, index) => {
      const timestamp = payload.data?.[`c${index}`]?.timestamp;
      if (timestamp) checkpointDayCache.set(checkpoint, timestamp.slice(0, 10));
    });
  }
  return new Set(checkpoints.map((checkpoint) => checkpointDayCache.get(checkpoint)).filter((day): day is string => Boolean(day)));
}

export async function GET(request: Request) {
  try {
    const address = new URL(request.url).searchParams.get("address")?.toLowerCase() ?? "";
    if (!/^0x[a-f0-9]{64}$/.test(address)) return Response.json({ error: "Valid Sui wallet address required" }, { status: 400 });

    const [{ object }, entries] = await Promise.all([
      client.core.getObject({ objectId: gameId, include: { json: true } }),
      loadEntryIndex(),
    ]);
    const game = object.json as GameJson;
    const currentRound = Number(game.round);
    const roundCheckpoints = new Map<number, string>();
    for (const entry of entries) {
      if (entry.player !== address) continue;
      if (entry.round > currentRound || (entry.round === currentRound && !game.settled)) continue;
      if (!roundCheckpoints.has(entry.round)) roundCheckpoints.set(entry.round, entry.checkpoint);
    }

    const activeDays = await loadCheckpointDays([...roundCheckpoints.values()]);
    const rounds = roundCheckpoints.size;
    const days = activeDays.size;
    const achieved = levels.filter((level) => rounds >= level.rounds && days >= level.days).at(-1) ?? null;
    const next = levels.find((level) => rounds < level.rounds || days < level.days) ?? null;
    const progress = next ? Math.min(100, Math.floor(Math.min(rounds / next.rounds, days / next.days) * 100)) : 100;

    return Response.json({
      address,
      qualifyingRounds: rounds,
      activeDays: days,
      currentLevel: achieved?.name ?? "TESTNET PROSPECTOR",
      nextLevel: next,
      progress,
      levels,
      methodology: "Unique settled EntryPlaced rounds and UTC activity days reconstructed from Sui Testnet events.",
      updatedAt: new Date().toISOString(),
    }, { headers: { "cache-control": "public, max-age=60, s-maxage=300" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Airdrop progress unavailable" }, { status: 502, headers: { "cache-control": "no-store" } });
  }
}
