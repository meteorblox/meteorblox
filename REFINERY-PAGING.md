# Testnet refinery paging release

This upgrades the current v13 package without changing existing object layouts, reward amounts, seven-day refining, or early-withdrawal penalties. Activation is a separate owner transaction. No existing reward history is migrated.

New awards use pages of at most 128 positions, a fixed-size wallet cursor, and a global position counter. Claims visit at most eight pages per transaction. Drained pages are deleted; identifiers are never reused. Existing global/V2 rewards keep their original claim functions. V2 counters continue to describe legacy V2 storage; page counters are separate.

The game API adds old and paged balances and rejects incomplete/failed reads instead of showing an incorrect zero. Claims use a fresh snapshot, automatically estimated gas, bounded approvals, and completed-batch receipts. Transactions already completed remain completed if a later approval is cancelled.

## Owner rollout

1. Deploy this page-aware website before activation.
2. Open `/refinery-upgrade` and connect the UpgradeCap owner ending `114781` on Sui testnet.
3. Review and approve the contract upgrade. The page requires exactly v13 and the reviewed package before offering this action.
4. Refresh status. Activation is offered only after the published modules match the bundled candidate bytecode.
5. Review the separate activation transaction. Existing rewards remain claimable; subsequent keeper rewards go into pages.
6. Check actual new rewards, partial claims, full claims, and keeper transaction costs on testnet after activation. Local cost measurements are not live fee guarantees.

Do not republish an old frontend after activation: it would omit paged balances. An emergency frontend rollback must retain page-aware reads/claims. There is no automatic deactivation or reverse migration in this release.

## Verification

- Recovered v13 sources matched all six deployed module bytecodes after normalizing the published self-address. This also restores deployed staking/refinery sources missing from the repository.
- 31 Move tests pass, including legacy claims, page rollover, partial/full claims, ownership, duplicate/oversized/empty batches, stats/cursor behavior, and capability checks.
- Page reader and claim planner tests pass, alongside reward accounting, keeper idle behavior, and transaction-expiration compatibility tests (17 focused tests).
- Production web build passes. The broader web suite has two existing failures: the airdrop test's extensionless module import and an obsolete title expectation. Existing unrelated TypeScript errors remain.
- Unsigned public testnet upgrade simulation succeeds; approximately 0.207012 test SUI net gas in the measured simulation.
- Isolated localnet rehearsal executed real page reads and partial/full claims using a throwaway signer and local-only fixtures. At 4,426 positions, one award measured 0.021670404 SUI for the old vector versus 0.002870436 SUI for pages (about 87% less). Starting a new page measured 0.005002692 SUI. Fixture helpers are excluded from production sources and bytecode.

## Reproduce

Use Sui CLI 1.78.0 with the checked-in Move.lock. Run `sui move test` from the contract root. Set `SUI_BIN` if needed and run `node scripts/generate-refinery-upgrade.mjs` from `web` to rebuild the artifact. This uses the caller's configured MOVE_HOME/SUI_CONFIG_DIR.

From `web`, run `node --experimental-strip-types --test tests/refinery-pages.test.mjs tests/reward-accounting.test.mjs tests/keeper-policy.test.mjs tests/transaction-expiration.test.mjs` and the normal production build. `node --experimental-strip-types scripts/simulate-refinery-upgrade.mjs` performs a read-only simulation while the UpgradeCap is still at the expected version.

Reader limits: discovery stops explicitly after 10,000 dynamic fields, and a wallet page range over 10,000 returns an error rather than a partial balance. Each page is bounded, but total unclaimed history still grows; larger histories would need additional API pagination.
