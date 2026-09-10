module slvrblox::staking;

use sui::balance::{Self, Balance};
use sui::coin::{Self, Coin};
use sui::clock::{Self, Clock};
use sui::dynamic_field;
use sui::event;
use sui::object::{Self, UID};
use sui::table::{Self, Table};
use sui::transfer;
use sui::tx_context::{Self, TxContext};
use slvrblox::dslvr::DSLVR;

const SCALE: u128 = 1_000_000_000_000;
const E_ZERO_AMOUNT: u64 = 1;
const E_POSITION_NOT_FOUND: u64 = 2;
const E_INSUFFICIENT_STAKE: u64 = 3;
const E_NO_REWARDS: u64 = 4;
const E_NO_STAKERS: u64 = 5;
const E_POSITION_LOCKED: u64 = 6;
const E_USE_LOCKED_API: u64 = 7;
const LOCK_PERIOD_MS: u64 = 604_800_000;

public struct LockKey has copy, drop, store { owner: address }

public struct Position has store {
    staked: Balance<DSLVR>,
    reward_debt_scaled: u128,
    pending_rewards: u64,
}

public struct Vault has key {
    id: UID,
    total_staked: u64,
    rewards: Balance<DSLVR>,
    reward_per_share_scaled: u128,
    positions: Table<address, Position>,
    position_count: u64,
    total_rewards_added: u64,
    total_rewards_claimed: u64,
}

public struct VaultCreated has copy, drop { vault: ID }
public struct Staked has copy, drop { vault: ID, owner: address, amount: u64 }
public struct Unstaked has copy, drop { vault: ID, owner: address, amount: u64 }
public struct RewardsAdded has copy, drop { vault: ID, amount: u64 }
public struct RewardsClaimed has copy, drop { vault: ID, owner: address, amount: u64 }
public struct StakeLockUpdated has copy, drop { vault: ID, owner: address, unlock_at_ms: u64 }

public fun create_vault(ctx: &mut TxContext) {
    let vault = Vault {
        id: object::new(ctx),
        total_staked: 0,
        rewards: balance::zero(),
        reward_per_share_scaled: 0,
        positions: table::new(ctx),
        position_count: 0,
        total_rewards_added: 0,
        total_rewards_claimed: 0,
    };
    let id = object::id(&vault);
    transfer::share_object(vault);
    event::emit(VaultCreated { vault: id });
}

/// Retained for package upgrade compatibility. Use `stake_locked`.
public fun stake(_vault: &mut Vault, _payment: Coin<DSLVR>, _ctx: &mut TxContext) {
    abort E_USE_LOCKED_API
}

public fun stake_locked(vault: &mut Vault, payment: Coin<DSLVR>, clock: &Clock, ctx: &mut TxContext) {
    let amount = coin::value(&payment);
    assert!(amount > 0, E_ZERO_AMOUNT);
    let owner = tx_context::sender(ctx);
    if (table::contains(&vault.positions, owner)) {
        sync_position(vault, owner);
        let position = table::borrow_mut(&mut vault.positions, owner);
        balance::join(&mut position.staked, coin::into_balance(payment));
        position.reward_debt_scaled = debt(balance::value(&position.staked), vault.reward_per_share_scaled);
    } else {
        table::add(&mut vault.positions, owner, Position {
            staked: coin::into_balance(payment),
            reward_debt_scaled: debt(amount, vault.reward_per_share_scaled),
            pending_rewards: 0,
        });
        vault.position_count = vault.position_count + 1;
    };
    vault.total_staked = vault.total_staked + amount;
    let unlock_at_ms = lock_deadline(clock::timestamp_ms(clock));
    let lock_key = LockKey { owner };
    if (dynamic_field::exists(&vault.id, lock_key)) {
        *dynamic_field::borrow_mut(&mut vault.id, lock_key) = unlock_at_ms;
    } else {
        dynamic_field::add(&mut vault.id, lock_key, unlock_at_ms);
    };
    event::emit(Staked { vault: object::id(vault), owner, amount });
    event::emit(StakeLockUpdated { vault: object::id(vault), owner, unlock_at_ms });
}

/// Retained for package upgrade compatibility. Use `unstake_locked`.
public fun unstake(_vault: &mut Vault, _amount: u64, _ctx: &mut TxContext) {
    abort E_USE_LOCKED_API
}

public fun unstake_locked(vault: &mut Vault, amount: u64, clock: &Clock, ctx: &mut TxContext) {
    assert!(amount > 0, E_ZERO_AMOUNT);
    let owner = tx_context::sender(ctx);
    assert!(table::contains(&vault.positions, owner), E_POSITION_NOT_FOUND);
    let lock_key = LockKey { owner };
    if (dynamic_field::exists(&vault.id, lock_key)) {
        assert!(clock::timestamp_ms(clock) >= *dynamic_field::borrow(&vault.id, lock_key), E_POSITION_LOCKED);
    };
    sync_position(vault, owner);
    let position = table::borrow_mut(&mut vault.positions, owner);
    assert!(balance::value(&position.staked) >= amount, E_INSUFFICIENT_STAKE);
    let withdrawn = balance::split(&mut position.staked, amount);
    vault.total_staked = vault.total_staked - amount;
    position.reward_debt_scaled = debt(balance::value(&position.staked), vault.reward_per_share_scaled);
    transfer::public_transfer(coin::from_balance(withdrawn, ctx), owner);
    event::emit(Unstaked { vault: object::id(vault), owner, amount });
}

/// Adds the 10% DSLVR staking allocation from a completed buyback.
public fun add_rewards(vault: &mut Vault, payment: Coin<DSLVR>) {
    let amount = coin::value(&payment);
    assert!(amount > 0, E_ZERO_AMOUNT);
    assert!(vault.total_staked > 0, E_NO_STAKERS);
    balance::join(&mut vault.rewards, coin::into_balance(payment));
    vault.reward_per_share_scaled = vault.reward_per_share_scaled + reward_increment(amount, vault.total_staked);
    vault.total_rewards_added = vault.total_rewards_added + amount;
    event::emit(RewardsAdded { vault: object::id(vault), amount });
}

public fun claim_rewards(vault: &mut Vault, ctx: &mut TxContext) {
    let owner = tx_context::sender(ctx);
    assert!(table::contains(&vault.positions, owner), E_POSITION_NOT_FOUND);
    sync_position(vault, owner);
    let position = table::borrow_mut(&mut vault.positions, owner);
    let amount = position.pending_rewards;
    assert!(amount > 0, E_NO_REWARDS);
    position.pending_rewards = 0;
    let payout = balance::split(&mut vault.rewards, amount);
    vault.total_rewards_claimed = vault.total_rewards_claimed + amount;
    transfer::public_transfer(coin::from_balance(payout, ctx), owner);
    event::emit(RewardsClaimed { vault: object::id(vault), owner, amount });
}

fun sync_position(vault: &mut Vault, owner: address) {
    let position = table::borrow_mut(&mut vault.positions, owner);
    let accrued_scaled = debt(balance::value(&position.staked), vault.reward_per_share_scaled);
    if (accrued_scaled > position.reward_debt_scaled) {
        position.pending_rewards = position.pending_rewards + (((accrued_scaled - position.reward_debt_scaled) / SCALE) as u64);
    };
    position.reward_debt_scaled = accrued_scaled;
}

fun debt(staked: u64, reward_per_share_scaled: u128): u128 {
    (staked as u128) * reward_per_share_scaled
}

fun reward_increment(reward: u64, total_staked: u64): u128 {
    ((reward as u128) * SCALE) / (total_staked as u128)
}

fun lock_deadline(now_ms: u64): u64 { now_ms + LOCK_PERIOD_MS }

public fun total_staked(vault: &Vault): u64 { vault.total_staked }
public fun reward_balance(vault: &Vault): u64 { balance::value(&vault.rewards) }
public fun position_count(vault: &Vault): u64 { vault.position_count }
public fun total_rewards_added(vault: &Vault): u64 { vault.total_rewards_added }
public fun total_rewards_claimed(vault: &Vault): u64 { vault.total_rewards_claimed }
public fun lock_period_ms(): u64 { LOCK_PERIOD_MS }

public fun unlock_at_ms(vault: &Vault, owner: address): u64 {
    let lock_key = LockKey { owner };
    if (dynamic_field::exists(&vault.id, lock_key)) {
        *dynamic_field::borrow(&vault.id, lock_key)
    } else {
        0
    }
}

#[test]
fun test_equal_stakers_split_rewards() {
    let increment = reward_increment(100, 200);
    assert!((debt(100, increment) / SCALE) == 50, 100);
}

#[test]
fun test_proportional_stakers_split_rewards() {
    let increment = reward_increment(80, 400);
    assert!((debt(100, increment) / SCALE) == 20, 101);
    assert!((debt(300, increment) / SCALE) == 60, 102);
}

#[test]
fun test_rounding_never_over_distributes() {
    let increment = reward_increment(10, 3);
    let distributed = (debt(1, increment) / SCALE) * 3;
    assert!(distributed <= 10, 103);
}

#[test]
fun test_seven_day_lock_deadline() {
    assert!(lock_deadline(1_000) == 604_801_000, 104);
    assert!(lock_period_ms() == 604_800_000, 105);
}
