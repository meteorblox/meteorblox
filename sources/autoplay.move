module meteorblox::autoplay;

use sui::balance::{Self, Balance};
use sui::clock::Clock;
use sui::coin::{Self, Coin};
use sui::event;
use sui::random::{Self, Random};
use sui::sui::SUI;
use sui::transfer;
use sui::tx_context::{Self, TxContext};
use meteorblox::game::{Self, Game};

const TILE_COUNT: u8 = 25;
const E_NOT_OWNER: u64 = 1;
const E_INVALID_PLAN: u64 = 2;
const E_DUPLICATE_TILE: u64 = 3;
const E_WRONG_FUNDING: u64 = 4;
const E_PLAN_NOT_FOUND: u64 = 5;

public struct Registry has key {
    id: UID,
    plans: vector<Plan>,
    next_plan_id: u64,
}

public struct Plan has store {
    plan_id: u64,
    owner: address,
    tiles: vector<u8>,
    amount_per_tile: u64,
    rounds_remaining: u64,
    last_round_played: u64,
    funds: Balance<SUI>,
    active: bool,
}

public struct RegistryCreated has copy, drop { registry: ID }
public struct PlanCreated has copy, drop {
    registry: ID,
    plan_id: u64,
    owner: address,
    rounds: u64,
    amount_per_tile: u64,
    tile_count: u64,
}
public struct PlanExecuted has copy, drop { registry: ID, plan_id: u64, owner: address, round: u64 }
public struct PlanCancelled has copy, drop { registry: ID, plan_id: u64, owner: address, refund: u64 }

/// One official shared registry is created after the package upgrade. It is
/// intentionally permissionless to execute; only a plan owner can cancel.
public entry fun create_registry(ctx: &mut TxContext) {
    let registry = Registry { id: object::new(ctx), plans: vector[], next_plan_id: 1 };
    let id = object::id(&registry);
    transfer::share_object(registry);
    event::emit(RegistryCreated { registry: id });
}

/// Funds every selected tile for every requested future round in one wallet
/// approval. The exact total is required so no funds can become ambiguous.
public entry fun create_plan(
    registry: &mut Registry,
    tiles: vector<u8>,
    amount_per_tile: u64,
    rounds: u64,
    payment: Coin<SUI>,
    ctx: &TxContext,
) {
    assert!(!tiles.is_empty() && amount_per_tile > 0 && rounds > 0, E_INVALID_PLAN);
    let mut i = 0;
    while (i < tiles.length()) {
        let tile = *tiles.borrow(i);
        assert!(tile < TILE_COUNT, E_INVALID_PLAN);
        let mut j = i + 1;
        while (j < tiles.length()) {
            assert!(tile != *tiles.borrow(j), E_DUPLICATE_TILE);
            j = j + 1;
        };
        i = i + 1;
    };
    let tile_count = tiles.length();
    let required = amount_per_tile * tile_count * rounds;
    assert!(coin::value(&payment) == required, E_WRONG_FUNDING);
    let owner = tx_context::sender(ctx);
    let plan_id = registry.next_plan_id;
    registry.next_plan_id = plan_id + 1;
    registry.plans.push_back(Plan {
        plan_id,
        owner,
        tiles,
        amount_per_tile,
        rounds_remaining: rounds,
        last_round_played: 0,
        funds: coin::into_balance(payment),
        active: true,
    });
    event::emit(PlanCreated { registry: object::id(registry), plan_id, owner, rounds, amount_per_tile, tile_count });
}

/// Retained with its original signature for package upgrade compatibility.
public entry fun execute_round(registry: &mut Registry, game: &mut Game, clock: &Clock) {
    let current_round = game::round(game);
    let registry_id = object::id(registry);
    let mut index = 0;
    while (index < registry.plans.length()) {
        let plan = registry.plans.borrow_mut(index);
        if (plan.active && plan.rounds_remaining > 0 && plan.last_round_played < current_round) {
            let owner = plan.owner;
            let plan_id = plan.plan_id;
            let mut tile_index = 0;
            while (tile_index < plan.tiles.length()) {
                let payment = balance::split(&mut plan.funds, plan.amount_per_tile);
                game::place_for(game, *plan.tiles.borrow(tile_index), payment, owner, clock);
                tile_index = tile_index + 1;
            };
            plan.rounds_remaining = plan.rounds_remaining - 1;
            plan.last_round_played = current_round;
            if (plan.rounds_remaining == 0) plan.active = false;
            event::emit(PlanExecuted { registry: registry_id, plan_id, owner, round: current_round });
        };
        if (!plan.active) {
            let Plan { plan_id: _, owner: _, tiles: _, amount_per_tile: _, rounds_remaining: _, last_round_played: _, funds, active: _ } = registry.plans.swap_remove(index);
            balance::destroy_zero(funds);
        } else {
            index = index + 1;
        };
    };
}

/// Executes each plan on a fresh random set of blocks for the round.
public entry fun execute_random_round(
    registry: &mut Registry,
    game: &mut Game,
    random_state: &Random,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    let current_round = game::round(game);
    let registry_id = object::id(registry);
    let mut generator = random::new_generator(random_state, ctx);
    let mut index = 0;
    while (index < registry.plans.length()) {
        let plan = registry.plans.borrow_mut(index);
        if (plan.active && plan.rounds_remaining > 0 && plan.last_round_played < current_round) {
            let owner = plan.owner;
            let plan_id = plan.plan_id;
            let mut available = vector[];
            let mut candidate = 0;
            while (candidate < TILE_COUNT) {
                available.push_back(candidate);
                candidate = candidate + 1;
            };
            let mut tile_index = 0;
            while (tile_index < plan.tiles.length()) {
                let random_index = generator.generate_u64_in_range(0, available.length() - 1);
                let random_tile = available.swap_remove(random_index);
                let payment = balance::split(&mut plan.funds, plan.amount_per_tile);
                game::place_for(game, random_tile, payment, owner, clock);
                tile_index = tile_index + 1;
            };
            plan.rounds_remaining = plan.rounds_remaining - 1;
            plan.last_round_played = current_round;
            if (plan.rounds_remaining == 0) plan.active = false;
            event::emit(PlanExecuted { registry: registry_id, plan_id, owner, round: current_round });
        };
        if (!plan.active) {
            let Plan { plan_id: _, owner: _, tiles: _, amount_per_tile: _, rounds_remaining: _, last_round_played: _, funds, active: _ } = registry.plans.swap_remove(index);
            balance::destroy_zero(funds);
        } else {
            index = index + 1;
        };
    };
}

public entry fun cancel_plan(registry: &mut Registry, plan_id: u64, ctx: &mut TxContext) {
    let owner = tx_context::sender(ctx);
    let mut index = 0;
    let mut found = false;
    while (index < registry.plans.length() && !found) {
        found = registry.plans.borrow(index).plan_id == plan_id;
        if (!found) index = index + 1;
    };
    assert!(found, E_PLAN_NOT_FOUND);
    let plan = registry.plans.borrow_mut(index);
    assert!(plan.owner == owner, E_NOT_OWNER);
    plan.active = false;
    plan.rounds_remaining = 0;
    let refund = balance::value(&plan.funds);
    if (refund > 0) {
        transfer::public_transfer(coin::from_balance(balance::withdraw_all(&mut plan.funds), ctx), owner);
    };
    let Plan { plan_id: _, owner: _, tiles: _, amount_per_tile: _, rounds_remaining: _, last_round_played: _, funds, active: _ } = registry.plans.swap_remove(index);
    balance::destroy_zero(funds);
    event::emit(PlanCancelled { registry: object::id(registry), plan_id, owner, refund });
}

public fun plan_count(registry: &Registry): u64 { registry.plans.length() }
