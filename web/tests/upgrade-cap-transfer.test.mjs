import test from 'node:test';
import assert from 'node:assert/strict';
import { bcs } from '@mysten/sui/bcs';
import { fromBase64 } from '@mysten/sui/utils';
import { approvedCapTransfer as approved, buildApprovedCapTransfer } from '../app/upgrade-cap-transfer.ts';
const state = {capId: approved.capId, owner: approved.from, upgradeReady: true};
test('approved transfer contains only the exact capability and recipient', () => {
  const data = buildApprovedCapTransfer(approved.from, state).getData();
  assert.equal(data.sender, approved.from);
  assert.equal(data.commands.length, 1);
  assert.equal(data.commands[0].$kind, 'TransferObjects');
  assert.equal(data.inputs[0].UnresolvedObject.objectId, approved.capId);
  assert.equal(bcs.Address.parse(fromBase64(data.inputs[1].Pure.bytes)), approved.to);
});
test('wrong signer, changed owner, unexpected capability and stale upgrade state are rejected', () => {
  assert.throws(() => buildApprovedCapTransfer(approved.to, state));
  for (const change of [{owner: approved.to}, {owner: null}, {capId: '0x1'}, {upgradeReady: false}]) {
    assert.throws(() => buildApprovedCapTransfer(approved.from, {...state, ...change}));
  }
});
