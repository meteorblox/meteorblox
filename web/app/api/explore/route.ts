import { SuiGraphQLClient } from "@mysten/sui/graphql";
import { getD1 } from "../../../db/runtime";

const packageId = "0xb0097a3ef50e48294eb15a4a0fb7a1c9d2c421b217dc384e44cec478e4072771";
// Sui event types retain the package version where the struct was introduced.
const motherlodePackageId = "0x0de2330f503784f12b4abf7484f336976149e4056784ebb1709a4c38889e0b99";
const eventClient = new SuiGraphQLClient({ network: "testnet", url: "https://graphql.testnet.sui.io/graphql" });
const cacheTtlMs = 15_000;
const responseCache = new Map<string, { expiresAt: number; data: unknown }>();
const inFlight = new Map<string, Promise<unknown>>();

type EventRecord = { json?: Record<string, unknown>; timestamp?: string | null; transactionDigest?: string | null };
type MotherloadHistory = { round: number; winningTile: number; winnerType: string; winnerAddress: string | null; winnerCount: number; deployedSui: number; vaultedSui: number; winningsSui: number; payoutDslvr: number; transaction: string | null; timestamp: string | null; hit: true };
const sui = (value: unknown) => Number(BigInt(String(value ?? "0"))) / 1_000_000_000;
const dslvr = (value: unknown) => Number(BigInt(String(value ?? "0"))) / 1_000_000;
const asBigInt = (value: unknown) => BigInt(String(value ?? "0"));

async function recentEvents(eventType: string, pages = 6) {
  const events: EventRecord[] = [];
  let before: string | null | undefined;
  for (let page = 0; page < pages; page += 1) {
    const result = await eventClient.core.listEvents({ filter: { eventType }, limit: 50, order: "descending", ...(before ? { before } : {}) });
    events.push(...result.events as EventRecord[]);
    if (!result.hasNextPage || !result.endCursor) break;
    before = result.endCursor;
  }
  return events;
}

async function historyDb() {
  const db = await getD1();
  if (!db) return null;
  await db.prepare(`CREATE TABLE IF NOT EXISTS motherload_history (
    round INTEGER PRIMARY KEY, winning_tile INTEGER NOT NULL, winner_type TEXT NOT NULL,
    winner_address TEXT, winner_count INTEGER NOT NULL, deployed_sui REAL NOT NULL,
    vaulted_sui REAL NOT NULL, winnings_sui REAL NOT NULL, payout_dslvr REAL NOT NULL,
    transaction_digest TEXT, timestamp TEXT
  )`).run();
  return db;
}

async function saveMotherload(record: MotherloadHistory) {
  const db = await historyDb();
  if (!db) return;
  await db.prepare(`INSERT INTO motherload_history
    (round, winning_tile, winner_type, winner_address, winner_count, deployed_sui, vaulted_sui, winnings_sui, payout_dslvr, transaction_digest, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(round) DO UPDATE SET winning_tile=excluded.winning_tile, winner_type=excluded.winner_type,
    winner_address=excluded.winner_address, winner_count=excluded.winner_count, deployed_sui=excluded.deployed_sui,
    vaulted_sui=excluded.vaulted_sui, winnings_sui=excluded.winnings_sui, payout_dslvr=excluded.payout_dslvr,
    transaction_digest=excluded.transaction_digest, timestamp=excluded.timestamp`)
    .bind(record.round, record.winningTile, record.winnerType, record.winnerAddress, record.winnerCount, record.deployedSui, record.vaultedSui, record.winningsSui, record.payoutDslvr, record.transaction, record.timestamp).run();
}

async function storedMotherloads() {
  const db = await historyDb();
  if (!db) return [] as MotherloadHistory[];
  const result = await db.prepare(`SELECT round, winning_tile AS winningTile, winner_type AS winnerType,
    winner_address AS winnerAddress, winner_count AS winnerCount, deployed_sui AS deployedSui,
    vaulted_sui AS vaultedSui, winnings_sui AS winningsSui, payout_dslvr AS payoutDslvr,
    transaction_digest AS transactionDigest, timestamp FROM motherload_history ORDER BY round DESC LIMIT 100`).bind().all<MotherloadHistory & { transactionDigest: string | null }>();
  return (result.results ?? []).map((row) => ({ ...row, transaction: row.transactionDigest, hit: true as const }));
}

async function motherloadFromTransaction(event: EventRecord): Promise<MotherloadHistory | null> {
  if (!event.transactionDigest) return null;
  const result = await eventClient.core.getTransaction({ digest: event.transactionDigest, include: { events: true } });
  const tx = result.Transaction ?? result.FailedTransaction;
  const events = tx?.events ?? [];
  const settled = events.find((item) => item.eventType.endsWith("::game::RoundSettled"));
  if (!settled?.json) return null;
  const round = Number(event.json?.round ?? settled.json.round ?? 0);
  const claims = events.filter((item) => item.eventType.endsWith("::game::WinningsClaimed") && Number(item.json?.round ?? 0) === round);
  const wallets = [...new Set(claims.map((item) => String(item.json?.player ?? "").toLowerCase()).filter(Boolean))];
  const gross = asBigInt(settled.json.gross);
  const winnerPool = asBigInt(settled.json.winner_pool);
  const paidDslvr = claims.reduce((sum, item) => sum + asBigInt(item.json?.dslvr_amount), 0n);
  return { round, winningTile: Number(settled.json.winning_tile ?? event.json?.tile ?? 0) + 1,
    winnerType: wallets.length > 1 ? "split" : wallets.length === 1 ? "individual" : "pending",
    winnerAddress: wallets.length === 1 ? wallets[0] : null, winnerCount: wallets.length,
    deployedSui: sui(gross), vaultedSui: sui(gross - winnerPool), winningsSui: sui(winnerPool),
    payoutDslvr: Math.max(0, dslvr(paidDslvr) - 0.25), transaction: event.transactionDigest,
    timestamp: event.timestamp ?? null, hit: true };
}

async function loadExplore(requestedPlayer: string) {
    const existingHistory = await storedMotherloads();
    const motherloadPages = existingHistory.length ? 3 : 40;
    const [settledEvents, entryEvents, motherlodeEvents, winnings] = await Promise.all([
      recentEvents(`${packageId}::game::RoundSettled`, 3),
      recentEvents(`${packageId}::game::EntryPlaced`),
      recentEvents(`${motherlodePackageId}::game::MotherlodeUpdated`, motherloadPages),
      recentEvents(`${packageId}::game::WinningsClaimed`),
    ]);
    const indexedHits = await Promise.all(motherlodeEvents.filter((event) => Boolean(event.json?.hit)).map(motherloadFromTransaction));
    await Promise.all(indexedHits.filter((record): record is MotherloadHistory => Boolean(record)).map(saveMotherload));
    const durableMotherloads = await storedMotherloads();
    const entries = entryEvents;
    const motherlodeHits = new Set(motherlodeEvents.filter((event) => Boolean(event.json?.hit)).map((event) => Number(event.json?.round ?? 0)));
    const miners = new Set(entries.map((event) => String(event.json?.player ?? "").toLowerCase()).filter(Boolean));
    const rounds = settledEvents.map((event) => {
      const round = Number(event.json?.round ?? 0);
      const gross = asBigInt(event.json?.gross);
      const winnerPool = asBigInt(event.json?.winner_pool);
      const claims = winnings.filter((claim) => Number(claim.json?.round ?? 0) === round);
      const winningWallets = [...new Set(claims.map((claim) => String(claim.json?.player ?? "").toLowerCase()).filter(Boolean))];
      const dslvrPaid = claims.reduce((sum, claim) => sum + asBigInt(claim.json?.dslvr_amount), 0n);
      return {
        round,
        winningTile: Number(event.json?.winning_tile ?? 0) + 1,
        winnerType: winningWallets.length > 1 ? "split" : winningWallets.length === 1 ? "individual" : "pending",
        winnerAddress: winningWallets.length === 1 ? winningWallets[0] : null,
        winnerCount: winningWallets.length,
        winningEntries: claims.length,
        deployedSui: sui(gross),
        vaultedSui: sui(gross - winnerPool),
        winningsSui: sui(winnerPool),
        dslvrWinnings: dslvr(dslvrPaid),
        rewardPoolSui: sui(winnerPool),
        transaction: event.transactionDigest ?? null,
        timestamp: event.timestamp ?? null,
      };
    });
    const audit = rounds.slice(0, 10).map((round) => {
      const settled = settledEvents.find((event) => Number(event.json?.round ?? 0) === round.round);
      const gross = asBigInt(settled?.json?.gross);
      const winnerPool = asBigInt(settled?.json?.winner_pool);
      const protocolFee = gross * 1_000n / 10_000n;
      const expectedWinnerPool = gross - protocolFee;
      const treasury = gross * 500n / 10_000n;
      const rewards = gross * 200n / 10_000n;
      const keeper = gross * 100n / 10_000n;
      const ops = protocolFee - treasury - rewards - keeper;
      const claims = winnings.filter((event) => Number(event.json?.round ?? 0) === round.round);
      const paidSui = claims.reduce((sum, event) => sum + asBigInt(event.json?.amount), 0n);
      const paidDslvr = claims.reduce((sum, event) => sum + asBigInt(event.json?.dslvr_amount), 0n);
      const poolMatches = winnerPool === expectedWinnerPool;
      const payoutsMatch = claims.length > 0 && paidSui === winnerPool;
      // A hit pays the accumulated Motherload in the same WinningsClaimed events
      // as the normal 0.25 DSLVR round reward.
      const dslvrMatches = claims.length > 0 && (motherlodeHits.has(round.round) ? paidDslvr >= 250_000n : paidDslvr === 250_000n);
      return {
        round: round.round,
        expectedWinnerPoolSui: sui(expectedWinnerPool), actualWinnerPoolSui: sui(winnerPool),
        treasurySui: sui(treasury), rewardsSui: sui(rewards), opsSui: sui(ops), keeperSui: sui(keeper),
        paidSui: sui(paidSui), paidDslvr: dslvr(paidDslvr), winnerClaims: claims.length,
        status: poolMatches && payoutsMatch && dslvrMatches ? "pass" : claims.length ? "mismatch" : "pending",
      };
    });
    const personalByRound = new Map<number, { round: number; tiles: Set<number>; deployed: bigint; winnings: bigint; dslvr: bigint; transaction: string | null; timestamp: string | null }>();
    if (/^0x[0-9a-f]{64}$/.test(requestedPlayer)) {
      for (const event of entries) {
        if (String(event.json?.player ?? "").toLowerCase() !== requestedPlayer) continue;
        const round = Number(event.json?.round ?? 0);
        const record = personalByRound.get(round) ?? { round, tiles: new Set<number>(), deployed: 0n, winnings: 0n, dslvr: 0n, transaction: event.transactionDigest ?? null, timestamp: event.timestamp ?? null };
        record.tiles.add(Number(event.json?.tile ?? 0) + 1);
        record.deployed += asBigInt(event.json?.amount);
        personalByRound.set(round, record);
      }
      for (const claim of winnings) {
        if (String(claim.json?.player ?? "").toLowerCase() !== requestedPlayer) continue;
        const round = Number(claim.json?.round ?? 0);
        const record = personalByRound.get(round);
        if (!record) continue;
        record.winnings += asBigInt(claim.json?.amount);
        record.dslvr += asBigInt(claim.json?.dslvr_amount);
      }
    }
    return {
      packageId,
      indexedEntries: entries.length,
      indexedMiners: miners.size,
      indexedDeployedSui: entries.reduce((sum, event) => sum + sui(event.json?.amount), 0),
      rounds,
      audit,
      auditSummary: { checked: audit.length, passed: audit.filter((item) => item.status === "pass").length, mismatches: audit.filter((item) => item.status === "mismatch").length, pending: audit.filter((item) => item.status === "pending").length },
      personal: [...personalByRound.values()].sort((a, b) => b.round - a.round).map((record) => ({
        round: record.round, tiles: [...record.tiles].sort((a, b) => a - b), deployedSui: sui(record.deployed),
        winningsSui: sui(record.winnings), dslvrWinnings: dslvr(record.dslvr), won: record.winnings > 0n || record.dslvr > 0n,
        transaction: record.transaction, timestamp: record.timestamp,
      })),
      motherlodes: durableMotherloads.length ? durableMotherloads : motherlodeEvents.map((event) => {
        const round = Number(event.json?.round ?? 0);
        const hit = Boolean(event.json?.hit);
        const settledRound = rounds.find((item) => item.round === round);
        // The event balance is deliberately reset to zero after a hit. Derive the
        // actual payout from winner claims, excluding the regular 0.25 DSLVR reward.
        const payoutDslvr = hit ? Math.max(0, (settledRound?.dslvrWinnings ?? 0) - 0.25) : 0;
        return {
          round, winningTile: Number(event.json?.tile ?? 0) + 1,
          addedDslvr: dslvr(event.json?.added), balanceDslvr: dslvr(event.json?.balance), payoutDslvr, hit,
          transaction: event.transactionDigest ?? null, timestamp: event.timestamp ?? null,
        };
      }),
    };
}

export async function GET(request: Request) {
  const requestedPlayer = new URL(request.url).searchParams.get("address")?.toLowerCase() ?? "";
  const cacheKey = /^0x[0-9a-f]{64}$/.test(requestedPlayer) ? requestedPlayer : "public";
  const cached = responseCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return Response.json(cached.data, { headers: { "cache-control": "public, max-age=5, stale-while-revalidate=15", "x-slvrblox-cache": "hit" } });
  }
  try {
    let pending = inFlight.get(cacheKey);
    if (!pending) {
      pending = loadExplore(requestedPlayer);
      inFlight.set(cacheKey, pending);
    }
    const data = await pending;
    responseCache.set(cacheKey, { data, expiresAt: Date.now() + cacheTtlMs });
    return Response.json(data, { headers: { "cache-control": "public, max-age=5, stale-while-revalidate=15", "x-slvrblox-cache": "miss" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Explore activity unavailable" }, { status: 502, headers: { "cache-control": "no-store" } });
  } finally {
    inFlight.delete(cacheKey);
  }
}
