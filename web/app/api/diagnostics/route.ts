
import { SuiGrpcClient } from "@mysten/sui/grpc";

const rpcUrl = process.env.SUI_GRPC_URL ?? process.env.SUI_RPC_URL ?? "https://fullnode.testnet.sui.io:443";
const client = new SuiGrpcClient({ network: "testnet", baseUrl: rpcUrl });
const gameId = "0x2133b5403f7513b64ecd9d314d951e5969a6064f3682b3ac3d444a3ab95c2522";
const refineryId = "0x15596af5d595d85f7bde4fa9b76b2c04ec30569cf3f8b763f02524ae928f06fa";
const upgradeCapId = "0xae3f9a21abae0ae5e36c943e3e4a28d10f760832d5c6c9ba68c54bc4eb6c647d";

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

