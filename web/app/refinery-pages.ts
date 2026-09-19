import { bcs } from "@mysten/sui/bcs";
import { ObjectError, type ClientWithCoreApi } from "@mysten/sui/client";
import { deriveDynamicFieldID } from "@mysten/sui/utils";

export const PositionBcs = bcs.struct("UnrefinedPosition", {
  owner: bcs.Address, amount: bcs.u64(), awarded_at_ms: bcs.u64(), matures_at_ms: bcs.u64(), claimed: bcs.bool(),
});
export const WalletPositionsBcs = bcs.struct("WalletPositions", { positions: bcs.vector(PositionBcs) });
export const PagedWalletBcs = bcs.struct("PagedWallet", {
  next_page: bcs.u64(), tail_page: bcs.u64(), open_positions: bcs.u64(), first_page: bcs.u64(),
});
export const PagedStatsBcs = bcs.struct("PagedStats", { open_positions: bcs.u64() });
export const PageKeyBcs = bcs.struct("RewardPageKey", { owner: bcs.Address, page: bcs.u64() });
export type RewardPosition = ReturnType<typeof PositionBcs.parse>;
export type RewardPage = { page: string; positions: RewardPosition[] };
export function isMissingObject(error: unknown): boolean {
  return error instanceof ObjectError && (error.reason === "notFound" || error.reason === "deleted");
}
const markers = new Map<string, { type: string; bcs: Uint8Array }>();

async function findMarker(client: ClientWithCoreApi, parentId: string) {
  const cached = markers.get(parentId);
  if (cached) return cached;
  let cursor: string | null = null;
  for (let batch = 0; batch < 100; batch++) {
    const result = await client.core.listDynamicFields({ parentId, cursor, limit: 100 });
    const marker = result.dynamicFields.find((field) => field.name.type.endsWith("::dslvr::PagedMarkerKey"));
    if (marker) { markers.set(parentId, marker.name); return marker.name; }
    if (!result.hasNextPage) return null;
    if (!result.cursor || result.cursor === cursor) throw new Error("Reward page discovery did not advance");
    cursor = result.cursor;
  }
  throw new Error("Reward page discovery exceeded its read limit; balances unavailable");
}

export async function readPagedRewards(client: ClientWithCoreApi, parentId: string, owner: string) {
  const name = await findMarker(client, parentId);
  if (!name) return { enabled: false, openPositions: 0n, pages: [] as RewardPage[] };
  const { dynamicField: marker } = await client.core.getDynamicField({ parentId, name });
  const stats = PagedStatsBcs.parse(marker.value.bcs);
  const typePackage = name.type.split("::")[0];
  if (!owner) return { enabled: true, openPositions: BigInt(stats.open_positions), pages: [] as RewardPage[] };
  const walletName = { type: `${typePackage}::dslvr::PagedWalletKey`, bcs: bcs.Address.serialize(owner).toBytes() };
  const readWallet = () => client.core.getDynamicField({ parentId, name: walletName });
  for (let attempt = 0; attempt < 2; attempt++) {
    let before;
    try { before = (await readWallet()).dynamicField; }
    catch (error) { if (isMissingObject(error)) return { enabled: true, openPositions: BigInt(stats.open_positions), pages: [] as RewardPage[] }; throw error; }
    const wallet = PagedWalletBcs.parse(before.value.bcs);
    const first = BigInt(wallet.first_page), end = BigInt(wallet.next_page);
    if (first > end || end - first > 10_000n) throw new Error("Reward history needs a paginated read; balances unavailable");
    const pages: RewardPage[] = [];
    let changed = false;
    for (let offset = first; offset < end; offset += 50n) {
      const ids: string[] = [], numbers: string[] = [];
      for (let number = offset; number < end && number < offset + 50n; number++) {
        numbers.push(String(number));
        ids.push(deriveDynamicFieldID(parentId, `${typePackage}::dslvr::RewardPageKey`, PageKeyBcs.serialize({ owner, page: number }).toBytes()));
      }
      const { objects } = await client.core.getObjects({ objectIds: ids, include: { content: true } });
      if (objects.length !== ids.length) throw new Error("Incomplete reward page response");
      for (let index = 0; index < objects.length; index++) {
        const object = objects[index];
        if (object instanceof Error) { if (isMissingObject(object)) continue; throw object; }
        // Field UID (32 bytes), then address + u64 key (40 bytes).
        if (!object.content) throw new Error("Reward page content unavailable");
        const positions = WalletPositionsBcs.parse(object.content.slice(72)).positions;
        if (positions.length > 128 || positions.some((position) => position.owner.toLowerCase() !== owner.toLowerCase() || position.claimed)) {
          throw new Error("Unexpected reward page contents");
        }
        pages.push({ page: numbers[index], positions });
      }
    }
    const after = (await readWallet()).dynamicField;
    changed = before.digest !== after.digest;
    const count = pages.reduce((total, page) => total + BigInt(page.positions.length), 0n);
    if (!changed && count === BigInt(wallet.open_positions)) return { enabled: true, openPositions: BigInt(stats.open_positions), pages };
  }
  throw new Error("Rewards changed while loading. Please refresh before claiming.");
}
