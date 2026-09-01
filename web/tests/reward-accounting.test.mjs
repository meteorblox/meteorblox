import assert from "node:assert/strict";
import test from "node:test";

import { rewardAccounting } from "../app/api/game/route.ts";

const wallet = "0xAbC";

test("reward accounting separates refined, unrefined, claimed, and other-wallet positions", () => {
  const now = 2_000;
  const refinery = { positions: [
    { owner: wallet, amount: "250000", awarded_at_ms: "1", matures_at_ms: "1500", claimed: false },
    { owner: wallet.toLowerCase(), amount: "500000", awarded_at_ms: "1", matures_at_ms: "2500", claimed: false },
    { owner: wallet, amount: "900000", awarded_at_ms: "1", matures_at_ms: "1500", claimed: true },
    { owner: "0xdef", amount: "800000", awarded_at_ms: "1", matures_at_ms: "1500", claimed: false },
  ] };
  const ledger = { game: "0xgame", credits: [] };

  const result = rewardAccounting(wallet, refinery, ledger, now);
  assert.equal(result.refined, 250000n);
  assert.equal(result.unrefined, 500000n);
  assert.equal(result.refinedPositions.length, 1);
  assert.equal(result.unrefinedPositions.length, 1);
});

test("reward accounting sums only positive ledger credits for the requested wallet", () => {
  const refinery = { positions: [] };
  const ledger = { game: "0xgame", credits: [
    { owner: wallet, sui: "1000000000" },
    { owner: wallet.toLowerCase(), sui: "250000000" },
    { owner: wallet, sui: "0" },
    { owner: "0xdef", sui: "9000000000" },
  ] };

  const result = rewardAccounting(wallet, refinery, ledger, 0);
  assert.equal(result.ledgerCreditTotal, 1250000000n);
  assert.equal(result.ledgerCredits.length, 2);
});

test("reward accounting returns zero balances when no wallet is connected", () => {
  const result = rewardAccounting("", { positions: [] }, { game: "0xgame", credits: [{ owner: wallet, sui: "1" }] }, 0);
  assert.equal(result.ledgerCreditTotal, 0n);
  assert.equal(result.refined, 0n);
  assert.equal(result.unrefined, 0n);
});
