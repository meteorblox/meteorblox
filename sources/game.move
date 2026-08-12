module meteorblox::game;

use std::option::{Self, Option};
use sui::balance::{Self, Balance};
use sui::clock::Clock;
use sui::coin::{Self, Coin};
use sui::event;
use sui::random::{Self, Random};
use sui::sui::SUI;
use sui::transfer;
use sui::tx_context::{Self, TxContext};
use meteorblox::mtbx::{Self, Refinery, RewardCap};

const TILE_COUNT: u8 = 25;
const ROUND_MS: u64 = 60_000;
const BPS: u64 = 10_000;
const PROTOCOL_FEE_BPS: u64 = 1_000;
const TREASURY_BPS: u64 = 700;
const REWARDS_BPS: u64 = 200;
/// Each settled round distributes 0.25 unrefined MTBX across winning stakes.
const MTBX_ROUND_REWARD: u64 = 250_000;

const E_NOT_ADMIN: u64 = 1;
const E_ROUND_CLOSED: u64 = 2;
const E_ROUND_OPEN: u64 = 3;
const E_INVALID_TILE: u64 = 4;
const E_ZERO_STAKE: u64 = 5;
const E_NOT_SETTLED: u64 = 6;
const E_NO_CLAIM: u64 = 7;
const E_WINNER_EMPTY: u64 = 8;
const E_CLAIMS_PENDING: u64 = 9;
const E_REWARDS_NOT_BOUND: u64 = 10;
const E_REWARDS_ALREADY_BOUND: u64 = 11;

public struct Entry has store {
    player: address,
    round: u64,
    tile: u8,
    stake: u64,
    claimed: bool,
}

public struct Game has key {
    id: UID,
    admin: address,
    round: u64,
    closes_at_ms: u64,
    settled: bool,
    winning_tile: Option<u8>,
    tile_totals: vector<u64>,
    entries: vector<Entry>,
    pot: Balance<SUI>,
    winner_pool_initial: u64,
    winning_entries_remaining: u64,
    treasury: Balance<SUI>,
    rewards: Balance<SUI>,
    ops: Balance<SUI>,
    reward_cap: Option<RewardCap>,
    mtbx_reward_initial: u64,
    mtbx_reward_remaining: u64,
}

public struct EntryPlaced has copy, drop {
    player: address,
    round: u64,
    tile: u8,
    amount: u64,
}

public struct RoundSettled has copy, drop {
    round: u64,
    winning_tile: u8,
    gross: u64,
    winner_pool: u64,
}

public struct WinningsClaimed has copy, drop {
    player: address,
    round: u64,
    amount: u64,
    mtbx_amount: u64,
}

fun init(ctx: &mut TxContext) {
    let mut totals = vector[];
    let mut i = 0;
    while (i < TILE_COUNT) {
        totals.push_back(0);
        i = i + 1;
    };
    transfer::share_object(Game {
        id: object::new(ctx),
        admin: tx_context::sender(ctx),
        round: 1,
        closes_at_ms: 0,
        settled: true,
        winning_tile: option::none(),
        tile_totals: totals,
        entries: vector[],
        pot: balance::zero(),
        winner_pool_initial: 0,
        winning_entries_remaining: 0,
        treasury: balance::zero(),
        rewards: balance::zero(),
        ops: balance::zero(),
        reward_cap: option::none(),
        mtbx_reward_initial: 0,
        mtbx_reward_remaining: 0,
    });
}

/// One-time setup transaction after package publication. The unique MTBX
/// authority is consumed into Game so it can never be used for manual awards.
public entry fun bind_mtbx_rewards(
    game: &mut Game,
    reward_cap: RewardCap,
    ctx: &TxContext,
) {
    assert!(tx_context::sender(ctx) == game.admin, E_NOT_ADMIN);
    assert!(option::is_none(&game.reward_cap), E_REWARDS_ALREADY_BOUND);
    game.reward_cap = option::some(reward_cap);
}

/// Admin opens the first round, or the next round after every winning entry
/// from the previous round has claimed.
public entry fun open_next_round(game: &mut Game, clock: &Clock, ctx: &TxContext) {
    assert!(tx_context::sender(ctx) == game.admin, E_NOT_ADMIN);
    assert!(game.settled, E_ROUND_OPEN);
    assert!(game.winning_entries_remaining == 0, E_CLAIMS_PENDING);
    assert!(option::is_some(&game.reward_cap), E_REWARDS_NOT_BOUND);

    game.round = game.round + 1;
    game.closes_at_ms = clock.timestamp_ms() + ROUND_MS;
    game.settled = false;
    game.winning_tile = option::none();
    game.winner_pool_initial = 0;
    game.mtbx_reward_initial = 0;
    game.mtbx_reward_remaining = 0;

    let mut i = 0;
    while (i < TILE_COUNT) {
        *game.tile_totals.borrow_mut(i as u64) = 0;
        i = i + 1;
    };
}

/// Place real SUI on one tile. A programmable transaction can call this
/// repeatedly to fund several tiles with one wallet approval.
public entry fun place(
    game: &mut Game,
    tile: u8,
    payment: Coin<SUI>,
    clock: &Clock,
    ctx: &TxContext,
) {
    assert!(!game.settled && clock.timestamp_ms() < game.closes_at_ms, E_ROUND_CLOSED);
    assert!(tile < TILE_COUNT, E_INVALID_TILE);

    let amount = coin::value(&payment);
    assert!(amount > 0, E_ZERO_STAKE);
    balance::join(&mut game.pot, coin::into_balance(payment));
    *game.tile_totals.borrow_mut(tile as u64) =
        *game.tile_totals.borrow(tile as u64) + amount;
    game.entries.push_back(Entry {
        player: tx_context::sender(ctx),
        round: game.round,
        tile,
        stake: amount,
        claimed: false,
    });
    event::emit(EntryPlaced {
        player: tx_context::sender(ctx),
        round: game.round,
        tile,
        amount,
    });
}

/// Settle with Sui's native on-chain randomness. Anyone may call this after
/// the timer expires. The winner is sampled uniformly from occupied tiles so
/// every successful settlement has one fixed outcome and cannot be retried to
/// reject an empty tile.
public entry fun settle(
    game: &mut Game,
    refinery: &Refinery,
    random_state: &Random,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(!game.settled && clock.timestamp_ms() >= game.closes_at_ms, E_ROUND_OPEN);

    let mut occupied = vector[];
    let mut tile = 0;
    while (tile < TILE_COUNT) {
        if (*game.tile_totals.borrow(tile as u64) > 0) occupied.push_back(tile);
        tile = tile + 1;
    };
    assert!(!occupied.is_empty(), E_WINNER_EMPTY);

    let mut generator = random::new_generator(random_state, ctx);
    let occupied_index = generator.generate_u64_in_range(0, occupied.length() - 1);
    let winner_tile = *occupied.borrow(occupied_index);
    let winning_stake = *game.tile_totals.borrow(winner_tile as u64);

    let gross = balance::value(&game.pot);
    let protocol_fee = mul_div(gross, PROTOCOL_FEE_BPS, BPS);
    let mut fee = balance::split(&mut game.pot, protocol_fee);
    let treasury_amount = mul_div(gross, TREASURY_BPS, BPS);
    let rewards_amount = mul_div(gross, REWARDS_BPS, BPS);
    balance::join(&mut game.treasury, balance::split(&mut fee, treasury_amount));
    balance::join(&mut game.rewards, balance::split(&mut fee, rewards_amount));
    balance::join(&mut game.ops, fee);

    let mut count = 0;
    let mut i = 0;
    while (i < game.entries.length()) {
        let entry = game.entries.borrow(i);
        if (entry.round == game.round && entry.tile == winner_tile) count = count + 1;
        i = i + 1;
    };

    game.settled = true;
    game.winning_tile = option::some(winner_tile);
    game.winner_pool_initial = balance::value(&game.pot);
    game.winning_entries_remaining = count;
    let capacity = mtbx::remaining_award_capacity(refinery);
    let round_reward = if (capacity < MTBX_ROUND_REWARD) capacity else MTBX_ROUND_REWARD;
    game.mtbx_reward_initial = round_reward;
    game.mtbx_reward_remaining = round_reward;

    event::emit(RoundSettled {
        round: game.round,
        winning_tile: winner_tile,
        gross,
        winner_pool: game.winner_pool_initial,
    });
}

/// Claims one winning entry. A player with multiple entries can call this
/// repeatedly in the same programmable transaction.
public entry fun claim(
    game: &mut Game,
    refinery: &mut Refinery,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(game.settled && option::is_some(&game.winning_tile), E_NOT_SETTLED);
    let sender = tx_context::sender(ctx);
    let winner = *option::borrow(&game.winning_tile);
    let winning_total = *game.tile_totals.borrow(winner as u64);

    let mut found = false;
    let mut stake = 0;
    let mut i = 0;
    while (i < game.entries.length() && !found) {
        let entry = game.entries.borrow_mut(i);
        if (entry.round == game.round && entry.tile == winner &&
            entry.player == sender && !entry.claimed) {
            entry.claimed = true;
            stake = entry.stake;
            found = true;
        };
        i = i + 1;
    };
    assert!(found, E_NO_CLAIM);

    let amount = if (game.winning_entries_remaining == 1) {
        balance::value(&game.pot)
    } else {
        mul_div(game.winner_pool_initial, stake, winning_total)
    };
    let mtbx_amount = if (game.winning_entries_remaining == 1) {
        game.mtbx_reward_remaining
    } else {
        mul_div(game.mtbx_reward_initial, stake, winning_total)
    };
    assert!(option::is_some(&game.reward_cap), E_REWARDS_NOT_BOUND);
    if (mtbx_amount > 0) {
        mtbx::award_from_game(
            refinery,
            option::borrow(&game.reward_cap),
            sender,
            mtbx_amount,
            clock,
        );
        game.mtbx_reward_remaining = game.mtbx_reward_remaining - mtbx_amount;
    };
    game.winning_entries_remaining = game.winning_entries_remaining - 1;
    let payout = coin::from_balance(balance::split(&mut game.pot, amount), ctx);
    transfer::public_transfer(payout, sender);
    event::emit(WinningsClaimed {
        player: sender,
        round: game.round,
        amount,
        mtbx_amount,
    });
}

public fun round(game: &Game): u64 { game.round }
public fun closes_at_ms(game: &Game): u64 { game.closes_at_ms }
public fun is_settled(game: &Game): bool { game.settled }
public fun tile_total(game: &Game, tile: u8): u64 {
    assert!(tile < TILE_COUNT, E_INVALID_TILE);
    *game.tile_totals.borrow(tile as u64)
}
public fun pot(game: &Game): u64 { balance::value(&game.pot) }
public fun treasury_balance(game: &Game): u64 { balance::value(&game.treasury) }
public fun rewards_balance(game: &Game): u64 { balance::value(&game.rewards) }
public fun ops_balance(game: &Game): u64 { balance::value(&game.ops) }
public fun mtbx_round_reward(): u64 { MTBX_ROUND_REWARD }

fun mul_div(value: u64, numerator: u64, denominator: u64): u64 {
    (((value as u128) * (numerator as u128)) / (denominator as u128)) as u64
}

#[test]
fun test_fee_math() {
    assert!(mul_div(10_000, PROTOCOL_FEE_BPS, BPS) == 1_000, 100);
    assert!(mul_div(10_000, TREASURY_BPS, BPS) == 700, 101);
    assert!(mul_div(10_000, REWARDS_BPS, BPS) == 200, 102);
}

#[test]
fun test_mtbx_round_reward_is_quarter_token() {
    assert!(MTBX_ROUND_REWARD == 250_000, 110);
}
