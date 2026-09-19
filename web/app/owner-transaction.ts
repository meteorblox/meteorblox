import type { ClientWithCoreApi } from "@mysten/sui/client";
import type { Transaction } from "@mysten/sui/transactions";

// Epoch expiration is understood by older wallet SDKs as well as current Sui.
// Select it before gas resolution, which otherwise may introduce Validity.
export async function prepareOwnerTransaction(transaction: Transaction, client: ClientWithCoreApi) {
  const { systemState } = await client.core.getCurrentSystemState();
  if (!systemState.epoch || !/^\d+$/.test(systemState.epoch)) throw new Error("Unable to determine the current Sui epoch");
  const expiration = String(BigInt(systemState.epoch) + 1n);
  transaction.setExpiration({ Epoch: expiration });
  await transaction.build({ client });
  const actual = transaction.getData().expiration;
  if (actual?.$kind !== "Epoch" || actual.Epoch !== expiration) throw new Error("Wallet-compatible expiration was not preserved");
}
