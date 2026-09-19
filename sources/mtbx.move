module slvrblox::dslvr;

use std::option;
use sui::clock::Clock;
use sui::coin::{Self, Coin, TreasuryCap};
use sui::dynamic_field;
use sui::event;
use sui::table::{Self, Table};
use sui::transfer;
use sui::tx_context::{Self, TxContext};

#[test_only]
use sui::test_scenario::{Self, Scenario};

/// Six display decimals. All internal amounts are atomic DSLVR units.
const DECIMALS: u8 = 6;
const UNIT: u64 = 1_000_000;
const MAX_SUPPLY: u64 = 5_000_000 * UNIT;
const REFINE_MS: u64 = 604_800_000;
const EARLY_PENALTY_BPS: u64 = 1_000;
const BPS: u64 = 10_000;

const E_NOT_AUTHORIZED: u64 = 1;
const E_ZERO_REWARD: u64 = 2;
const E_SUPPLY_CAP: u64 = 3;
const E_NO_REWARD: u64 = 5;
const E_ALREADY_MATURE: u64 = 6;
const E_WRONG_REFINERY: u64 = 7;
const E_MIGRATION_COMPLETE: u64 = 8;
const E_V2_ACTIVE: u64 = 9;

/// One-time witness defining the wallet-compatible DSLVR coin.
public struct DSLVR has drop {}

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
    treasury: TreasuryCap<DSLVR>,
    reward_cap_id: ID,
    awarded: u64,
    minted: u64,
    forfeited: u64,
    positions: vector<UnrefinedPosition>,
}

/// V2 indexes active positions by wallet. The original Refinery remains the
/// sole mint authority and canonical lifetime-accounting source.
public struct RefineryV2 has key {
    id: UID,
    refinery_id: ID,
    reward_cap_id: ID,
    wallets: Table<address, WalletPositions>,
    active_wallets: u64,
    open_positions: u64,
    migration_complete: bool,
}

public struct WalletPositions has store {
    positions: vector<UnrefinedPosition>,
}

public struct V2MarkerKey has copy, drop, store {}

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
fun init(witness: DSLVR, ctx: &mut TxContext) {
    let (treasury, metadata) = coin::create_currency(
        witness,
        DECIMALS,
        b"DSLVR",
        b"Digital SLVR",
        b"Digital store of value mined through SLVRBLOX on Sui.",
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

/// Award unrefined DSLVR without minting transferable coins. Total promises are
/// capped by MAX_SUPPLY, so future claims cannot exceed maximum supply.
/// Only another module in this package can create mined rewards. The game also
/// has to present the unique RewardCap, which is locked into the shared Game.
public(package) fun award_from_game(
    refinery: &mut Refinery,
    cap: &RewardCap,
    recipient: address,
    amount: u64,
    clock: &Clock,
) {
    assert!(!dynamic_field::exists(&refinery.id, V2MarkerKey {}), E_V2_ACTIVE);
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

public fun remaining_award_capacity(refinery: &Refinery): u64 {
    MAX_SUPPLY - refinery.awarded
}

public(package) fun reserve_for_motherlode(
    refinery: &mut Refinery,
    cap: &RewardCap,
    amount: u64,
) {
    assert!(object::id(cap) == refinery.reward_cap_id, E_NOT_AUTHORIZED);
    assert!(amount > 0, E_ZERO_REWARD);
    assert!(refinery.awarded <= MAX_SUPPLY - amount, E_SUPPLY_CAP);
    refinery.awarded = refinery.awarded + amount;
}

public(package) fun award_reserved_from_motherlode(
    refinery: &mut Refinery,
    cap: &RewardCap,
    recipient: address,
    amount: u64,
    clock: &Clock,
) {
    assert!(object::id(cap) == refinery.reward_cap_id, E_NOT_AUTHORIZED);
    assert!(amount > 0, E_ZERO_REWARD);
    let now = clock.timestamp_ms();
    let matures = now + REFINE_MS;
    refinery.positions.push_back(UnrefinedPosition { owner: recipient, amount, awarded_at_ms: now, matures_at_ms: matures, claimed: false });
    event::emit(RewardAwarded { owner: recipient, amount, matures_at_ms: matures });
}

/// Creates the V2 index bound to the existing mint authority. The Game module
/// exposes the admin-gated entry point because it owns the unique RewardCap.
public(package) fun create_and_share_v2(refinery: &mut Refinery, cap: &RewardCap, ctx: &mut TxContext) {
    assert!(object::id(cap) == refinery.reward_cap_id, E_NOT_AUTHORIZED);
    assert!(!dynamic_field::exists(&refinery.id, V2MarkerKey {}), E_V2_ACTIVE);
    let v2 = RefineryV2 {
        id: object::new(ctx),
        refinery_id: object::id(refinery),
        reward_cap_id: object::id(cap),
        wallets: table::new(ctx),
        active_wallets: 0,
        open_positions: 0,
        migration_complete: false,
    };
    dynamic_field::add(&mut refinery.id, V2MarkerKey {}, object::id(&v2));
    transfer::share_object(v2);
}

fun assert_v2_binding(refinery: &Refinery, v2: &RefineryV2) {
    assert!(v2.refinery_id == object::id(refinery), E_WRONG_REFINERY);
    assert!(v2.reward_cap_id == refinery.reward_cap_id, E_WRONG_REFINERY);
}

fun insert_position(v2: &mut RefineryV2, position: UnrefinedPosition) {
    if (dynamic_field::exists(&v2.id, PagedMarkerKey {})) {
        insert_paged_position(v2, position);
        return
    };
    let owner = position.owner;
    if (table::contains(&v2.wallets, owner)) {
        table::borrow_mut(&mut v2.wallets, owner).positions.push_back(position);
    } else {
        table::add(&mut v2.wallets, owner, WalletPositions { positions: vector[position] });
        v2.active_wallets = v2.active_wallets + 1;
    };
    v2.open_positions = v2.open_positions + 1;
}

public(package) fun award_from_game_v2(
    refinery: &mut Refinery,
    v2: &mut RefineryV2,
    cap: &RewardCap,
    recipient: address,
    amount: u64,
    clock: &Clock,
) {
    assert_v2_binding(refinery, v2);
    assert!(object::id(cap) == v2.reward_cap_id, E_NOT_AUTHORIZED);
    assert!(amount > 0, E_ZERO_REWARD);
    assert!(refinery.awarded <= MAX_SUPPLY - amount, E_SUPPLY_CAP);
    let now = clock.timestamp_ms();
    let matures = now + REFINE_MS;
    refinery.awarded = refinery.awarded + amount;
    insert_position(v2, UnrefinedPosition { owner: recipient, amount, awarded_at_ms: now, matures_at_ms: matures, claimed: false });
    event::emit(RewardAwarded { owner: recipient, amount, matures_at_ms: matures });
}

public(package) fun award_reserved_from_motherlode_v2(
    refinery: &Refinery,
    v2: &mut RefineryV2,
    cap: &RewardCap,
    recipient: address,
    amount: u64,
    clock: &Clock,
) {
    assert_v2_binding(refinery, v2);
    assert!(object::id(cap) == v2.reward_cap_id, E_NOT_AUTHORIZED);
    assert!(amount > 0, E_ZERO_REWARD);
    let now = clock.timestamp_ms();
    let matures = now + REFINE_MS;
    insert_position(v2, UnrefinedPosition { owner: recipient, amount, awarded_at_ms: now, matures_at_ms: matures, claimed: false });
    event::emit(RewardAwarded { owner: recipient, amount, matures_at_ms: matures });
}

/// Permissionless, bounded migration. Popping entries makes each legacy item
/// impossible to copy twice and progressively shrinks the expensive vector.
public entry fun migrate_to_v2(refinery: &mut Refinery, v2: &mut RefineryV2, max_items: u64) {
    assert_v2_binding(refinery, v2);
    assert!(!v2.migration_complete, E_MIGRATION_COMPLETE);
    assert!(max_items > 0, E_ZERO_REWARD);
    let mut moved = 0;
    while (moved < max_items && !refinery.positions.is_empty()) {
        let UnrefinedPosition { owner, amount, awarded_at_ms, matures_at_ms, claimed } = refinery.positions.pop_back();
        if (!claimed) insert_position(v2, UnrefinedPosition { owner, amount, awarded_at_ms, matures_at_ms, claimed: false });
        moved = moved + 1;
    };
    if (refinery.positions.is_empty()) v2.migration_complete = true;
}

/// Claims every currently vested V2 portion for the sender. Runtime depends
/// only on this wallet's positions, never total protocol history.
public entry fun claim_all_refined_v2(
    refinery: &mut Refinery,
    v2: &mut RefineryV2,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert_v2_binding(refinery, v2);
    let sender = tx_context::sender(ctx);
    assert!(table::contains(&v2.wallets, sender), E_NO_REWARD);
    let now = clock.timestamp_ms();
    let mut total = 0;
    let mut removed = 0;
    let empty;
    {
        let wallet = table::borrow_mut(&mut v2.wallets, sender);
        let mut i = wallet.positions.length();
        while (i > 0) {
            i = i - 1;
            let position = wallet.positions.borrow_mut(i);
            let available = vested_amount(position.amount, position.awarded_at_ms, position.matures_at_ms, now);
            if (available > 0) {
                total = total + available;
                if (available == position.amount) {
                    let UnrefinedPosition { owner: _, amount: _, awarded_at_ms: _, matures_at_ms: _, claimed: _ } = wallet.positions.swap_remove(i);
                    removed = removed + 1;
                } else {
                    position.amount = position.amount - available;
                    position.awarded_at_ms = now;
                };
            };
        };
        empty = wallet.positions.is_empty();
    };
    assert!(total > 0, E_NO_REWARD);
    v2.open_positions = v2.open_positions - removed;
    if (empty) {
        let WalletPositions { positions } = table::remove(&mut v2.wallets, sender);
        positions.destroy_empty();
        v2.active_wallets = v2.active_wallets - 1;
    };
    refinery.minted = refinery.minted + total;
    let payout = coin::mint(&mut refinery.treasury, total, ctx);
    transfer::public_transfer(payout, sender);
    event::emit(RefinedClaimed { owner: sender, amount: total });
}

/// Withdraws one still-refining V2 position and deletes it from active storage.
public entry fun claim_early_v2(
    refinery: &mut Refinery,
    v2: &mut RefineryV2,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert_v2_binding(refinery, v2);
    let sender = tx_context::sender(ctx);
    assert!(table::contains(&v2.wallets, sender), E_NO_REWARD);
    let now = clock.timestamp_ms();
    let mut gross = 0;
    let empty;
    {
        let wallet = table::borrow_mut(&mut v2.wallets, sender);
        let mut i = 0u64;
        let mut found = false;
        while (i < wallet.positions.length() && !found) {
            let position = wallet.positions.borrow(i);
            if (now < position.matures_at_ms) {
                gross = position.amount;
                found = true;
            } else {
                i = i + 1;
            };
        };
        assert!(found, E_NO_REWARD);
        let UnrefinedPosition { owner: _, amount: _, awarded_at_ms: _, matures_at_ms: _, claimed: _ } = wallet.positions.swap_remove(i);
        empty = wallet.positions.is_empty();
    };
    v2.open_positions = v2.open_positions - 1;
    if (empty) {
        let WalletPositions { positions } = table::remove(&mut v2.wallets, sender);
        positions.destroy_empty();
        v2.active_wallets = v2.active_wallets - 1;
    };
    let penalty = mul_div(gross, EARLY_PENALTY_BPS, BPS);
    let received = gross - penalty;
    refinery.minted = refinery.minted + received;
    refinery.forfeited = refinery.forfeited + penalty;
    let payout = coin::mint(&mut refinery.treasury, received, ctx);
    transfer::public_transfer(payout, sender);
    event::emit(EarlyClaimed { owner: sender, gross, received, penalty });
}

/// Withdraws up to `max_positions` wallet-indexed positions in one bounded
/// transaction. Already-vested portions are paid without a penalty; the 10%
/// early penalty applies only to each position's still-unrefined remainder.
/// Repeating this call lets the UI provide a safe "withdraw all" workflow for
/// wallets with more positions than one transaction can process.
public entry fun claim_all_early_v2(
    refinery: &mut Refinery,
    v2: &mut RefineryV2,
    clock: &Clock,
    max_positions: u64,
    ctx: &mut TxContext,
) {
    assert_v2_binding(refinery, v2);
    assert!(max_positions > 0, E_ZERO_REWARD);
    let sender = tx_context::sender(ctx);
    assert!(table::contains(&v2.wallets, sender), E_NO_REWARD);
    let now = clock.timestamp_ms();
    let mut gross = 0;
    let mut received = 0;
    let mut penalty = 0;
    let mut removed = 0;
    let empty;
    {
        let wallet = table::borrow_mut(&mut v2.wallets, sender);
        while (removed < max_positions && !wallet.positions.is_empty()) {
            let UnrefinedPosition { owner: _, amount, awarded_at_ms, matures_at_ms, claimed: _ } = wallet.positions.pop_back();
            let refined = vested_amount(amount, awarded_at_ms, matures_at_ms, now);
            let unrefined = amount - refined;
            let position_penalty = mul_div(unrefined, EARLY_PENALTY_BPS, BPS);
            gross = gross + amount;
            penalty = penalty + position_penalty;
            received = received + amount - position_penalty;
            removed = removed + 1;
        };
        empty = wallet.positions.is_empty();
    };
    assert!(removed > 0 && received > 0, E_NO_REWARD);
    v2.open_positions = v2.open_positions - removed;
    if (empty) {
        let WalletPositions { positions } = table::remove(&mut v2.wallets, sender);
        positions.destroy_empty();
        v2.active_wallets = v2.active_wallets - 1;
    };
    refinery.minted = refinery.minted + received;
    refinery.forfeited = refinery.forfeited + penalty;
    let payout = coin::mint(&mut refinery.treasury, received, ctx);
    transfer::public_transfer(payout, sender);
    event::emit(EarlyClaimed { owner: sender, gross, received, penalty });
}

public fun v2_open_positions(v2: &RefineryV2): u64 { v2.open_positions }
public fun v2_active_wallets(v2: &RefineryV2): u64 { v2.active_wallets }
public fun v2_migration_complete(v2: &RefineryV2): bool { v2.migration_complete }

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
    let payout: Coin<DSLVR> = coin::mint(&mut refinery.treasury, amount, ctx);
    transfer::public_transfer(payout, sender);
    event::emit(RefinedClaimed { owner: sender, amount });
}

/// Claim every DSLVR portion that has vested for the sender in one transaction.
/// Partially vested positions retain their unvested balance and continue on the
/// original seven-day schedule. Fully vested positions are closed.
public entry fun claim_all_refined(
    refinery: &mut Refinery,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    let sender = tx_context::sender(ctx);
    let now = clock.timestamp_ms();
    let mut total = 0;
    let mut i = 0;
    while (i < refinery.positions.length()) {
        let position = refinery.positions.borrow_mut(i);
        if (position.owner == sender && !position.claimed) {
            let available = vested_amount(position.amount, position.awarded_at_ms, position.matures_at_ms, now);
            if (available > 0) {
                total = total + available;
                if (available == position.amount) {
                    position.claimed = true;
                } else {
                    position.amount = position.amount - available;
                    position.awarded_at_ms = now;
                };
            };
        };
        i = i + 1;
    };
    assert!(total > 0, E_NO_REWARD);

    refinery.minted = refinery.minted + total;
    let payout: Coin<DSLVR> = coin::mint(&mut refinery.treasury, total, ctx);
    transfer::public_transfer(payout, sender);
    event::emit(RefinedClaimed { owner: sender, amount: total });
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

    let payout: Coin<DSLVR> = coin::mint(&mut refinery.treasury, received, ctx);
    transfer::public_transfer(payout, sender);
    event::emit(EarlyClaimed { owner: sender, gross, received, penalty });
}

public fun max_supply(): u64 { MAX_SUPPLY }
public fun refining_period_ms(): u64 { REFINE_MS }
public fun awarded(refinery: &Refinery): u64 { refinery.awarded }
public fun minted(refinery: &Refinery): u64 { refinery.minted }
public fun forfeited(refinery: &Refinery): u64 { refinery.forfeited }
public fun position_count(refinery: &Refinery): u64 { refinery.positions.length() }

fun vested_amount(amount: u64, starts: u64, matures: u64, now: u64): u64 {
    if (now >= matures) amount
    else if (now <= starts) 0
    else mul_div(amount, now - starts, matures - starts)
}

fun mul_div(value: u64, numerator: u64, denominator: u64): u64 {
    (((value as u128) * (numerator as u128)) / (denominator as u128)) as u64
}

#[test]
fun test_supply_and_refining_constants() {
    assert!(MAX_SUPPLY == 5_000_000_000_000, 100);
    assert!(REFINE_MS == 604_800_000, 101);
}

#[test]
fun test_gradual_vesting_math() {
    assert!(vested_amount(700_000, 1_000, 8_000, 1_000) == 0, 120);
    assert!(vested_amount(700_000, 1_000, 8_000, 4_500) == 350_000, 121);
    assert!(vested_amount(700_000, 1_000, 8_000, 8_000) == 700_000, 122);
}

#[test]
fun test_early_penalty_is_ten_percent() {
    let gross = 12_640_000;
    let penalty = mul_div(gross, EARLY_PENALTY_BPS, BPS);
    assert!(penalty == 1_264_000, 110);
    assert!(gross - penalty == 11_376_000, 111);
}

#[test]
fun test_v2_bounded_migration_and_wallet_claim() {
    let admin = @0xA;
    let alice = @0xB;
    let bob = @0xC;
    let mut scenario = test_scenario::begin(admin);
    init(DSLVR {}, scenario.ctx());

    scenario.next_tx(admin);
    {
        let mut refinery = scenario.take_shared<Refinery>();
        let cap = scenario.take_from_sender<RewardCap>();
        let clock = sui::clock::create_for_testing(scenario.ctx());
        award_from_game(&mut refinery, &cap, alice, 700_000, &clock);
        award_from_game(&mut refinery, &cap, bob, 1_400_000, &clock);
        create_and_share_v2(&mut refinery, &cap, scenario.ctx());
        sui::clock::share_for_testing(clock);
        test_scenario::return_shared(refinery);
        transfer::public_transfer(cap, admin);
    };

    scenario.next_tx(admin);
    {
        let mut refinery = scenario.take_shared<Refinery>();
        let mut v2 = scenario.take_shared<RefineryV2>();
        migrate_to_v2(&mut refinery, &mut v2, 1);
        assert!(v2.open_positions == 1, 130);
        assert!(!v2.migration_complete, 131);
        migrate_to_v2(&mut refinery, &mut v2, 1);
        assert!(v2.open_positions == 2, 132);
        assert!(v2.active_wallets == 2, 133);
        assert!(v2.migration_complete, 134);
        test_scenario::return_shared(refinery);
        test_scenario::return_shared(v2);
    };

    scenario.next_tx(alice);
    {
        let mut refinery = scenario.take_shared<Refinery>();
        let mut v2 = scenario.take_shared<RefineryV2>();
        let mut clock = scenario.take_shared<Clock>();
        sui::clock::increment_for_testing(&mut clock, REFINE_MS);
        claim_all_refined_v2(&mut refinery, &mut v2, &clock, scenario.ctx());
        assert!(refinery.minted == 700_000, 135);
        assert!(v2.open_positions == 1, 136);
        assert!(v2.active_wallets == 1, 137);
        test_scenario::return_shared(refinery);
        test_scenario::return_shared(v2);
        test_scenario::return_shared(clock);
    };

    scenario.end();
}

#[test]
fun test_v2_bulk_early_claim_penalizes_only_unrefined_portions() {
    let admin = @0xD;
    let alice = @0xE;
    let mut scenario = test_scenario::begin(admin);
    init(DSLVR {}, scenario.ctx());

    scenario.next_tx(admin);
    {
        let mut refinery = scenario.take_shared<Refinery>();
        let cap = scenario.take_from_sender<RewardCap>();
        let clock = sui::clock::create_for_testing(scenario.ctx());
        award_from_game(&mut refinery, &cap, alice, 1_000_000, &clock);
        award_from_game(&mut refinery, &cap, alice, 2_000_000, &clock);
        create_and_share_v2(&mut refinery, &cap, scenario.ctx());
        sui::clock::share_for_testing(clock);
        test_scenario::return_shared(refinery);
        transfer::public_transfer(cap, admin);
    };

    scenario.next_tx(admin);
    {
        let mut refinery = scenario.take_shared<Refinery>();
        let mut v2 = scenario.take_shared<RefineryV2>();
        migrate_to_v2(&mut refinery, &mut v2, 10);
        assert!(v2.open_positions == 2, 140);
        test_scenario::return_shared(refinery);
        test_scenario::return_shared(v2);
    };

    scenario.next_tx(alice);
    {
        let mut refinery = scenario.take_shared<Refinery>();
        let mut v2 = scenario.take_shared<RefineryV2>();
        let mut clock = scenario.take_shared<Clock>();
        sui::clock::increment_for_testing(&mut clock, REFINE_MS / 2);
        claim_all_early_v2(&mut refinery, &mut v2, &clock, 10, scenario.ctx());
        // Half of 3 DSLVR is refined and penalty-free. Only the remaining
        // 1.5 DSLVR receives the 10% (0.15 DSLVR) early penalty.
        assert!(refinery.minted == 2_850_000, 141);
        assert!(refinery.forfeited == 150_000, 142);
        assert!(v2.open_positions == 0, 143);
        assert!(v2.active_wallets == 0, 144);
        test_scenario::return_shared(refinery);
        test_scenario::return_shared(v2);
        test_scenario::return_shared(clock);
    };

    scenario.end();
}

// New reward pages are opt-in. Existing wallet vectors and claim functions stay valid.
const PAGE_SIZE: u64 = 128;
const MAX_CLAIM_PAGES: u64 = 8;
const E_BAD_PAGE_BATCH: u64 = 10;
public struct PagedMarkerKey has copy, drop, store {}
public struct PagedWalletKey has copy, drop, store { owner: address }
public struct RewardPageKey has copy, drop, store { owner: address, page: u64 }
public struct PagedWallet has store { next_page: u64, tail_page: u64, open_positions: u64, first_page: u64 }
public struct PagedStats has store { open_positions: u64 }
public struct RewardPaged has copy, drop { owner: address, page: u64 }

public(package) fun enable_paged_rewards(refinery: &Refinery, v2: &mut RefineryV2, cap: &RewardCap) {
    assert_v2_binding(refinery, v2);
    assert!(object::id(cap) == v2.reward_cap_id, E_NOT_AUTHORIZED);
    if (!dynamic_field::exists(&v2.id, PagedMarkerKey {})) {
        dynamic_field::add(&mut v2.id, PagedMarkerKey {}, PagedStats { open_positions: 0 });
    };
}

fun insert_paged_position(v2: &mut RefineryV2, position: UnrefinedPosition) {
    let owner = position.owner;
    let wallet_key = PagedWalletKey { owner };
    if (!dynamic_field::exists(&v2.id, wallet_key)) {
        dynamic_field::add(&mut v2.id, wallet_key, PagedWallet { next_page: 0, tail_page: 0, open_positions: 0, first_page: 0 });
    };
    let tail = dynamic_field::borrow<PagedWalletKey, PagedWallet>(&v2.id, wallet_key).tail_page;
    let tail_key = RewardPageKey { owner, page: tail };
    let append = dynamic_field::exists(&v2.id, tail_key)
        && dynamic_field::borrow<RewardPageKey, WalletPositions>(&v2.id, tail_key).positions.length() < PAGE_SIZE;
    let page;
    if (append) {
        page = tail;
        dynamic_field::borrow_mut<RewardPageKey, WalletPositions>(&mut v2.id, tail_key).positions.push_back(position);
    } else {
        let wallet = dynamic_field::borrow_mut<PagedWalletKey, PagedWallet>(&mut v2.id, wallet_key);
        page = wallet.next_page;
        wallet.next_page = page + 1;
        wallet.tail_page = page;
        if (wallet.open_positions == 0) wallet.first_page = page;
        dynamic_field::add(&mut v2.id, RewardPageKey { owner, page }, WalletPositions { positions: vector[position] });
    };
    let wallet = dynamic_field::borrow_mut<PagedWalletKey, PagedWallet>(&mut v2.id, wallet_key);
    wallet.open_positions = wallet.open_positions + 1;
    let stats = dynamic_field::borrow_mut<PagedMarkerKey, PagedStats>(&mut v2.id, PagedMarkerKey {});
    stats.open_positions = stats.open_positions + 1;
    event::emit(RewardPaged { owner, page });
}

/// Caller-supplied page numbers always resolve under the sender's address.
/// At most 1,024 positions are visited. Larger claims require separate batches.
public entry fun claim_refined_pages(
    refinery: &mut Refinery, v2: &mut RefineryV2, clock: &Clock,
    pages: vector<u64>, ctx: &mut TxContext,
) {
    claim_pages(refinery, v2, clock, pages, false, ctx);
}

public entry fun withdraw_early_pages(
    refinery: &mut Refinery, v2: &mut RefineryV2, clock: &Clock,
    pages: vector<u64>, ctx: &mut TxContext,
) {
    claim_pages(refinery, v2, clock, pages, true, ctx);
}

fun claim_pages(
    refinery: &mut Refinery, v2: &mut RefineryV2, clock: &Clock,
    pages: vector<u64>, early: bool, ctx: &mut TxContext,
) {
    assert_v2_binding(refinery, v2);
    assert!(!pages.is_empty() && pages.length() <= MAX_CLAIM_PAGES, E_BAD_PAGE_BATCH);
    let sender = tx_context::sender(ctx);
    let now = clock.timestamp_ms();
    let mut total = 0;
    let mut gross = 0;
    let mut penalty = 0;
    let mut removed = 0;
    let mut p = 0;
    while (p < pages.length()) {
        let page = *pages.borrow(p);
        let mut previous = 0;
        while (previous < p) {
            assert!(*pages.borrow(previous) != page, E_BAD_PAGE_BATCH);
            previous = previous + 1;
        };
        let key = RewardPageKey { owner: sender, page };
        // Already-drained pages are safe to skip when a UI snapshot is stale.
        if (dynamic_field::exists(&v2.id, key)) {
            let mut empty;
            {
                let wallet = dynamic_field::borrow_mut<RewardPageKey, WalletPositions>(&mut v2.id, key);
                let mut i = wallet.positions.length();
                while (i > 0) {
                    i = i - 1;
                    let position = wallet.positions.borrow_mut(i);
                    let available = vested_amount(position.amount, position.awarded_at_ms, position.matures_at_ms, now);
                    if (early || available > 0) {
                        if (early || available == position.amount) {
                            let UnrefinedPosition { owner: _, amount, awarded_at_ms: _, matures_at_ms: _, claimed: _ } = wallet.positions.swap_remove(i);
                            let fee = if (early) mul_div(amount - available, EARLY_PENALTY_BPS, BPS) else 0;
                            total = total + amount - fee;
                            gross = gross + amount;
                            penalty = penalty + fee;
                            removed = removed + 1;
                        } else {
                            total = total + available;
                            position.amount = position.amount - available;
                            position.awarded_at_ms = now;
                        };
                    };
                };
                empty = wallet.positions.is_empty();
            };
            if (empty) {
                let WalletPositions { positions } = dynamic_field::remove<RewardPageKey, WalletPositions>(&mut v2.id, key);
                positions.destroy_empty();
            };
        };
        p = p + 1;
    };
    assert!(total > 0, E_NO_REWARD);
    let wallet = dynamic_field::borrow_mut<PagedWalletKey, PagedWallet>(&mut v2.id, PagedWalletKey { owner: sender });
    wallet.open_positions = wallet.open_positions - removed;
    if (wallet.open_positions == 0) wallet.first_page = wallet.next_page;
    let mut first = wallet.first_page;
    let end = wallet.next_page;
    let mut skipped = 0u64;
    // Cursor maintenance is bounded even when earlier claims left holes.
    while (first < end && skipped < 16 && !dynamic_field::exists(&v2.id, RewardPageKey { owner: sender, page: first })) {
        first = first + 1;
        skipped = skipped + 1;
    };
    dynamic_field::borrow_mut<PagedWalletKey, PagedWallet>(&mut v2.id, PagedWalletKey { owner: sender }).first_page = first;
    let stats = dynamic_field::borrow_mut<PagedMarkerKey, PagedStats>(&mut v2.id, PagedMarkerKey {});
    stats.open_positions = stats.open_positions - removed;
    refinery.minted = refinery.minted + total;
    refinery.forfeited = refinery.forfeited + penalty;
    transfer::public_transfer(coin::mint(&mut refinery.treasury, total, ctx), sender);
    if (early) event::emit(EarlyClaimed { owner: sender, gross, received: total, penalty })
    else event::emit(RefinedClaimed { owner: sender, amount: total });
}


#[test_only]
fun paged_test_setup(): Scenario {
    let mut scenario = test_scenario::begin(@0xA);
    init(DSLVR {}, scenario.ctx());
    scenario.next_tx(@0xA);
    {
        let mut refinery = scenario.take_shared<Refinery>();
        let cap = scenario.take_from_sender<RewardCap>();
        let clock = sui::clock::create_for_testing(scenario.ctx());
        award_from_game(&mut refinery, &cap, @0xB, 2_000_000, &clock);
        create_and_share_v2(&mut refinery, &cap, scenario.ctx());
        sui::clock::share_for_testing(clock);
        test_scenario::return_shared(refinery);
        transfer::public_transfer(cap, @0xA);
    };
    scenario.next_tx(@0xA);
    {
        let mut refinery = scenario.take_shared<Refinery>();
        let mut v2 = scenario.take_shared<RefineryV2>();
        let clock = scenario.take_shared<Clock>();
        let cap = scenario.take_from_sender<RewardCap>();
        migrate_to_v2(&mut refinery, &mut v2, 10);
        enable_paged_rewards(&refinery, &mut v2, &cap);
        let mut i = 0u64;
        while (i < 129) {
            award_from_game_v2(&mut refinery, &mut v2, &cap, @0xB, 1_000_000, &clock);
            i = i + 1;
        };
        award_from_game_v2(&mut refinery, &mut v2, &cap, @0xC, 1_000_000, &clock);
        assert!(table::borrow(&v2.wallets, @0xB).positions.length() == 1, 201);
        assert!(dynamic_field::borrow<RewardPageKey, WalletPositions>(&v2.id, RewardPageKey { owner: @0xB, page: 0 }).positions.length() == 128, 202);
        let tail = dynamic_field::borrow<RewardPageKey, WalletPositions>(&v2.id, RewardPageKey { owner: @0xB, page: 1 });
        assert!(tail.positions.length() == 1, 203);
        assert!(tail.positions.borrow(0).awarded_at_ms == 0 && tail.positions.borrow(0).matures_at_ms == REFINE_MS, 204);
        test_scenario::return_shared(refinery);
        test_scenario::return_shared(v2);
        test_scenario::return_shared(clock);
        transfer::public_transfer(cap, @0xA);
    };
    scenario
}

#[test]
fun test_paged_boundaries_partial_and_final_claim_preserve_legacy() {
    let mut scenario = paged_test_setup();
    scenario.next_tx(@0xB);
    {
        let mut refinery = scenario.take_shared<Refinery>();
        let mut v2 = scenario.take_shared<RefineryV2>();
        let mut clock = scenario.take_shared<Clock>();
        sui::clock::increment_for_testing(&mut clock, REFINE_MS / 2);
        claim_refined_pages(&mut refinery, &mut v2, &clock, vector[0], scenario.ctx());
        assert!(refinery.minted == 64_000_000, 205);
        assert!(refinery.forfeited == 0, 206);
        assert!(dynamic_field::borrow<PagedWalletKey, PagedWallet>(&v2.id, PagedWalletKey { owner: @0xB }).open_positions == 129, 207);
        sui::clock::increment_for_testing(&mut clock, REFINE_MS / 2);
        claim_refined_pages(&mut refinery, &mut v2, &clock, vector[0, 1], scenario.ctx());
        assert!(refinery.minted == 129_000_000, 208);
        assert!(!dynamic_field::exists(&v2.id, RewardPageKey { owner: @0xB, page: 0 }), 209);
        assert!(!dynamic_field::exists(&v2.id, RewardPageKey { owner: @0xB, page: 1 }), 210);
        assert!(dynamic_field::borrow<PagedWalletKey, PagedWallet>(&v2.id, PagedWalletKey { owner: @0xB }).open_positions == 0, 211);
        assert!(dynamic_field::borrow<PagedWalletKey, PagedWallet>(&v2.id, PagedWalletKey { owner: @0xC }).open_positions == 1, 212);
        claim_all_refined_v2(&mut refinery, &mut v2, &clock, scenario.ctx());
        assert!(refinery.minted == 131_000_000, 213);
        assert!(refinery.awarded == 132_000_000, 214);
        test_scenario::return_shared(refinery);
        test_scenario::return_shared(v2);
        test_scenario::return_shared(clock);
    };
    scenario.next_tx(@0xA);
    {
        let mut refinery = scenario.take_shared<Refinery>();
        let mut v2 = scenario.take_shared<RefineryV2>();
        let clock = scenario.take_shared<Clock>();
        let cap = scenario.take_from_sender<RewardCap>();
        award_from_game_v2(&mut refinery, &mut v2, &cap, @0xB, 1_000_000, &clock);
        assert!(dynamic_field::exists(&v2.id, RewardPageKey { owner: @0xB, page: 2 }), 215);
        test_scenario::return_shared(refinery);
        test_scenario::return_shared(v2);
        test_scenario::return_shared(clock);
        transfer::public_transfer(cap, @0xA);
    };
    scenario.end();
}

#[test]
fun test_paged_early_penalty_only_on_unrefined_balance() {
    let mut scenario = paged_test_setup();
    scenario.next_tx(@0xB);
    {
        let mut refinery = scenario.take_shared<Refinery>();
        let mut v2 = scenario.take_shared<RefineryV2>();
        let mut clock = scenario.take_shared<Clock>();
        sui::clock::increment_for_testing(&mut clock, REFINE_MS / 2);
        withdraw_early_pages(&mut refinery, &mut v2, &clock, vector[0, 1], scenario.ctx());
        assert!(refinery.minted == 122_550_000, 216);
        assert!(refinery.forfeited == 6_450_000, 217);
        assert!(table::borrow(&v2.wallets, @0xB).positions.length() == 1, 218);
        test_scenario::return_shared(refinery);
        test_scenario::return_shared(v2);
        test_scenario::return_shared(clock);
    };
    scenario.end();
}

#[test, expected_failure(abort_code = E_NO_REWARD)]
fun test_paged_other_wallet_cannot_claim() {
    let mut scenario = paged_test_setup();
    scenario.next_tx(@0xD);
    let mut refinery = scenario.take_shared<Refinery>();
    let mut v2 = scenario.take_shared<RefineryV2>();
    let clock = scenario.take_shared<Clock>();
    withdraw_early_pages(&mut refinery, &mut v2, &clock, vector[0, 1], scenario.ctx());
    abort 999
}

#[test, expected_failure(abort_code = E_BAD_PAGE_BATCH)]
fun test_paged_duplicate_pages_rejected() {
    let mut scenario = paged_test_setup();
    scenario.next_tx(@0xB);
    let mut refinery = scenario.take_shared<Refinery>();
    let mut v2 = scenario.take_shared<RefineryV2>();
    let clock = scenario.take_shared<Clock>();
    withdraw_early_pages(&mut refinery, &mut v2, &clock, vector[0, 0], scenario.ctx());
    abort 999
}

#[test, expected_failure(abort_code = E_BAD_PAGE_BATCH)]
fun test_paged_oversized_claim_rejected() {
    let mut scenario = paged_test_setup();
    scenario.next_tx(@0xB);
    let mut refinery = scenario.take_shared<Refinery>();
    let mut v2 = scenario.take_shared<RefineryV2>();
    let clock = scenario.take_shared<Clock>();
    withdraw_early_pages(&mut refinery, &mut v2, &clock, vector[0, 1, 2, 3, 4, 5, 6, 7, 8], scenario.ctx());
    abort 999
}


#[test, expected_failure(abort_code = E_NO_REWARD)]
fun test_paged_same_timestamp_cannot_claim_twice() {
    let mut scenario = paged_test_setup();
    scenario.next_tx(@0xB);
    let mut refinery = scenario.take_shared<Refinery>();
    let mut v2 = scenario.take_shared<RefineryV2>();
    let mut clock = scenario.take_shared<Clock>();
    sui::clock::increment_for_testing(&mut clock, REFINE_MS / 2);
    claim_refined_pages(&mut refinery, &mut v2, &clock, vector[0], scenario.ctx());
    claim_refined_pages(&mut refinery, &mut v2, &clock, vector[0], scenario.ctx());
    abort 999
}

#[test, expected_failure(abort_code = E_BAD_PAGE_BATCH)]
fun test_paged_empty_batch_rejected() {
    let mut scenario = paged_test_setup();
    scenario.next_tx(@0xB);
    let mut refinery = scenario.take_shared<Refinery>();
    let mut v2 = scenario.take_shared<RefineryV2>();
    let clock = scenario.take_shared<Clock>();
    claim_refined_pages(&mut refinery, &mut v2, &clock, vector[], scenario.ctx());
    abort 999
}


#[test]
fun test_paged_stats_and_cursor_after_out_of_order_claims() {
    let mut scenario = paged_test_setup();
    scenario.next_tx(@0xB);
    {
        let mut refinery = scenario.take_shared<Refinery>();
        let mut v2 = scenario.take_shared<RefineryV2>();
        let mut clock = scenario.take_shared<Clock>();
        sui::clock::increment_for_testing(&mut clock, REFINE_MS);
        assert!(dynamic_field::borrow<PagedMarkerKey, PagedStats>(&v2.id, PagedMarkerKey {}).open_positions == 130, 230);
        claim_refined_pages(&mut refinery, &mut v2, &clock, vector[1], scenario.ctx());
        assert!(dynamic_field::borrow<PagedWalletKey, PagedWallet>(&v2.id, PagedWalletKey { owner: @0xB }).first_page == 0, 231);
        assert!(dynamic_field::borrow<PagedMarkerKey, PagedStats>(&v2.id, PagedMarkerKey {}).open_positions == 129, 232);
        claim_refined_pages(&mut refinery, &mut v2, &clock, vector[0], scenario.ctx());
        assert!(dynamic_field::borrow<PagedWalletKey, PagedWallet>(&v2.id, PagedWalletKey { owner: @0xB }).first_page == 2, 233);
        assert!(dynamic_field::borrow<PagedMarkerKey, PagedStats>(&v2.id, PagedMarkerKey {}).open_positions == 1, 234);
        test_scenario::return_shared(refinery);
        test_scenario::return_shared(v2);
        test_scenario::return_shared(clock);
    };
    scenario.end();
}

#[test, expected_failure(abort_code = E_NOT_AUTHORIZED)]
fun test_paged_activation_rejects_wrong_capability() {
    let mut scenario = paged_test_setup();
    scenario.next_tx(@0xA);
    let refinery = scenario.take_shared<Refinery>();
    let mut v2 = scenario.take_shared<RefineryV2>();
    let wrong_cap = RewardCap { id: object::new(scenario.ctx()) };
    enable_paged_rewards(&refinery, &mut v2, &wrong_cap);
    abort 999
}
