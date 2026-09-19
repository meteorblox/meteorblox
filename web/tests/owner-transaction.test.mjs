import assert from "node:assert/strict";
import test from "node:test";
import { Transaction } from "@mysten/sui/transactions";
import { prepareOwnerTransaction } from "../app/owner-transaction.ts";

test("owner request preserves epoch expiration through JSON and wire serialization", async () => {
  const tx = new Transaction();
  tx.setSender("0x1");
  tx.setGasOwner("0x1");
  tx.setGasBudget(1000000);
  tx.setGasPrice(1000);
  tx.setGasPayment([]);
  const client = { core: { getCurrentSystemState: async () => ({ systemState: { epoch: "1227" } }) } };
  await prepareOwnerTransaction(tx, client);
  assert.equal(String(Transaction.from(await tx.toJSON()).getData().expiration.Epoch), "1228");
  assert.equal(String(Transaction.from(await tx.build()).getData().expiration.Epoch), "1228");
});

test("missing epoch stops preparation before build", async () => {
  let built = false;
  const tx = { build: async () => { built = true; } };
  await assert.rejects(prepareOwnerTransaction(tx, {
    core: { getCurrentSystemState: async () => ({ systemState: { epoch: null } }) },
  }), /current Sui epoch/);
  assert.equal(built, false);
});

test("preparation refuses an expiration changed during resolution", async () => {
  const tx = {
    setExpiration() {}, build: async () => {},
    getData: () => ({ expiration: { $kind: "Validity", Validity: {} } }),
  };
  await assert.rejects(prepareOwnerTransaction(tx, {
    core: { getCurrentSystemState: async () => ({ systemState: { epoch: "1227" } }) },
  }), /not preserved/);
});

