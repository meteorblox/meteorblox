
import { SuiGrpcClient } from "@mysten/sui/grpc";

export const dynamic = "force-dynamic";

const client = new SuiGrpcClient({ network: "testnet", baseUrl: "https://fullnode.testnet.sui.io:443" });
const ids = {
  game: "0xed69d2784a34e80ac206750ddfef18ede5f447aa8c9299c4bc64c81434c1f7fe",
  refinery: "0x6d66c03dc8b5d5994af512a66bdc09f2b22917f7c2d19d5430d6867e22c13895",
  upgradeCap: "0xe8a428db6b93487e7f59ffe593bb8f6e384e56ecbad5df1fd0ddc1811d1f972c",
};

export default async function Diagnostics() {
  const [{ object: game }, { object: refinery }, { object: upgradeCap }, ownerObjects] = await Promise.all([
    client.core.getObject({ objectId: ids.game, include: { json: true } }),
    client.core.getObject({ objectId: ids.refinery, include: { json: true } }),
    client.core.getObject({ objectId: ids.upgradeCap, include: { json: true } }),
    client.core.listOwnedObjects({ owner: "0x55f035832afb21499461d62630ed4b1cdf6e53b2a43f907e6db55a91eb114781", type: "0x2::package::UpgradeCap", include: { json: true }, limit: 50 }),
  ]);
  const data = {
    gameType: (game as { type?: string }).type ?? null,
    refineryType: (refinery as { type?: string }).type ?? null,
    upgradeCap: (upgradeCap as { json?: unknown }).json ?? null,
    ownerUpgradeCaps: ownerObjects.objects.map((object) => ({ objectId: object.objectId, json: object.json })),
  };
  return <main><h1>METEORBLOX Testnet diagnostics</h1><pre>{JSON.stringify(data, null, 2)}</pre></main>;
}

