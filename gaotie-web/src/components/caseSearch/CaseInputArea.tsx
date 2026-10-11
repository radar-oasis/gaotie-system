import { useState } from 'react';
import { ArrowUpIcon } from 'tdesign-icons-react';
import { useCaseSearch } from '../../context/CaseSearchContext';
export default function CaseInputArea({onSendMessage}:{onSendMessage:(content:string)=>void}) {
 const [input,setInput]=useState('');
 const {isLoading}=useCaseSearch();
 const send=()=>{if(input.trim()&&!isLoading){onSendMessage(input.trim());setInput('');}};
 return <div className="case-composer-wrap"><div className="case-composer workspace-composer">
 <textarea aria-label="案例需求" placeholder="描述你想找的案例…" value={input} disabled={isLoading}
 onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing&&e.keyCode!==229){e.preventDefault();send();}}}/>
 <button className="workspace-send" title="发送（Enter）" type="button" aria-label="发送案例需求" onClick={send} disabled={!input.trim()||isLoading}><ArrowUpIcon/></button>
 </div>{isLoading&&<p className="case-status" role="status">正在检索案例…</p>}</div>;
}
