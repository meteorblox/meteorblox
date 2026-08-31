module slvrblox::ledger;

use std::option::{Self, Option};
use sui::balance::{Self, Balance};
use sui::coin;
use sui::event;
use sui::sui::SUI;
use sui::transfer;
use sui::tx_context::{Self, TxContext};

const E_NO_CREDIT: u64 = 1;

/// SUI winnings are credited here during settlement. Round progression never
/// waits for a player to claim them.
public struct Credit has store {
    owner: address,
    sui: Balance<SUI>,
}

public struct Ledger has key {
    id: UID,
    game: ID,
    credits: vector<Credit>,
}

public struct SuiCredited has copy, drop {
    owner: address,
    round: u64,
    amount: u64,
}

public struct SuiClaimed has copy, drop {
    owner: address,
    amount: u64,
}

public(package) fun create(game: ID, ctx: &mut TxContext) {
    transfer::share_object(Ledger { id: object::new(ctx), game, credits: vector[] });
}

public(package) fun assert_game(ledger: &Ledger, game: ID) {
    assert!(ledger.game == game, E_NO_CREDIT);
}

public(package) fun credit(
    ledger: &mut Ledger,
    owner: address,
    round: u64,
    payout: Balance<SUI>,
) {
    let amount = balance::value(&payout);
    let mut found: Option<u64> = option::none();
    let mut i = 0;
    while (i < ledger.credits.length() && option::is_none(&found)) {
        if (ledger.credits.borrow(i).owner == owner) option::fill(&mut found, i);
        i = i + 1;
    };
    if (option::is_some(&found)) {
        balance::join(&mut ledger.credits.borrow_mut(*option::borrow(&found)).sui, payout);
    } else {
        ledger.credits.push_back(Credit { owner, sui: payout });
    };
    event::emit(SuiCredited { owner, round, amount });
}

public entry fun claim_sui(ledger: &mut Ledger, ctx: &mut TxContext) {
    let owner = tx_context::sender(ctx);
    let mut found: Option<u64> = option::none();
    let mut i = 0;
    while (i < ledger.credits.length() && option::is_none(&found)) {
        let credit = ledger.credits.borrow(i);
        if (credit.owner == owner && balance::value(&credit.sui) > 0) option::fill(&mut found, i);
        i = i + 1;
    };
    assert!(option::is_some(&found), E_NO_CREDIT);
    let found_index = *option::borrow(&found);
    let claim_amount = balance::value(&ledger.credits.borrow(found_index).sui);
    let payout = balance::split(&mut ledger.credits.borrow_mut(found_index).sui, claim_amount);
    let amount = balance::value(&payout);
    transfer::public_transfer(coin::from_balance(payout, ctx), owner);
    event::emit(SuiClaimed { owner, amount });
}

public fun balance_for(ledger: &Ledger, owner: address): u64 {
    let mut amount = 0;
    let mut i = 0;
    while (i < ledger.credits.length()) {
        let credit = ledger.credits.borrow(i);
        if (credit.owner == owner) amount = balance::value(&credit.sui);
        i = i + 1;
    };
    amount
}
