// Read-only public testnet simulation. No signer or private key is used.
import { SuiGrpcClient } from '@mysten/sui/grpc';
import { Transaction } from '@mysten/sui/transactions';
import { refineryUpgradeData as artifact } from '../app/refinery-upgrade-data.ts';
const client = new SuiGrpcClient({ network: 'testnet', baseUrl: 'https://fullnode.testnet.sui.io:443' });
const capId = '0xae3f9a21abae0ae5e36c943e3e4a28d10f760832d5c6c9ba68c54bc4eb6c647d';
const { object: cap } = await client.core.getObject({ objectId: capId, include: { json: true } });
if (cap.json.version !== artifact.expectedVersion || cap.json.package !== artifact.expectedPackage || cap.json.policy !== 0) {
  throw new Error('Upgrade capability no longer matches the reviewed baseline');
}
if (cap.owner.$kind !== 'AddressOwner') throw new Error('Upgrade capability is not address-owned');
const tx = new Transaction();
tx.setSender(cap.owner.AddressOwner);
tx.setGasBudget(1_000_000_000);
const ticket = tx.moveCall({ target: '0x2::package::authorize_upgrade', arguments: [
  tx.object(capId), tx.pure.u8(0), tx.pure.vector('u8', artifact.digest),
] });
const receipt = tx.upgrade({ modules: [...artifact.modules], dependencies: [...artifact.dependencies], package: cap.json.package, ticket });
tx.moveCall({ target: '0x2::package::commit_upgrade', arguments: [tx.object(capId), receipt] });
const simulation = await client.core.simulateTransaction({ transaction: tx, include: { effects: true } });
const result = simulation.Transaction ?? simulation.FailedTransaction;
console.log(JSON.stringify({ status: result.status, gas: result.effects?.gasUsed }, null, 2));
if (!result.status.success) process.exitCode = 1;
