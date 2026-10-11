import type { CaseReference } from '../../context/CaseSearchContext';
import { resolveBackendImageUrl } from '../../utils/backendUrls';
import { AddIcon, CheckIcon } from 'tdesign-icons-react';
interface Props {caseRef:CaseReference;isSelected:boolean;onSelect:(c:CaseReference)=>void;showDescription?:boolean;description?:string;onDescriptionChange?:(s:string)=>void}
export default function CaseCard({caseRef,isSelected,onSelect,showDescription=false,description='',onDescriptionChange}:Props){
 return <article className={`case-card ${isSelected?'is-selected':''}`}>
 <div className="case-card-image">{caseRef.image?<img src={resolveBackendImageUrl(caseRef.image)} alt={caseRef.title}/>:<span>暂无图片</span>}
 <button className="case-select" type="button" aria-label={`选取 ${caseRef.title}`} aria-pressed={isSelected} disabled={isSelected} onClick={()=>onSelect(caseRef)} title={isSelected?'已选取':'添加参考'}>{isSelected?<CheckIcon/>:<AddIcon/>}</button></div>
 <h3>{caseRef.title}</h3>
 {showDescription&&onDescriptionChange&&<textarea aria-label={`${caseRef.title}的参考说明`} value={description} onChange={e=>onDescriptionChange(e.target.value)} placeholder="添加参考说明…"/>}
 </article>;
}
