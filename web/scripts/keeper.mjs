import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { Transaction } from "@mysten/sui/transactions";
import { DatabaseSync } from "node:sqlite";

const fallbackPackageId = "0x1104e6c0e56478ad3f91b77f1058416c846f278f79ff1039162d59ec132dd5b5";
const upgradeCapId = "0xae3f9a21abae0ae5e36c943e3e4a28d10f760832d5c6c9ba68c54bc4eb6c647d";
const gameId = "0x2133b5403f7513b64ecd9d314d951e5969a6064f3682b3ac3d444a3ab95c2522";
const refineryId = "0x15596af5d595d85f7bde4fa9b76b2c04ec30569cf3f8b763f02524ae928f06fa";
const ledgerId = "0xc065549eb934c1b628f761d1c1549c8b638bfa3ed6bfda15c129f8d0931b4476";
const randomId = "0x8";
const clockId = "0x6";
const rpcUrl = process.env.SUI_GRPC_URL ?? process.env.SUI_RPC_URL ?? "https://fullnode.testnet.sui.io:443";
const pollMs = Math.max(10_000, Number(process.env.KEEPER_POLL_MS ?? 15_000));
const autoplayGasBudget = Math.max(20_000_000, Number(process.env.AUTOPLAY_GAS_BUDGET ?? 100_000_000));
// Ten plans stays comfortably below the observed Testnet gas ceiling while the
// loop still drains larger queues through multiple transactions in one round.
const autoplayBatchSize = Math.max(1, Number(process.env.AUTOPLAY_BATCH_SIZE ?? 10));
const maxAutoplayBatches = Math.max(1, Number(process.env.MAX_AUTOPLAY_BATCHES ?? 30));
const secret = process.env.SUI_KEEPER_PRIVATE_KEY;
const autoplayRegistryId = "0x3a9762f85ef2915f02468627cd33ce3d4b33bbe7d3b31ea15b618a378e18fa3f";
const keeperLowBalanceMist = 250_000_000n;
const resendApiKey = process.env.RESEND_API_KEY;
const alertEmail = process.env.OPS_ALERT_EMAIL;
const alertFrom = process.env.ALERT_FROM_EMAIL ?? "SLVRBLOX Alerts <alerts@slvrblox.com>";
const alertCooldownMs = Math.max(300_000, Number(process.env.ALERT_COOLDOWN_MS ?? 21_600_000));
let consecutiveFailures = 0;
let lowBalanceActive = false;
let missingAlertConfigLogged = false;
const lastAlertAt = new Map();
let autoplayExecutedThisTick = false;

const healthDb = process.env.CHAT_DB_PATH ? new DatabaseSync(process.env.CHAT_DB_PATH) : null;
healthDb?.exec(`CREATE TABLE IF NOT EXISTS keeper_health (
  id INTEGER PRIMARY KEY,
  updated_at INTEGER NOT NULL,
  last_success_at INTEGER NOT NULL,
  last_autoplay_at INTEGER NOT NULL,
  consecutive_failures INTEGER NOT NULL,
  last_error TEXT NOT NULL
)`);
const writeHealth = (success, error = "") => {
  if (!healthDb) return;
  const now = Date.now();
  healthDb.prepare(`INSERT INTO keeper_health
    (id, updated_at, last_success_at, last_autoplay_at, consecutive_failures, last_error)
    VALUES (1, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      updated_at = excluded.updated_at,
      last_success_at = CASE WHEN excluded.last_success_at > 0 THEN excluded.last_success_at ELSE keeper_health.last_success_at END,
      last_autoplay_at = CASE WHEN excluded.last_autoplay_at > 0 THEN excluded.last_autoplay_at ELSE keeper_health.last_autoplay_at END,
      consecutive_failures = excluded.consecutive_failures,
      last_error = excluded.last_error`)
    .run(now, success ? now : 0, autoplayExecutedThisTick ? now : 0, consecutiveFailures, error.slice(0, 500));
};

if (!secret) throw new Error("SUI_KEEPER_PRIVATE_KEY is required.");

const client = new SuiGrpcClient({ network: "testnet", baseUrl: rpcUrl });
const keypair = Ed25519Keypair.fromSecretKey(secret);
console.log(`[keeper] Testnet keeper ${keypair.toSuiAddress()} started (polling every ${pollMs}ms).`);

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function sendAlert(kind, subject, details, force = false) {
  if (!resendApiKey || !alertEmail) {
    if (!missingAlertConfigLogged) {
      console.log("[alerts] Disabled until RESEND_API_KEY and OPS_ALERT_EMAIL are configured.");
      missingAlertConfigLogged = true;
    }
    return;
  }
  const lastSent = lastAlertAt.get(kind) ?? 0;
  if (!force && Date.now() - lastSent < alertCooldownMs) return;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${resendApiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: alertFrom,
      to: [alertEmail],
      subject: `[SLVRBLOX Testnet] ${subject}`,
      text: `${details}\n\nNetwork: Sui Testnet\nKeeper: ${keypair.toSuiAddress()}\nTime: ${new Date().toISOString()}\nStatus: https://www.slvrblox.com/status`,
    }),
  });
  if (!response.ok) {
    console.error(`[alerts] Email delivery failed (${response.status}); keeper operation will continue.`);
    return;
  }
  lastAlertAt.set(kind, Date.now());
  console.log(`[alerts] Sent ${kind} notification to ${alertEmail}.`);
}

async function tick() {
  autoplayExecutedThisTick = false;
  const [{ object }, { object: upgradeCapObject }, keeperBalanceResult] = await Promise.all([
    client.core.getObject({ objectId: gameId, include: { json: true } }),
    client.core.getObject({ objectId: upgradeCapId, include: { json: true } }),
    client.core.getBalance({ owner: keypair.toSuiAddress() }),
  ]);
  const keeperBalance = BigInt(keeperBalanceResult.balance.balance);
  if (keeperBalance < keeperLowBalanceMist) {
    await sendAlert("keeper-low", "Keeper gas is low", `Keeper balance is ${(Number(keeperBalance) / 1_000_000_000).toFixed(4)} SUI. Autoplay and settlement reliability may be affected.`);
    lowBalanceActive = true;
  } else if (lowBalanceActive && keeperBalance >= keeperLowBalanceMist * 2n) {
    await sendAlert("keeper-recovered", "Keeper gas has recovered", `Keeper balance is now ${(Number(keeperBalance) / 1_000_000_000).toFixed(4)} SUI.`, true);
    lowBalanceActive = false;
  }
  const game = object.json;
  if (!game) return;
  const packageId = upgradeCapObject.json?.package ?? fallbackPackageId;
  const packageVersion = Number(upgradeCapObject.json?.version ?? 0);

  if (game.settled) return;

  const currentRound = BigInt(game.round);
  let hasActiveAutoplay = false;
  if (autoplayRegistryId && Date.now() < Number(game.closes_at_ms)) {
    const { object: registryObject } = await client.core.getObject({ objectId: autoplayRegistryId, include: { json: true } });
    hasActiveAutoplay = (registryObject.json?.plans ?? []).some((plan) => plan.active && BigInt(plan.rounds_remaining) > 0n && BigInt(plan.last_round_played) < currentRound);
  }
  if (hasActiveAutoplay) {
    let batches = 0;
    let pending = true;
    while (pending && batches < maxAutoplayBatches && Date.now() < Number(game.closes_at_ms)) {
      const autoplayTx = new Transaction();
      autoplayTx.setSender(keypair.toSuiAddress());
      autoplayTx.setGasBudget(autoplayGasBudget);
      autoplayTx.moveCall({
        target: `${packageId}::autoplay::${packageVersion >= 9 ? "execute_random_batch" : "execute_random_round"}`,
        arguments: packageVersion >= 9
          ? [autoplayTx.object(autoplayRegistryId), autoplayTx.object(gameId), autoplayTx.object(randomId), autoplayTx.object(clockId), autoplayTx.pure.u64(autoplayBatchSize)]
          : [autoplayTx.object(autoplayRegistryId), autoplayTx.object(gameId), autoplayTx.object(randomId), autoplayTx.object(clockId)],
      });
      const autoplayResult = await keypair.signAndExecuteTransaction({ transaction: autoplayTx, client });
      if (autoplayResult.$kind === "FailedTransaction") {
        throw new Error(autoplayResult.FailedTransaction.status.error?.message ?? "Autoplay execution failed");
      }
      batches += 1;
      autoplayExecutedThisTick = true;
      console.log(`[keeper] Executed autoplay ${packageVersion >= 9 ? `batch ${batches}` : "plans"} for round ${currentRound}. Transaction: ${autoplayResult.Transaction.digest}`);
      await client.core.waitForTransaction({ digest: autoplayResult.Transaction.digest, timeout: 60_000 });
      if (packageVersion < 9) pending = false;
      else {
        const { object: refreshedRegistry } = await client.core.getObject({ objectId: autoplayRegistryId, include: { json: true } });
        pending = (refreshedRegistry.json?.plans ?? []).some((plan) => plan.active && BigInt(plan.rounds_remaining) > 0n && BigInt(plan.last_round_played) < currentRound);
      }
    }
    if (pending && Date.now() < Number(game.closes_at_ms)) console.log(`[keeper] Round ${currentRound} still has pending autoplay plans; continuing next cycle.`);
    if (Date.now() < Number(game.closes_at_ms)) return;
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
    if (consecutiveFailures >= 3) await sendAlert("keeper-recovered", "Keeper automation recovered", "The keeper completed a successful monitoring cycle after repeated failures.", true);
    consecutiveFailures = 0;
    writeHealth(true);
  } catch (error) {
    consecutiveFailures += 1;
    const message = error instanceof Error ? error.message : String(error);
    writeHealth(false, message);
    console.error(`[keeper] ${message}`);
    if (consecutiveFailures >= 3) {
      try { await sendAlert("keeper-failure", "Keeper automation needs attention", `${consecutiveFailures} consecutive keeper cycles failed. Latest error: ${message}`); }
      catch (alertError) { console.error(`[alerts] ${alertError instanceof Error ? alertError.message : String(alertError)}`); }
    }
  }
  await wait(pollMs);
}

