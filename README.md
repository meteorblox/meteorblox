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
