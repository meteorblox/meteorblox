import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { Transaction } from "@mysten/sui/transactions";

const fallbackPackageId = "0x1104e6c0e56478ad3f91b77f1058416c846f278f79ff1039162d59ec132dd5b5";
const upgradeCapId = "0xae3f9a21abae0ae5e36c943e3e4a28d10f760832d5c6c9ba68c54bc4eb6c647d";
const gameId = "0x2133b5403f7513b64ecd9d314d951e5969a6064f3682b3ac3d444a3ab95c2522";
const refineryId = "0x15596af5d595d85f7bde4fa9b76b2c04ec30569cf3f8b763f02524ae928f06fa";
const ledgerId = "0xc065549eb934c1b628f761d1c1549c8b638bfa3ed6bfda15c129f8d0931b4476";
const randomId = "0x8";
const clockId = "0x6";
const rpcUrl = process.env.SUI_GRPC_URL ?? process.env.SUI_RPC_URL ?? "https://fullnode.testnet.sui.io:443";
const pollMs = Math.max(10_000, Number(process.env.KEEPER_POLL_MS ?? 15_000));
const secret = process.env.SUI_KEEPER_PRIVATE_KEY;
const autoplayRegistryId = "0x3a9762f85ef2915f02468627cd33ce3d4b33bbe7d3b31ea15b618a378e18fa3f";
let lastAutoplayRound = -1n;

if (!secret) throw new Error("SUI_KEEPER_PRIVATE_KEY is required.");

const client = new SuiGrpcClient({ network: "testnet", baseUrl: rpcUrl });
const keypair = Ed25519Keypair.fromSecretKey(secret);
console.log(`[keeper] Testnet keeper ${keypair.toSuiAddress()} started (polling every ${pollMs}ms).`);

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function tick() {
  const [{ object }, { object: upgradeCapObject }] = await Promise.all([
    client.core.getObject({ objectId: gameId, include: { json: true } }),
    client.core.getObject({ objectId: upgradeCapId, include: { json: true } }),
  ]);
  const game = object.json;
  if (!game) return;
  const packageId = upgradeCapObject.json?.package ?? fallbackPackageId;

  if (game.settled) return;

  const currentRound = BigInt(game.round);
  let hasActiveAutoplay = false;
  if (autoplayRegistryId && currentRound !== lastAutoplayRound && Date.now() < Number(game.closes_at_ms)) {
    const { object: registryObject } = await client.core.getObject({ objectId: autoplayRegistryId, include: { json: true } });
    hasActiveAutoplay = (registryObject.json?.plans ?? []).some((plan) => plan.active && BigInt(plan.rounds_remaining) > 0n);
  }
  if (hasActiveAutoplay) {
    const autoplayTx = new Transaction();
    autoplayTx.setSender(keypair.toSuiAddress());
    autoplayTx.setGasBudget(20_000_000);
    autoplayTx.moveCall({
      target: `${packageId}::autoplay::execute_random_round`,
      arguments: [autoplayTx.object(autoplayRegistryId), autoplayTx.object(gameId), autoplayTx.object(randomId), autoplayTx.object(clockId)],
    });
    const autoplayResult = await keypair.signAndExecuteTransaction({ transaction: autoplayTx, client });
    if (autoplayResult.$kind === "FailedTransaction") {
      throw new Error(autoplayResult.FailedTransaction.status.error?.message ?? "Autoplay execution failed");
    }
    lastAutoplayRound = currentRound;
    console.log(`[keeper] Executed autoplay plans for round ${currentRound}. Transaction: ${autoplayResult.Transaction.digest}`);
    await client.core.waitForTransaction({ digest: autoplayResult.Transaction.digest, timeout: 60_000 });
    return;
  }

  if (Date.now() < Number(game.closes_at_ms)) return;

  const occupied = BigInt(game.pot ?? "0") > 0n || (game.entries ?? []).some((entry) => BigInt(entry.round) === currentRound);
  if (!occupied) {
    const rolloverTx = new Transaction();
    rolloverTx.setSender(keypair.toSuiAddress());
    rolloverTx.setGasBudget(20_000_000);
    rolloverTx.moveCall({
      target: `${packageId}::game::close_empty_and_open_next`,
      arguments: [rolloverTx.object(gameId), rolloverTx.object(clockId)],
    });
    const rolloverResult = await keypair.signAndExecuteTransaction({ transaction: rolloverTx, client });
    if (rolloverResult.$kind === "FailedTransaction") {
      throw new Error(rolloverResult.FailedTransaction.status.error?.message ?? "Empty-round rollover failed");
    }
    console.log(`[keeper] Closed empty round ${currentRound} and opened the next round. Transaction: ${rolloverResult.Transaction.digest}`);
    await client.core.waitForTransaction({ digest: rolloverResult.Transaction.digest, timeout: 60_000 });
    return;
  }

  const tx = new Transaction();
  tx.setSender(keypair.toSuiAddress());
  tx.setGasBudget(20_000_000);
  tx.moveCall({
    target: `${packageId}::game::settle_and_open_next`,
    arguments: [tx.object(gameId), tx.object(refineryId), tx.object(ledgerId), tx.object(randomId), tx.object(clockId)],
  });

  const result = await keypair.signAndExecuteTransaction({ transaction: tx, client });
  if (result.$kind === "FailedTransaction") {
    throw new Error(result.FailedTransaction.status.error?.message ?? "Keeper transaction failed");
  }
  console.log(`[keeper] Settled occupied round. Transaction: ${result.Transaction.digest}`);
  await client.core.waitForTransaction({ digest: result.Transaction.digest, timeout: 60_000 });
}

while (true) {
  try {
    await tick();
  } catch (error) {
    console.error(`[keeper] ${error instanceof Error ? error.message : String(error)}`);
  }
  await wait(pollMs);
}

