module meteorblox::mtbx;

use std::option;
use sui::clock::Clock;
use sui::coin::{Self, Coin, TreasuryCap};
use sui::event;
use sui::transfer;
use sui::tx_context::{Self, TxContext};

/// Six display decimals. All internal amounts are atomic MTBX units.
const DECIMALS: u8 = 6;
const UNIT: u64 = 1_000_000;
const MAX_SUPPLY: u64 = 25_000_000 * UNIT;
const REFINE_MS: u64 = 86_400_000;
const EARLY_PENALTY_BPS: u64 = 1_000;
const BPS: u64 = 10_000;

const E_NOT_AUTHORIZED: u64 = 1;
const E_ZERO_REWARD: u64 = 2;
const E_SUPPLY_CAP: u64 = 3;
const E_NOT_MATURE: u64 = 4;
const E_NO_REWARD: u64 = 5;
const E_ALREADY_MATURE: u64 = 6;

/// One-time witness defining the wallet-compatible MTBX coin.
public struct MTBX has drop {}

/// Initially held by the publisher. This is a Testnet checkpoint; the next
/// integration step moves issuance authority into the round game.
public struct RewardCap has key, store {
    id: UID,
}

/// A user's mined reward remains non-transferable here until claimed.
public struct UnrefinedPosition has store {
    owner: address,
    amount: u64,
    awarded_at_ms: u64,
    matures_at_ms: u64,
    claimed: bool,
}

/// The TreasuryCap is wrapped so minting can only happen through refinery
/// claim functions and can never exceed the hard cap.
public struct Refinery has key {
    id: UID,
    treasury: TreasuryCap<MTBX>,
    reward_cap_id: ID,
    awarded: u64,
    minted: u64,
    forfeited: u64,
    positions: vector<UnrefinedPosition>,
}

public struct RewardAwarded has copy, drop {
    owner: address,
    amount: u64,
    matures_at_ms: u64,
}

public struct RefinedClaimed has copy, drop {
    owner: address,
    amount: u64,
}

public struct EarlyClaimed has copy, drop {
    owner: address,
    gross: u64,
    received: u64,
    penalty: u64,
}

#[allow(deprecated_usage)]
fun init(witness: MTBX, ctx: &mut TxContext) {
    let (treasury, metadata) = coin::create_currency(
        witness,
        DECIMALS,
        b"MTBX",
        b"MeteorBlox",
        b"Digital rare metal mined through MeteorBlox on Sui.",
        option::none(),
        ctx,
    );
    transfer::public_freeze_object(metadata);

    let reward_cap = RewardCap { id: object::new(ctx) };
    let reward_cap_id = object::id(&reward_cap);
    transfer::share_object(Refinery {
        id: object::new(ctx),
        treasury,
        reward_cap_id,
        awarded: 0,
        minted: 0,
        forfeited: 0,
        positions: vector[],
    });
    transfer::transfer(reward_cap, tx_context::sender(ctx));
}

/// Award unrefined MTBX without minting transferable coins. Total promises are
/// capped at 25 million MTBX, so future claims cannot exceed maximum supply.
public entry fun award(
    refinery: &mut Refinery,
    cap: &RewardCap,
    recipient: address,
    amount: u64,
    clock: &Clock,
) {
    assert!(object::id(cap) == refinery.reward_cap_id, E_NOT_AUTHORIZED);
    assert!(amount > 0, E_ZERO_REWARD);
    assert!(refinery.awarded <= MAX_SUPPLY - amount, E_SUPPLY_CAP);

    let now = clock.timestamp_ms();
    let matures = now + REFINE_MS;
    refinery.awarded = refinery.awarded + amount;
    refinery.positions.push_back(UnrefinedPosition {
        owner: recipient,
        amount,
        awarded_at_ms: now,
        matures_at_ms: matures,
        claimed: false,
    });
    event::emit(RewardAwarded { owner: recipient, amount, matures_at_ms: matures });
}

/// Claim one fully refined position with no penalty.
public entry fun claim_refined(
    refinery: &mut Refinery,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    let sender = tx_context::sender(ctx);
    let now = clock.timestamp_ms();
    let mut found = false;
    let mut amount = 0;
    let mut i = 0;
    while (i < refinery.positions.length() && !found) {
        let position = refinery.positions.borrow_mut(i);
        if (position.owner == sender && !position.claimed && now >= position.matures_at_ms) {
            position.claimed = true;
            amount = position.amount;
            found = true;
        };
        i = i + 1;
    };
    assert!(found, E_NO_REWARD);

    refinery.minted = refinery.minted + amount;
    let payout: Coin<MTBX> = coin::mint(&mut refinery.treasury, amount, ctx);
    transfer::public_transfer(payout, sender);
    event::emit(RefinedClaimed { owner: sender, amount });
}

/// Claim one unrefined position early. The user receives 90%; the remaining
/// 10% is permanently forfeited and is never minted.
public entry fun claim_early(
    refinery: &mut Refinery,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    let sender = tx_context::sender(ctx);
    let now = clock.timestamp_ms();
    let mut found = false;
    let mut gross = 0;
    let mut i = 0;
    while (i < refinery.positions.length() && !found) {
        let position = refinery.positions.borrow_mut(i);
        if (position.owner == sender && !position.claimed && now < position.matures_at_ms) {
            position.claimed = true;
            gross = position.amount;
            found = true;
        };
        i = i + 1;
    };
    assert!(found, E_NO_REWARD);
    assert!(gross > 0, E_ALREADY_MATURE);

    let penalty = mul_div(gross, EARLY_PENALTY_BPS, BPS);
    let received = gross - penalty;
    refinery.minted = refinery.minted + received;
    refinery.forfeited = refinery.forfeited + penalty;

    let payout: Coin<MTBX> = coin::mint(&mut refinery.treasury, received, ctx);
    transfer::public_transfer(payout, sender);
    event::emit(EarlyClaimed { owner: sender, gross, received, penalty });
}

public fun max_supply(): u64 { MAX_SUPPLY }
public fun refining_period_ms(): u64 { REFINE_MS }
public fun awarded(refinery: &Refinery): u64 { refinery.awarded }
public fun minted(refinery: &Refinery): u64 { refinery.minted }
public fun forfeited(refinery: &Refinery): u64 { refinery.forfeited }
public fun position_count(refinery: &Refinery): u64 { refinery.positions.length() }

fun mul_div(value: u64, numerator: u64, denominator: u64): u64 {
    (((value as u128) * (numerator as u128)) / (denominator as u128)) as u64
}

#[test]
fun test_supply_and_refining_constants() {
    assert!(MAX_SUPPLY == 25_000_000_000_000, 100);
    assert!(REFINE_MS == 86_400_000, 101);
}

#[test]
fun test_early_penalty_is_ten_percent() {
    let gross = 12_640_000;
    let penalty = mul_div(gross, EARLY_PENALTY_BPS, BPS);
    assert!(penalty == 1_264_000, 110);
    assert!(gross - penalty == 11_376_000, 111);
}
