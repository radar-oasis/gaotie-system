// @vitest-environment happy-dom
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
import ProposalReview,{beginProposalReview} from './ProposalReview';
import GenerationPreview from './GenerationPreview';
import type {GeneratedProposal} from './finalProposalTypes';
(globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
const base:GeneratedProposal={id:'base',version:1,imageUrl:'/old.png',promptUsed:'p',designRationale:'r',createdAt:'now'};
it('requires every visual check, supports comparison and reverts the exact baseline',async()=>{
 const host=document.createElement('div'), root=createRoot(host);const change=vi.fn();
 let proposal:GeneratedProposal={...base,id:'next',version:2,review:beginProposalReview(base)};
 const render=()=>root.render(<><ProposalReview proposal={proposal} onChange={change} disabled={false}/><GenerationPreview currentProposal={proposal} isGenerating={false} errorMessage="" onArchive={()=>{}} onClearCurrentProposal={()=>{}}/></>);
 try{
 await act(async()=>render());
 const button=(name:string)=>Array.from(host.querySelectorAll('button')).find(b=>b.textContent===name)!;
 expect(button('保存方案').disabled).toBe(true);expect(button('接受本次结果').disabled).toBe(true);
 expect(host.querySelector('img[alt="修改前方案"]')).not.toBeNull();
 await act(async()=>button('放弃本次结果，恢复上一版').click());expect(change.mock.calls.at(-1)![0]).toEqual({...base,review:undefined});
 for(let i=0;i<4;i++){
 await act(async()=>host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')[i].click());
 proposal=change.mock.calls.at(-1)![0];await act(async()=>render());
 if(i<3)expect(button('接受本次结果').disabled).toBe(true);
 }
 await act(async()=>button('接受本次结果').click());proposal=change.mock.calls.at(-1)![0];
 expect(proposal.review?.status).toBe('accepted');expect(proposal.review?.previous).toBeUndefined();await act(async()=>render());expect(button('保存方案').disabled).toBe(false);
 }finally{await act(async()=>root.unmount());}
});
it('retains accepted checks and timestamp when preparing a reversible next candidate',()=>{
 const previous={...base,review:{status:'accepted' as const,checks:['doors','layout','motif','preservation'],acceptedAt:'2026-10-09T00:00:00Z'}};
 expect(beginProposalReview(previous)?.previous?.review).toEqual({...previous.review,previous:undefined});
});
