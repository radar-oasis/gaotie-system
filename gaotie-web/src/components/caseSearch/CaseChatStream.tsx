import { useEffect,useRef } from 'react';
import { useCaseSearch } from '../../context/CaseSearchContext';
import CaseCard from './CaseCard';
export default function CaseChatStream(){
 const {chatHistory,selectedCases,addCase}=useCaseSearch();
 const scroll=useRef<HTMLDivElement>(null);
 const following=useRef(true);
 useEffect(()=>{if(scroll.current&&following.current)scroll.current.scrollTop=scroll.current.scrollHeight;},[chatHistory]);
 return <div className="case-stream" ref={scroll} role="log" aria-label="案例对话" aria-live="polite" tabIndex={0}
 onScroll={e=>{const p=e.currentTarget;following.current=p.scrollHeight-p.scrollTop-p.clientHeight<80;}}>
 {!chatHistory.length?<div className="case-empty">想找什么样的涂装案例？</div>:chatHistory.map(m=><article key={m.id} className={`case-message ${m.role}`} aria-label={m.role==='user'?'你的消息':'案例助手回复'}>
 <p className="case-message-text">{m.content}</p>
 {!!m.cases?.length&&<div className="case-results">{m.cases.map(item=><CaseCard key={item.id} caseRef={item} isSelected={selectedCases.some(c=>c.id===item.id)} onSelect={addCase}/>)}</div>}
 </article>)}</div>;
}
