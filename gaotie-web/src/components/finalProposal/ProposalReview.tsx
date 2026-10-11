import {resolveBackendImageUrl} from '../superCanvas/imageUrls';
import type {GeneratedProposal} from './finalProposalTypes';
export const REVIEW_CHECKS = [
 ['doors','门窗避让符合布局要求'],
 ['layout','色带位置、比例及配色符合要求'],
 ['motif','文化纹样与标识没有误改'],
 ['preservation','非目标区域与边缘衔接已检查'],
] as const;
export function beginProposalReview(previous:GeneratedProposal|null):GeneratedProposal['review'] {
 return {status:'pending',checks:[],previous:previous?{...previous,review:previous.review?.status === 'accepted' ? {...previous.review,previous:undefined} : undefined}:undefined};
}
export default function ProposalReview({proposal,onChange,disabled}:{proposal:GeneratedProposal;onChange:(proposal:GeneratedProposal|null)=>void;disabled:boolean}) {
 const review=proposal.review;
 if(!review)return <p className="proposal-review-legacy">历史方案：未记录逐项视觉验收。</p>;
 if(review.status==='accepted')return <p className="proposal-review-accepted" role="status">已完成人工视觉验收，可保存方案。{proposal.editProtection&&'选区外像素已由服务端保护。'}</p>;
 const complete=REVIEW_CHECKS.every(([key])=>review.checks.includes(key));
 return <section className="proposal-review" aria-label="生成结果验收">
   <h2>待验收结果</h2><p>逐项检查后再接受。生成成功不代表布局约束已满足。</p>
   {review.previous&&<details open><summary>前后对照</summary><div className="proposal-review-comparison"><figure><img src={resolveBackendImageUrl(review.previous.imageUrl)} alt="修改前方案"/><figcaption>修改前 V{review.previous.version}</figcaption></figure><figure><img src={resolveBackendImageUrl(proposal.imageUrl)} alt="待验收方案"/><figcaption>本次结果 V{proposal.version}</figcaption></figure></div></details>}
   {proposal.editProtection&&<p>保护范围：选区外像素保持不变。选区：左 {Math.round(proposal.editProtection.region.x*100)}%、上 {Math.round(proposal.editProtection.region.y*100)}%、宽 {Math.round(proposal.editProtection.region.width*100)}%、高 {Math.round(proposal.editProtection.region.height*100)}%。</p>}
   <div className="proposal-review-checks">{REVIEW_CHECKS.map(([key,label])=><label key={key}><input type="checkbox" disabled={disabled} checked={review.checks.includes(key)} onChange={e=>onChange({...proposal,review:{...review,checks:e.target.checked?[...review.checks,key]:review.checks.filter(k=>k!==key)}})}/>{label}</label>)}</div>
   <button type="button" disabled={disabled||!complete} onClick={()=>onChange({...proposal,review:{status:'accepted',checks:review.checks,acceptedAt:new Date().toISOString()}})}>接受本次结果</button>
   <button type="button" disabled={disabled} onClick={()=>onChange(review.previous??null)}>放弃本次结果{review.previous?'，恢复上一版':''}</button>
 </section>;
}
