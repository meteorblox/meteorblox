import { SuiGraphQLClient } from "@mysten/sui/graphql";

const packageId = "0xb0097a3ef50e48294eb15a4a0fb7a1c9d2c421b217dc384e44cec478e4072771";
const motherlodePackageId = "0x4beb56bfd9be58feaa10d815500e982d8b97a1cad23b2c19540c77f89a7a230a";
const eventClient = new SuiGraphQLClient({ network: "testnet", url: "https://graphql.testnet.sui.io/graphql" });

type EventRecord = { json?: Record<string, unknown>; timestamp?: string | null; transactionDigest?: string | null };
const sui = (value: unknown) => Number(BigInt(String(value ?? "0"))) / 1_000_000_000;
const dslvr = (value: unknown) => Number(BigInt(String(value ?? "0"))) / 1_000_000;

export async function GET() {
  try {
    const [settledResult, entryResult, motherlodeResult] = await Promise.all([
      eventClient.core.listEvents({ filter: { eventType: `${packageId}::game::RoundSettled` }, limit: 25, order: "descending" }),
      eventClient.core.listEvents({ filter: { eventType: `${packageId}::game::EntryPlaced` }, limit: 50, order: "descending" }),
      eventClient.core.listEvents({ filter: { eventType: `${motherlodePackageId}::game::MotherlodeUpdated` }, limit: 25, order: "descending" }),
    ]);
    const entries = entryResult.events as EventRecord[];
    const miners = new Set(entries.map((event) => String(event.json?.player ?? "").toLowerCase()).filter(Boolean));
    return Response.json({
      packageId,
      indexedEntries: entries.length,
      indexedMiners: miners.size,
      indexedDeployedSui: entries.reduce((sum, event) => sum + sui(event.json?.amount), 0),
      rounds: (settledResult.events as EventRecord[]).map((event) => ({
        round: Number(event.json?.round ?? 0), winningTile: Number(event.json?.winning_tile ?? 0) + 1,
        deployedSui: sui(event.json?.gross), rewardPoolSui: sui(event.json?.winner_pool),
        transaction: event.transactionDigest ?? null, timestamp: event.timestamp ?? null,
      })),
      motherlodes: (motherlodeResult.events as EventRecord[]).map((event) => ({
        round: Number(event.json?.round ?? 0), winningTile: Number(event.json?.tile ?? 0) + 1,
        addedDslvr: dslvr(event.json?.added), balanceDslvr: dslvr(event.json?.balance), hit: Boolean(event.json?.hit),
        transaction: event.transactionDigest ?? null, timestamp: event.timestamp ?? null,
      })),
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Explore activity unavailable" }, { status: 502, headers: { "cache-control": "no-store" } });
  }
}
