module slvrblox::rules;

/// Number of selectable tiles in every SLVRBLOX round.
const TILE_COUNT: u64 = 25;

/// Basis-points denominator.
const BPS: u64 = 10_000;
const PROTOCOL_FEE_BPS: u64 = 1_000;

/// Allocation of the full wager, totaling the 10% protocol fee.
/// Five percent of gross entries is reserved for future open-market DSLVR buybacks.
const TREASURY_BPS: u64 = 500;
const REWARDS_BPS: u64 = 200;

const EEmptyTiles: u64 = 1;
const ETooManyTiles: u64 = 2;
const EInvalidTile: u64 = 3;
const EDuplicateTile: u64 = 4;
const EInvalidAmount: u64 = 5;
const EInvalidRounds: u64 = 6;
const EOverflow: u64 = 7;

/// Exact payout allocation for a settled round. Rounding dust stays in the
/// winning pool, so the four outputs always sum exactly to `gross`.
public struct Allocation has copy, drop, store {
    winner_pool: u64,
    treasury: u64,
    rewards: u64,
    ops: u64,
}

/// Validate a user's tile selection. Tile IDs are zero-based: 0 through 24.
public fun validate_tiles(tiles: &vector<u8>) {
    let count = tiles.length();
    assert!(count > 0, EEmptyTiles);
    assert!(count <= TILE_COUNT, ETooManyTiles);

    let mut i = 0;
    while (i < count) {
        let tile = *tiles.borrow(i);
        assert!((tile as u64) < TILE_COUNT, EInvalidTile);

        let mut j = i + 1;
        while (j < count) {
            assert!(tile != *tiles.borrow(j), EDuplicateTile);
            j = j + 1;
        };
        i = i + 1;
    };
}

/// Total SUI (in MIST) required for a multi-tile, multi-round entry.
public fun total_entry(amount_per_tile: u64, tile_count: u64, rounds: u64): u64 {
    assert!(amount_per_tile > 0, EInvalidAmount);
    assert!(tile_count > 0 && tile_count <= TILE_COUNT, ETooManyTiles);
    assert!(rounds > 0, EInvalidRounds);
    assert!(amount_per_tile <= 18_446_744_073_709_551_615 / tile_count, EOverflow);
    let per_round = amount_per_tile * tile_count;
    assert!(per_round <= 18_446_744_073_709_551_615 / rounds, EOverflow);
    per_round * rounds
}

/// Split one round's gross pot according to the immutable 90/7/2/1 model.
public fun allocate(gross: u64): Allocation {
    let protocol_fee = mul_div(gross, PROTOCOL_FEE_BPS, BPS);
    let treasury = mul_div(gross, TREASURY_BPS, BPS);
    let rewards = mul_div(gross, REWARDS_BPS, BPS);
    let ops = protocol_fee - treasury - rewards;
    Allocation {
        winner_pool: gross - protocol_fee,
        treasury,
        rewards,
        ops,
    }
}

/// Proportional claim for one stake on the winning tile. Any final division
/// dust remains claimable by a deterministic last-claimant rule in settlement.
public fun proportional_share(winner_pool: u64, stake: u64, total_winning_stake: u64): u64 {
    assert!(total_winning_stake > 0, EInvalidAmount);
    assert!(stake <= total_winning_stake, EInvalidAmount);
    mul_div(winner_pool, stake, total_winning_stake)
}

fun mul_div(value: u64, numerator: u64, denominator: u64): u64 {
    (((value as u128) * (numerator as u128)) / (denominator as u128)) as u64
}

public fun winner_pool(a: &Allocation): u64 { a.winner_pool }
public fun treasury(a: &Allocation): u64 { a.treasury }
public fun rewards(a: &Allocation): u64 { a.rewards }
public fun ops(a: &Allocation): u64 { a.ops }

#[test]
fun test_exact_90_5_2_3_split() {
    let a = allocate(10_000);
    assert!(a.winner_pool == 9_000, 100);
    assert!(a.treasury == 500, 101);
    assert!(a.rewards == 200, 102);
    assert!(a.ops == 300, 103);
    assert!(a.winner_pool + a.treasury + a.rewards + a.ops == 10_000, 104);
}

#[test]
fun test_rounding_dust_never_escapes() {
    let a = allocate(11);
    assert!(a.winner_pool + a.treasury + a.rewards + a.ops == 11, 110);
}

#[test]
fun test_multi_round_total() {
    assert!(total_entry(10_000_000, 5, 10) == 500_000_000, 120);
}

#[test]
fun test_proportional_winner_share() {
    assert!(proportional_share(9_000, 2, 5) == 3_600, 130);
}

#[test]
fun test_valid_tiles() {
    validate_tiles(&vector[0, 7, 24]);
}

#[test, expected_failure(abort_code = EDuplicateTile)]
fun test_duplicate_tile_rejected() {
    validate_tiles(&vector[3, 3]);
}

#[test, expected_failure(abort_code = EInvalidTile)]
fun test_tile_25_rejected() {
    validate_tiles(&vector[25]);
}

#[test, expected_failure(abort_code = EOverflow)]
fun test_total_overflow_rejected() {
    total_entry(18_446_744_073_709_551_615, 25, 1);
}

