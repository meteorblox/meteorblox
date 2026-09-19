# Sentinel testnet foundation

This branch adds `/sentinel`, signed free activation, durable one-node-per-wallet
records, shared protocol observations, and simulated dashboard rewards. No token
transfers, on-chain rewards, mainnet purchases, economic allocations, or airdrop
eligibility are implemented by this milestone.

## Runtime

- Use the existing Node deployment and `npm start` entry point.
- Set `CHAT_DB_PATH` to the existing SQLite file on a persistent Railway volume.
  Back up the database before rollout. The new tables are additive.
- Set `SENTINEL_ENABLED=true` to enable activation and start the monitor process.
  Default is off; the page then shows that the pilot is preparing.
- `SENTINEL_ACTIVATION_PAUSED=true` stops new activations while preserving reads
  and monitoring. It also blocks simulated claims; monitoring and demo accrual continue.
- The standalone monitor can run with
  `node --experimental-strip-types scripts/sentinel-monitor.mjs --run`.
- Node 22.13+ is required, consistent with the existing application.
- Cloudflare D1 is supported by the storage layer, but deploying the page alone
  to Cloudflare does not schedule this Node worker. A separate scheduler would
  be required there. This milestone targets the existing Railway runtime.

No memory-only fallback is allowed for Sentinel records. Production must use a
real persistent volume, not `:memory:` or the container's ephemeral filesystem.
Monitor failure does not stop gameplay; observations become visibly stale after
three minutes. A supervisor logs monitor exits; operator restart is required.

## Identity and observation semantics

Activation requires a domain-separated Sui personal-message signature including
wallet, testnet context, and a ten-minute timestamp window. Ed25519 and supported
wallet signatures are verified through the existing Sui verifier. Replays within
the window are idempotent and never change activation time. There is no payment
or on-chain node mint in this stage. One wallet is not proof of one human.

The monitor reads the deployed testnet game object and latest RoundSettled event
approximately once a minute, with a 15-second request timeout. Each observation
records the actual read time, round, settlement flag, and event transaction.
Event lookup failure is distinct from no event returned. These are shared
service observations, not work performed by each holder. A latest-settlement
record is not evidence every intermediate round settled. A past closing time
raises an attention message rather than asserting a failure.

One observation per minute is stored, retained for seven days; the UI shows the
latest thirty. The fixed reward weight is 5 units. Real token rewards are disabled.
Refreshing history neither runs a check nor qualifies a participant for an airdrop.

The separate VMH activity meter uses the square root of confirmed positive-stake
entries in the current open round, capped at 5. It is a visual index, not a reward
multiplier or hardware hashrate. Manual and autoplay entries count equally.
Observed activity carries across round changes with a two-minute linear decay
when no further play is seen. An empty round timer does not create activity.
Stale/failed game observations and legacy records without entry counts show
unavailable, leaving chart gaps. Sampling once a minute can miss short rounds.
The index is shared protocol activity and is visible even before node activation;
the wallet's fixed weight is displayed separately. No random fluctuations are used.

## Before opening the pilot

Verify production-volume persistence through a restart, activate with a real
test wallet, reconnect on another browser, and test Slush/mobile signing.
Confirm the monitor records actual chain reads and produces stale/unavailable
states during an outage. Publish tester eligibility and a capped budget before
any qualifying airdrop activity begins. Activation alone is not eligibility.

## Later milestones

Funded test rewards and replay-safe claims; authenticated testing tasks and
feedback records; independently controllable reward/claim pauses. Keep the
pilot open until the owner stops it or transitions to mainnet. The first review
is after 7–14 days, not an automatic end date. The 100-node cap refers to the
planned mainnet Founder release, not an approved testnet cap.

## Simulated reward pilot

Each activated wallet earns one integer demo credit (0.01 simulated DSLVR) per
successful monitoring minute, including idle rounds. There is no historical
backfill, no payment, no chain write, and no mainnet rate promise. Failed reads
do not earn credits. The demo balance is kept in the persistent SQLite database.
A last-minute cursor prevents duplicate accrual; a domain-separated signed claim
authorizes only a specific cumulative credit total. Replaying an old approval
cannot claim future earnings. Claims update dashboard balances only.

Demo balances have no monetary value, may reset, and do not establish airdrop
eligibility. Turning SENTINEL_ENABLED off stops the monitor and API operations.
