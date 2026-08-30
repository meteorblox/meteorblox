import { SuiGrpcClient } from "@mysten/sui/grpc";
import { SuiGraphQLClient } from "@mysten/sui/graphql";

const packageId = "0xb0097a3ef50e48294eb15a4a0fb7a1c9d2c421b217dc384e44cec478e4072771";
const vaultId = "0xed814a5a13886244d1dc2a6e136d971cd5f52e27b33d01916c16590fcbbe5adc";
const dslvrType = `${packageId}::dslvr::DSLVR`;
const rpcUrl = process.env.SUI_GRPC_URL ?? process.env.SUI_RPC_URL ?? "https://fullnode.testnet.sui.io:443";
const client = new SuiGrpcClient({ network: "testnet", baseUrl: rpcUrl });
const eventClient = new SuiGraphQLClient({ network: "testnet", url: "https://graphql.testnet.sui.io/graphql" });

type VaultJson = { total_staked: string; rewards: string; position_count: string; total_rewards_added: string; total_rewards_claimed: string };
type StakeEvent = { owner?: string; amount?: string };
const dslvr = (units: bigint) => Number(units) / 1_000_000;

export async function GET(request: Request) {
  try {
    const address = new URL(request.url).searchParams.get("address")?.toLowerCase() ?? "";
    const [{ object }, balanceResult, stakedResult, unstakedResult] = await Promise.all([
      client.core.getObject({ objectId: vaultId, include: { json: true } }),
      address ? client.core.getBalance({ owner: address, coinType: dslvrType }).catch(() => null) : Promise.resolve(null),
      address ? eventClient.core.listEvents({ filter: { eventType: `${packageId}::staking::Staked` }, limit: 100, order: "descending" }).catch(() => ({ events: [] })) : Promise.resolve({ events: [] }),
      address ? eventClient.core.listEvents({ filter: { eventType: `${packageId}::staking::Unstaked` }, limit: 100, order: "descending" }).catch(() => ({ events: [] })) : Promise.resolve({ events: [] }),
    ]);
    const vault = object.json as VaultJson;
    const sumForOwner = (events: Array<{ json?: unknown }>) => events.reduce((sum, event) => {
      const json = event.json as StakeEvent | undefined;
      return json?.owner?.toLowerCase() === address ? sum + BigInt(json.amount ?? "0") : sum;
    }, 0n);
    const userStaked = sumForOwner(stakedResult.events) - sumForOwner(unstakedResult.events);
    return Response.json({
      vaultId,
      availableDslvr: balanceResult ? dslvr(BigInt(balanceResult.balance.balance)) : 0,
      userStakedDslvr: dslvr(userStaked > 0n ? userStaked : 0n),
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

