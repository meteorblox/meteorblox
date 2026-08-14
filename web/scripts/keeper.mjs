import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { Transaction } from "@mysten/sui/transactions";

const packageId = "0x9073976791cd99b492144abc91268709b241dfc9f9c142c72490f9b0cee02c3e";
const gameId = "0xbf0cc524c08bb56d806c2e760b9b1de2c757a74aed3034737a5784cb292257c9";
const refineryId = "0x26588ea54aa0a0be7081177c172e7e5fa7dfb986a53aa672f66b77a092b90c71";
const ledgerId = "0xa02b0a9574fc9255d5ef6c86cd9968df6e7a7913944d343ffcca1c586a22ef9c";
const randomId = "0x8";
const clockId = "0x6";
const pollMs = Math.max(3_000, Number(process.env.KEEPER_POLL_MS ?? 5_000));
const secret = process.env.SUI_KEEPER_PRIVATE_KEY;
const autoplayRegistryId = process.env.SUI_AUTOPLAY_REGISTRY_ID;
let lastAutoplayRound = -1n;

if (!secret) throw new Error("SUI_KEEPER_PRIVATE_KEY is required.");

const client = new SuiGrpcClient({ network: "testnet", baseUrl: "https://fullnode.testnet.sui.io:443" });
const keypair = Ed25519Keypair.fromSecretKey(secret);
console.log(`[keeper] Testnet keeper ${keypair.toSuiAddress()} started.`);

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function tick() {
  const { object } = await client.core.getObject({ objectId: gameId, include: { json: true } });
  const game = object.json;
  if (!game) return;

  if (game.settled) {
    const tx = new Transaction();
    tx.setSender(keypair.toSuiAddress());
    tx.setGasBudget(50_000_000);
    tx.moveCall({
      target: `${packageId}::game::open_next_round`,
      arguments: [tx.object(gameId), tx.object(clockId)],
    });

    const result = await keypair.signAndExecuteTransaction({ transaction: tx, client });
    if (result.$kind === "FailedTransaction") {
      throw new Error(result.FailedTransaction.status.error?.message ?? "Round recovery failed");
    }
    console.log(`[keeper] Opened next round from settled state. Transaction: ${result.Transaction.digest}`);
    await client.core.waitForTransaction({ digest: result.Transaction.digest, timeout: 60_000 });
    return;
  }

  const currentRound = BigInt(game.round);
  if (autoplayRegistryId && currentRound !== lastAutoplayRound && Date.now() < Number(game.closes_at_ms)) {
    const autoplayTx = new Transaction();
    autoplayTx.setSender(keypair.toSuiAddress());
    autoplayTx.setGasBudget(100_000_000);
    autoplayTx.moveCall({
      target: `${packageId}::autoplay::execute_round`,
      arguments: [autoplayTx.object(autoplayRegistryId), autoplayTx.object(gameId), autoplayTx.object(clockId)],
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
  const tx = new Transaction();
  tx.setSender(keypair.toSuiAddress());
  tx.setGasBudget(50_000_000);
  if (occupied) {
    tx.moveCall({
      target: `${packageId}::game::settle_and_open_next`,
      arguments: [tx.object(gameId), tx.object(refineryId), tx.object(ledgerId), tx.object(randomId), tx.object(clockId)],
    });
  } else {
    tx.moveCall({
      target: `${packageId}::game::close_empty_and_open_next`,
      arguments: [tx.object(gameId), tx.object(clockId)],
    });
  }

  const result = await keypair.signAndExecuteTransaction({ transaction: tx, client });
  if (result.$kind === "FailedTransaction") {
    throw new Error(result.FailedTransaction.status.error?.message ?? "Keeper transaction failed");
  }
  console.log(`[keeper] ${occupied ? "Settled" : "Rolled over empty"} round. Transaction: ${result.Transaction.digest}`);
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

