export type ClaimOperation = { target: string; v2: boolean; maxPositions?: number; pages?: string[] };
export type ClaimSnapshot = {
  refineryV2Id: string | null; upgradeCap: { version?: string } | null;
  legacyRefinedPositions: number; legacyUnrefinedPositions: number;
  v2RefinedPositions: number; v2UnrefinedPositions: number; v2WalletPositions: number;
  rewardPages?: Array<{ page: string; refinedPositions: number; unrefinedPositions: number }>;
};

export function planRefineryClaims(state: ClaimSnapshot, early: boolean): ClaimOperation[][] {
  const batches: ClaimOperation[][] = [];
  const version = Number(state.upgradeCap?.version ?? 0);
  const legacyCount = early ? state.legacyUnrefinedPositions : state.legacyRefinedPositions;
  if (legacyCount > 0) {
    const count = !early && version >= 8 ? 1 : legacyCount;
    const target = early ? "claim_early" : version >= 8 ? "claim_all_refined" : "claim_refined";
    for (let index = 0; index < count; index += 8) {
      batches.push(Array.from({ length: Math.min(8, count - index) }, () => ({ target, v2: false })));
    }
  }
  if (state.refineryV2Id && (early ? state.v2UnrefinedPositions : state.v2RefinedPositions) > 0) {
    if (!early) batches.push([{ target: "claim_all_refined_v2", v2: true }]);
    else if (version >= 11) {
      for (let index = 0; index < state.v2WalletPositions; index += 1000) {
        batches.push([{ target: "claim_all_early_v2", v2: true, maxPositions: 1000 }]);
      }
    } else {
      for (let index = 0; index < state.v2UnrefinedPositions; index++) batches.push([{ target: "claim_early_v2", v2: true }]);
    }
  }
  const pages = [...new Set((state.rewardPages ?? []).filter((page) => early ? page.unrefinedPositions > 0 : page.refinedPositions > 0).map((page) => page.page))];
  if (pages.length && !state.refineryV2Id) throw new Error("Reward page refinery is unavailable");
  for (let index = 0; index < pages.length; index += 8) {
    batches.push([{ target: early ? "withdraw_early_pages" : "claim_refined_pages", v2: true, pages: pages.slice(index, index + 8) }]);
  }
  return batches;
}
