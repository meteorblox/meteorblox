import test from 'node:test';
import assert from 'node:assert/strict';
import { bcs } from '@mysten/sui/bcs';
import { ObjectError } from '@mysten/sui/client';
import { readPagedRewards, PagedWalletBcs, PagedStatsBcs, WalletPositionsBcs } from '../app/refinery-pages.ts';
import { planRefineryClaims } from '../app/refinery-claim-plan.ts';

const owner='0x'+'b'.padStart(64,'0');
let parentCounter=10;
function fixture({missing=[],fail=false,mismatch=false,racing=false,noWallet=false,active=true}={}) {
 const parentId='0x'+String(parentCounter++).padStart(64,'0');
 const position={owner,amount:'1000000',awarded_at_ms:'0',matures_at_ms:'604800000',claimed:false};
 let walletReads=0;
 const client={core:{
  listDynamicFields:async()=>({dynamicFields:active?[{name:{type:'0x123::dslvr::PagedMarkerKey',bcs:new Uint8Array([0])}}]:[],hasNextPage:false,cursor:null}),
  getDynamicField:async({name})=>{
   if(name.type.endsWith('PagedMarkerKey'))return{dynamicField:{value:{bcs:PagedStatsBcs.serialize({open_positions:2}).toBytes()}}};
   if(noWallet)throw new ObjectError('NOT_FOUND','missing',{reason:'notFound'});
   walletReads++;
   return {dynamicField:{digest:racing?String(walletReads):'same',value:{bcs:PagedWalletBcs.serialize({next_page:3,tail_page:2,first_page:0,open_positions:mismatch?3:2}).toBytes()}}};
  },
  getObjects:async({objectIds})=>({objects:objectIds.map((id,i)=>{
    if(fail && i===1)return new ObjectError('INTERNAL','node unavailable',{reason:'unknown'});
    if(i===1||missing.includes(i))return new ObjectError('NOT_FOUND','drained',{reason:'notFound'});
    return{objectId:id,content:Uint8Array.from([...new Uint8Array(72),...WalletPositionsBcs.serialize({positions:[position]}).toBytes()])};
  })}),
 }};
 return {client,parentId};
}
test('pages include active records around deleted holes',async()=>{
 const {client,parentId}=fixture();const result=await readPagedRewards(client,parentId,owner);
 assert.deepEqual(result.pages.map(p=>p.page),['0','2']);assert.equal(result.pages.flatMap(p=>p.positions).length,2);
});
test('inactive refinery and missing wallet are empty, not errors',async()=>{
 for(const options of [{active:false},{noWallet:true}]){const {client,parentId}=fixture(options);assert.equal((await readPagedRewards(client,parentId,owner)).pages.length,0);}
});
test('RPC failure never becomes a zero reward balance',async()=>{
 const {client,parentId}=fixture({fail:true});await assert.rejects(readPagedRewards(client,parentId,owner),/node unavailable/);
});
test('missing active pages and changing reads do not return partial balances',async()=>{
 for(const options of [{mismatch:true},{racing:true},{missing:[2]}]){const {client,parentId}=fixture(options);await assert.rejects(readPagedRewards(client,parentId,owner),/changed while loading/);}
});
const base={refineryV2Id:'v2',upgradeCap:{version:'14'},legacyRefinedPositions:0,legacyUnrefinedPositions:0,v2RefinedPositions:0,v2UnrefinedPositions:0,v2WalletPositions:0,rewardPages:[]};
test('mixed claims include legacy and V2 rewards and split nine pages into eight plus one',()=>{
 const state={...base,legacyRefinedPositions:2,v2RefinedPositions:10,rewardPages:Array.from({length:9},(_,i)=>({page:String(i),refinedPositions:1,unrefinedPositions:0}))};
 const batches=planRefineryClaims(state,false);
 assert.deepEqual(batches.map(b=>b[0].target),['claim_all_refined','claim_all_refined_v2','claim_refined_pages','claim_refined_pages']);
 assert.deepEqual(batches.slice(2).map(b=>b[0].pages.length),[8,1]);
});
test('page-only early withdrawal does not incorrectly call the empty legacy refinery',()=>{
 const batches=planRefineryClaims({...base,rewardPages:[{page:'9',refinedPositions:1,unrefinedPositions:1}]},true);
 assert.equal(batches.length,1);assert.equal(batches[0][0].target,'withdraw_early_pages');
});
test('large early V2 withdrawals use separate bounded approvals',()=>{
 const batches=planRefineryClaims({...base,v2WalletPositions:2501,v2UnrefinedPositions:1},true);
 assert.equal(batches.length,3);assert.ok(batches.every(b=>b.length===1&&b[0].maxPositions===1000));
});
test('empty and ineligible pages produce no transaction; page IDs are deduplicated',()=>{
 assert.deepEqual(planRefineryClaims(base,false),[]);
 const page={page:'2',refinedPositions:1,unrefinedPositions:0};
 assert.deepEqual(planRefineryClaims({...base,rewardPages:[page,page]},false)[0][0].pages,['2']);
 assert.deepEqual(planRefineryClaims({...base,rewardPages:[page]},true),[]);
});
