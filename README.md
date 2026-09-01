# SLVRBLOX contracts

Private development repository for the SLVRBLOX Sui Move protocol.

Current milestone locks the core accounting invariants:

- 25 unique selectable tiles
- multi-tile and multi-round entry totals
- overflow rejection
- 90% winning pool
- 5% treasury, 2% rewards, 3% operations/security
- proportional winning-tile payouts
- conservation of every MIST, including rounding dust

## Automated checks

GitHub Actions installs the current Sui Testnet CLI with Mysten Labs' official `suiup` installer, then runs:

```sh
sui move build
sui move test
sui move lint
```

No wallet secret or deployment key is stored in this repository. The package is unaudited and must not be published to Mainnet.

## DSLVR winning-round rewards

Every settled round reserves **0.25 DSLVR** and distributes it proportionally
across winning stakes when players claim their SUI winnings. DSLVR begins as an
unrefined, non-transferable position, refines after 24 hours, and can be claimed
early with the existing 10% penalty. The unique reward authority is locked into
the shared game during one-time setup, preventing manual reward issuance.

## Continuous round engine

The upgrade-safe `ledger` module separates winnings from round progression.
After each 60-second round, a permissionless keeper calls
`game::settle_and_open_next`. In one atomic Sui transaction it selects an
occupied winning tile with Sui randomness, applies fees, credits every winner's
SUI and unrefined DSLVR, and immediately opens the next round.

Players withdraw accumulated SUI later with `ledger::claim_sui`; claiming never
blocks the game. Empty expired rounds roll forward with
`game::close_empty_and_open_next`.

## Funded autoplay

The `autoplay` module lets a player authorize several future rounds once. A
plan escrows exactly `amount per tile × tile count × rounds` in the shared
registry; the keeper then deploys the selected tiles once per newly opened
round while every entry remains credited to the plan owner. Repeated keeper
calls are idempotent for the same round. Owners can cancel by stable plan ID
and immediately recover all unspent SUI. Finished and cancelled plans are
removed from the active registry so keeper gas does not grow forever.
