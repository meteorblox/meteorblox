import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { Transaction } from "@mysten/sui/transactions";

const packageId = "0xbd82e0552e768059b7768e78963c59c9020003b1cf6c9c078744e6b617628f6e";
const gameId = "0x07385f18763978170f254199cdc3468b05935037916549ac60984c68e7ba31b5";
const refineryId = "0xb0804c01a08e5e1fc86c831b7ed5cd18fd9189e4d8d45ca7e3617acda1560ec2";
const ledgerId = "0x7f795f4533202fbcd83a5c20a505f18126e9740a8e804e1496eb56f872a6cb8f";
const randomId = "0x8";
const clockId = "0x6";
const pollMs = Math.max(3_000, Number(process.env.KEEPER_POLL_MS ?? 5_000));
const secret = process.env.SUI_KEEPER_PRIVATE_KEY;
const autoplayRegistryId = "0x12686fca999b0457f572ca716c2eb7276510a13f26772b8222aa8cdf88f154cf";
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
