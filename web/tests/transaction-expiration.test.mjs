import assert from "node:assert/strict";
import test from "node:test";
import { bcs } from "@mysten/sui/bcs";
import { Transaction } from "@mysten/sui/transactions";

// Wire-format fixture: expiration variant 3 (Validity), four absent bounds,
// a 32-byte chain digest, nonce 7, and no proposer restriction. Construct it
// independently of the installed SDK serializer to detect old schema versions.
const validityBytes = Uint8Array.from([
  3, 0, 0, 0, 0, 32, ...new Array(32).fill(0), 7, 0, 0, 0, 0,
]);

test("decodes expiration variant 3 returned by current Sui wallets", () => {
  const expiration = bcs.TransactionExpiration.parse(validityBytes);
  assert.equal(expiration.$kind, "Validity");
  assert.equal(expiration.Validity.nonce, 7);
  assert.equal(expiration.Validity.allowedProposers, null);
});

test("reads a full wallet transaction with Validity and preserves its bytes", async () => {
  const legacyBytes = bcs.TransactionData.serialize({
    V1: {
      kind: { ProgrammableTransaction: { inputs: [], commands: [] } },
      sender: "0x1",
      gasData: { payment: [], owner: "0x1", price: "1000", budget: "50000000" },
      expiration: { None: true },
    },
  }).toBytes();
  // Expiration is the final field of TransactionDataV1.
  const walletBytes = Uint8Array.from([...legacyBytes.slice(0, -1), ...validityBytes]);
  const transaction = Transaction.from(walletBytes);
  assert.equal(transaction.getData().expiration.Validity.nonce, 7);
  assert.deepEqual(await transaction.build(), walletBytes);
});
