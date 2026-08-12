# MeteorBlox contracts

Private development repository for the MeteorBlox Sui Move protocol.

Current milestone locks the core accounting invariants:

- 25 unique selectable tiles
- multi-tile and multi-round entry totals
- overflow rejection
- 90% winning pool
- 7% treasury, 2% rewards, 1% operations/security
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

## MTBX winning-round rewards

Every settled round reserves **0.25 MTBX** and distributes it proportionally
across winning stakes when players claim their SUI winnings. MTBX begins as an
unrefined, non-transferable position, refines after 24 hours, and can be claimed
early with the existing 10% penalty. The unique reward authority is locked into
the shared game during one-time setup, preventing manual reward issuance.
