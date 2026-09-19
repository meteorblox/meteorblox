import { SuiGrpcClient } from "@mysten/sui/grpc";
import { refineryUpgradeData } from "../../refinery-upgrade-data";
import { readPagedRewards } from "../../refinery-pages";
const client = new SuiGrpcClient({ network: "testnet", baseUrl: process.env.SUI_GRPC_URL ?? process.env.SUI_RPC_URL ?? "https://fullnode.testnet.sui.io:443" });
const capId = "0xae3f9a21abae0ae5e36c943e3e4a28d10f760832d5c6c9ba68c54bc4eb6c647d";
const gameId = "0x2133b5403f7513b64ecd9d314d951e5969a6064f3682b3ac3d444a3ab95c2522";
const refineryId = "0x15596af5d595d85f7bde4fa9b76b2c04ec30569cf3f8b763f02524ae928f06fa";
const origin = Buffer.from("b0097a3ef50e48294eb15a4a0fb7a1c9d2c421b217dc384e44cec478e4072771", "hex");
export async function GET() {
  try {
    const refineryV2Id = process.env.REFINERY_V2_ID?.trim();
    if (!refineryV2Id) throw new Error("Refinery V2 is not configured");
    const [{ object: cap }, { object: game }] = await Promise.all([
      client.core.getObject({ objectId: capId, include: { json: true } }),
      client.core.getObject({ objectId: gameId, include: { json: true } }),
    ]);
    const state = cap.json as { package: string; version: string; policy: number };
    const gameAdmin = (game.json as { admin: string }).admin;
    const owner = cap.owner.$kind === "AddressOwner" ? cap.owner.AddressOwner : null;
    const paging = await readPagedRewards(client, refineryV2Id, "");
    let candidateMatches = false;
    if (state.version === String(Number(refineryUpgradeData.expectedVersion) + 1)) {
      const { response } = await client.ledgerService.getObject({ objectId: state.package, readMask: { paths: ["package"] } });
      const modules = response.object?.package?.modules ?? [];
      const expected = refineryUpgradeData.modules.map((module) => Buffer.from(module, "base64"));
      candidateMatches = modules.length === expected.length && modules.every((module) => {
        const contents = Buffer.from(module.contents ?? []);
        const offset = contents.indexOf(origin);
        if (offset < 0) return false;
        contents.fill(0, offset, offset + 32);
        return expected.some((candidate) => candidate.equals(contents));
      });
    }
    return Response.json({
      capId, gameId, refineryId, refineryV2Id, owner, gameAdmin, packageId: state.package,
      version: state.version, policy: state.policy, active: paging.enabled, candidateMatches,
      upgradeReady: state.version === refineryUpgradeData.expectedVersion && state.package === refineryUpgradeData.expectedPackage && state.policy === 0,
      activationReady: candidateMatches && !paging.enabled,
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Upgrade status unavailable" }, { status: 502, headers: { "cache-control": "no-store" } });
  }
}
