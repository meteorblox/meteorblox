import { SuiGrpcClient } from "@mysten/sui/grpc";
import { bcs } from "@mysten/sui/bcs";

const packageId = "0xb0097a3ef50e48294eb15a4a0fb7a1c9d2c421b217dc384e44cec478e4072771";
const vaultId = "0xed814a5a13886244d1dc2a6e136d971cd5f52e27b33d01916c16590fcbbe5adc";
const dslvrType = `${packageId}::dslvr::DSLVR`;
const lockKeyPackageId = "0xaebe9d7ea708b5466bf500db575c12e5fb895ef3fcf1b8841e73b25ffebb6928";
const rpcUrl = process.env.SUI_GRPC_URL ?? process.env.SUI_RPC_URL ?? "https://fullnode.testnet.sui.io:443";
const client = new SuiGrpcClient({ network: "testnet", baseUrl: rpcUrl });

type VaultJson = {
  total_staked: string;
  rewards: string;
  positions: { id: string };
  position_count: string;
  total_rewards_added: string;
  total_rewards_claimed: string;
};
const Position = bcs.struct("Position", {
  staked: bcs.u64(),
  rewardDebtScaled: bcs.u128(),
  pendingRewards: bcs.u64(),
});
const LockKey = bcs.struct("LockKey", { owner: bcs.Address });
const dslvr = (units: bigint) => Number(units) / 1_000_000;

export async function GET(request: Request) {
  try {
    const address = new URL(request.url).searchParams.get("address")?.toLowerCase() ?? "";
    const [{ object }, balanceResult] = await Promise.all([
      client.core.getObject({ objectId: vaultId, include: { json: true } }),
      address ? client.core.getBalance({ owner: address, coinType: dslvrType }).catch(() => null) : Promise.resolve(null),
    ]);
    const vault = object.json as VaultJson;
    const [positionField, lockField] = address ? await Promise.all([
      client.core.getDynamicField({
        parentId: vault.positions.id,
        name: { type: "address", bcs: bcs.Address.serialize(address).toBytes() },
      }).catch(() => null),
      client.core.getDynamicField({
        parentId: vaultId,
        name: { type: `${lockKeyPackageId}::staking::LockKey`, bcs: LockKey.serialize({ owner: address }).toBytes() },
      }).catch(() => null),
    ]) : [null, null];
    const position = positionField ? Position.parse(positionField.dynamicField.value.bcs) : null;
    const userStaked = position?.staked ?? 0n;
    const unlockAtMs = lockField ? Number(bcs.u64().parse(lockField.dynamicField.value.bcs)) : 0;
    return Response.json({
      vaultId,
      availableDslvr: balanceResult ? dslvr(BigInt(balanceResult.balance.balance)) : 0,
      userStakedDslvr: dslvr(userStaked),
      unlockAtMs,
      totalStakedDslvr: dslvr(BigInt(vault.total_staked)),
      rewardBalanceDslvr: dslvr(BigInt(vault.rewards)),
      positionCount: Number(vault.position_count),
      totalRewardsAddedDslvr: dslvr(BigInt(vault.total_rewards_added)),
      totalRewardsClaimedDslvr: dslvr(BigInt(vault.total_rewards_claimed)),
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Staking state unavailable" }, { status: 502, headers: { "cache-control": "no-store" } });
  }
}

