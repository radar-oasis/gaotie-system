import { CloseIcon } from 'tdesign-icons-react';
import { useCaseSearch } from '../../context/CaseSearchContext';
import { resolveBackendImageUrl } from '../../utils/backendUrls';
export default function SelectedCasesSidebar({onConfirm}:{onConfirm:()=>void}){
 const {selectedCases,removeCase,updateCaseDescription}=useCaseSearch();
 return <aside className="case-selected" aria-label="已选案例">
 <header><h2>已选案例</h2><span className="case-count">{selectedCases.length}</span></header>
 <div className="case-selected-list">{!selectedCases.length?<p className="case-empty">选取案例，加入参考</p>:selectedCases.map(c=><article className="case-selected-card" key={c.id}>
 <div className="case-selected-image">{c.image?<img src={resolveBackendImageUrl(c.image)} alt={c.title}/>:<span>暂无图片</span>}
 <button type="button" className="case-remove" aria-label={`删除 ${c.title}`} title="移除" onClick={()=>removeCase(c.id)}><CloseIcon/></button></div>
 <h3>{c.title}</h3><label><span>参考说明</span><textarea aria-label={`${c.title}的参考说明`} value={c.userDescription||''} placeholder="想参考哪些细节？" onChange={e=>updateCaseDescription(c.id,e.target.value)}/></label>
 </article>)}</div>
 <footer><button className="case-confirm" type="button" disabled={!selectedCases.length} onClick={onConfirm}>确认参考{selectedCases.length>0?` · ${selectedCases.length}`:''}</button></footer>
 </aside>;
}
