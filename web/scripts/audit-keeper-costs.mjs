import { SuiGraphQLClient } from '@mysten/sui/graphql';
import { SuiGrpcClient } from '@mysten/sui/grpc';
import { writeFile } from 'node:fs/promises';
const address='0xf03dfdd7c9f36d3ceed427538f3b717e79c22119df99171cb04e7013216cb960';
const gql=new SuiGraphQLClient({network:'testnet',url:'https://graphql.testnet.sui.io/graphql'});
const grpc=new SuiGrpcClient({network:'testnet',baseUrl:'https://fullnode.testnet.sui.io:443'});
const now=Date.now(), since=now-86400000;
const balance=await grpc.core.getBalance({owner:address});
const rows=[]; let before, complete=false;
for(let page=0;page<50;page++){
  const result=await gql.core.listTransactions({filter:{sender:address},limit:50,order:'descending',before,include:{effects:true,transaction:true,balanceChanges:true},signal:AbortSignal.timeout(30000)});
  for(const item of result.transactions){
    const tx=item.Transaction??item.FailedTransaction;
    if(tx.timestampMs!==null&&tx.timestampMs<since){complete=true;break;}
    const gas=tx.effects.gasUsed;
    rows.push({digest:tx.digest,time:tx.timestampMs,success:tx.status.success,error:tx.status.error,
      calls:tx.transaction.commands.filter(c=>c.$kind==='MoveCall').map(c=>`${c.MoveCall.module}::${c.MoveCall.function}`).join(', '),
      gasSui:Number(BigInt(gas.computationCost)+BigInt(gas.storageCost)-BigInt(gas.storageRebate))/1e9,
      keeperChangeSui:tx.balanceChanges.filter(b=>b.address===address&&b.coinType.endsWith('::sui::SUI')).reduce((s,b)=>s+Number(b.amount)/1e9,0)});
  }
  if(complete||!result.hasNextPage){complete=true;break;}
  before=result.endCursor;
  if(page%10===9)console.log(`Read ${rows.length} transactions`);
}
const groups={};for(const row of rows){const key=`${row.success?'ok':'FAILED'} ${row.calls}`;groups[key]??={count:0,gasSui:0,keeperChangeSui:0,example:row.digest};groups[key].count++;groups[key].gasSui+=row.gasSui;groups[key].keeperChangeSui+=row.keeperChangeSui;}
const report={address,asOf:new Date(now).toISOString(),since:new Date(since).toISOString(),complete,balanceSui:Number(balance.balance.balance)/1e9,transactions:rows.length,groups,rows};
if(process.argv[2])await writeFile(process.argv[2],JSON.stringify(report,null,2));
console.log(JSON.stringify({...report,rows:undefined},null,2));
