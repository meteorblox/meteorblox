import { SuiGrpcClient } from "@mysten/sui/grpc";
import { SuiGraphQLClient } from "@mysten/sui/graphql";

const gameId = "0x2133b5403f7513b64ecd9d314d951e5969a6064f3682b3ac3d444a3ab95c2522";
const motherlodeEventPackageId = "0x0de2330f503784f12b4abf7484f336976149e4056784ebb1709a4c38889e0b99";
const rpcUrl = process.env.SUI_GRPC_URL ?? process.env.SUI_RPC_URL ?? "https://fullnode.testnet.sui.io:443";
const client = new SuiGrpcClient({ network: "testnet", baseUrl: rpcUrl });
const eventClient = new SuiGraphQLClient({ network: "testnet", url: "https://graphql.testnet.sui.io/graphql" });

type GameJson = { round?: string | number; pot?: string | number };
type MotherloadJson = { balance?: string | number };

const sui = (value: unknown) => Number(BigInt(String(value ?? "0"))) / 1_000_000_000;
const dslvr = (value: unknown) => Number(BigInt(String(value ?? "0"))) / 1_000_000;

export async function GET() {
  try {
    const [{ object: gameObject }, motherloadEvents] = await Promise.all([
      client.core.getObject({ objectId: gameId, include: { json: true } }),
      eventClient.core.listEvents({
        filter: { eventType: `${motherlodeEventPackageId}::game::MotherlodeUpdated` },
        limit: 1,
        order: "descending",
      }),
    ]);
    const game = (gameObject?.json ?? {}) as GameJson;
    const motherload = (motherloadEvents.events[0]?.json ?? {}) as MotherloadJson;
    return Response.json({
      round: Number(game.round ?? 0),
      potSui: sui(game.pot),
      motherlodeDslvr: dslvr(motherload.balance),
    }, { headers: { "cache-control": "public, max-age=3, stale-while-revalidate=15" } });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Live game state unavailable" },
      { status: 502, headers: { "cache-control": "no-store" } },
    );
  }
}
