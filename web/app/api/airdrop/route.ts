import { SuiGrpcClient } from "@mysten/sui/grpc";
import { getProfiles } from "../../../db/profiles";

const gameId = "0x2133b5403f7513b64ecd9d314d951e5969a6064f3682b3ac3d444a3ab95c2522";
const originPackageId = "0xb0097a3ef50e48294eb15a4a0fb7a1c9d2c421b217dc384e44cec478e4072771";
const entryEventType = `${originPackageId}::game::EntryPlaced`;
const rpcUrl = process.env.SUI_GRPC_URL ?? process.env.SUI_RPC_URL ?? "https://fullnode.testnet.sui.io:443";
const graphqlUrl = "https://graphql.testnet.sui.io/graphql";
export const dailyQualifyingRoundCap = 50;
const client = new SuiGrpcClient({ network: "testnet", baseUrl: rpcUrl });

type EntryJson = { player?: string; round?: string | number };
type IndexedEntry = { player: string; round: number; checkpoint: string };
type GameJson = { round: string; settled: boolean };
type Level = { name: string; rounds: number; days: number };

export const levels: Level[] = [
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

  let historyComplete = false;
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
    if (!page.hasNextPage) { historyComplete = true; break; }
    if (!page.endCursor || page.endCursor === before) throw new Error("Entry history pagination stalled");
    before = page.endCursor;
  } while (pageCount < 1_000);

  if (!historyComplete) throw new Error("Entry history exceeds the safe pagination limit");

  entryCache = { entries, expiresAt: Date.now() + 5 * 60_000 };
  return entries;
}

async function loadCheckpointDays(checkpoints: string[]) {
  const unique = [...new Set(checkpoints)];
  const missing = unique.filter((checkpoint) => !checkpointDayCache.has(checkpoint));
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
}

export function settledEntries(entries: IndexedEntry[], game: GameJson) {
  const currentRound = Number(game.round);
  return entries.filter((entry) => entry.round < currentRound || (entry.round === currentRound && game.settled));
}

export function summarize(player: string, entries: IndexedEntry[], checkpointDays: ReadonlyMap<string, string> = checkpointDayCache) {
  const roundCheckpoints = new Map<number, string>();
  for (const entry of entries) {
    if (entry.player !== player) continue;
    const existing = roundCheckpoints.get(entry.round);
    if (!existing || BigInt(entry.checkpoint) < BigInt(existing)) roundCheckpoints.set(entry.round, entry.checkpoint);
  }
  const roundsByDay = new Map<string, number>();
  for (const checkpoint of roundCheckpoints.values()) {
    const day = checkpointDays.get(checkpoint);
    if (day) roundsByDay.set(day, (roundsByDay.get(day) ?? 0) + 1);
  }
  const days = roundsByDay.size;
  const rounds = [...roundsByDay.values()].reduce((total, dailyRounds) => total + Math.min(dailyRounds, dailyQualifyingRoundCap), 0);
  const achievedIndex = levels.findLastIndex((level) => rounds >= level.rounds && days >= level.days);
  const achieved = achievedIndex >= 0 ? levels[achievedIndex] : null;
  const next = levels.find((level) => rounds < level.rounds || days < level.days) ?? null;
  const currentLevel = achieved?.name === "MASTER MINER" ? "MASTER MINER (PROVISIONAL)" : achieved?.name ?? "TESTNET PROSPECTOR";
  return { address: player, qualifyingRounds: rounds, activeDays: days, currentLevel, levelRank: achievedIndex + 1, nextLevel: next };
}

export function qualificationProgress(summary: ReturnType<typeof summarize>) {
  return summary.nextLevel ? Math.min(100, Math.floor(Math.min(summary.qualifyingRounds / summary.nextLevel.rounds, summary.activeDays / summary.nextLevel.days) * 100)) : 100;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const address = url.searchParams.get("address")?.toLowerCase() ?? "";
    const leaderboardRequested = url.searchParams.get("leaderboard") === "1";
    if (!leaderboardRequested && !/^0x[a-f0-9]{64}$/.test(address)) return Response.json({ error: "Valid Sui wallet address required" }, { status: 400 });

    const [{ object }, entries] = await Promise.all([
      client.core.getObject({ objectId: gameId, include: { json: true } }),
      loadEntryIndex(),
    ]);
    const settled = settledEntries(entries, object.json as GameJson);
    await loadCheckpointDays(settled.map((entry) => entry.checkpoint));

    if (leaderboardRequested) {
      const players = [...new Set(settled.map((entry) => entry.player))];
      const profiles = await getProfiles(players);
      const testers = players.map((player) => summarize(player, settled))
        .sort((a, b) => b.levelRank - a.levelRank || b.activeDays - a.activeDays || b.qualifyingRounds - a.qualifyingRounds || a.address.localeCompare(b.address))
        .slice(0, 25)
        .map(({ levelRank: _levelRank, nextLevel: _nextLevel, ...tester }, index) => ({ rank: index + 1, ...tester, username: profiles.get(tester.address) ?? "" }));
      return Response.json({ testers, totalTesters: players.length, methodology: `Ranked by achieved level, active UTC days, then qualifying settled rounds, capped at ${dailyQualifyingRoundCap} per UTC day. Master Miner remains provisional until final manual-action review.`, updatedAt: new Date().toISOString() }, { headers: { "cache-control": "public, max-age=60, s-maxage=300" } });
    }

    const summary = summarize(address, settled);
    const progress = qualificationProgress(summary);
    return Response.json({
      address,
      qualifyingRounds: summary.qualifyingRounds,
      activeDays: summary.activeDays,
      currentLevel: summary.currentLevel,
      nextLevel: summary.nextLevel,
      progress,
      levels,
      methodology: `Unique settled wallet EntryPlaced rounds and UTC activity days reconstructed from Sui Testnet events, capped at ${dailyQualifyingRoundCap} qualifying rounds per UTC day. Idle simulation does not create wallet EntryPlaced events. Master Miner remains provisional until final manual-action review.`,
      updatedAt: new Date().toISOString(),
    }, { headers: { "cache-control": "public, max-age=60, s-maxage=300" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Airdrop progress unavailable" }, { status: 502, headers: { "cache-control": "no-store" } });
  }
}
