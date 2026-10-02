// Serialize writes and use database revisions to prevent silent overwrites.
export function createWorkspaceSync({revision=0,save,onStatus=()=>{}}){
 let pending=null,running=false,blocked=false,status='saved';
 const report=next=>{status=next;onStatus(next,revision,pending);};
 async function drain(){
  if(running||blocked||!pending)return;
  running=true;report('saving');
  while(pending&&!blocked){
   const snapshot=pending;
   try{
    const result=await save(snapshot,revision);
    if(!Number.isSafeInteger(result.revision)||result.revision!==revision+1)throw new Error('Invalid cloud response');
    revision=result.revision;if(pending===snapshot)pending=null;else report('saving');
   }catch(error){blocked=error.status===409;running=false;report(blocked?'conflict':error.status===401?'signed-out':'offline');return;}
  }
  running=false;report('saved');
 }
 return {enqueue(state){pending=JSON.parse(JSON.stringify(state));report(blocked?'conflict':running?'saving':'pending');void drain();},retry(){void drain();},get status(){return status;},get revision(){return revision;}};
}
