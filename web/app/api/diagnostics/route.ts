
import { SuiGrpcClient } from "@mysten/sui/grpc";

const client = new SuiGrpcClient({ network: "testnet", baseUrl: "https://fullnode.testnet.sui.io:443" });
const gameId = "0xed69d2784a34e80ac206750ddfef18ede5f447aa8c9299c4bc64c81434c1f7fe";
const refineryId = "0x6d66c03dc8b5d5994af512a66bdc09f2b22917f7c2d19d5430d6867e22c13895";
const upgradeCapId = "0xe8a428db6b93487e7f59ffe593bb8f6e384e56ecbad5df1fd0ddc1811d1f972c";

export async function GET() {
  const [{ object: game }, { object: refinery }, { object: upgradeCap }] = await Promise.all([
    client.core.getObject({ objectId: gameId, include: { json: true } }),
    client.core.getObject({ objectId: refineryId, include: { json: true } }),
    client.core.getObject({ objectId: upgradeCapId, include: { json: true } }),
  ]);
  return new Response(JSON.stringify({
    gameType: (game as { type?: string }).type ?? null,
    refineryType: (refinery as { type?: string }).type ?? null,
    upgradeCap: (upgradeCap as { json?: unknown }).json ?? null,
  }, null, 2), { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
}

