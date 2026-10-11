import {useRef} from 'react';
import {resolveBackendImageUrl} from '../superCanvas/imageUrls';
import type {EditRegion} from './finalProposalTypes';

export default function LocalEditControls({imageUrl,mode,onModeChange,region,onRegionChange,disabled}:{
 imageUrl:string;mode:'global'|'local';onModeChange:(mode:'global'|'local')=>void;region?:EditRegion;onRegionChange:(region:EditRegion|undefined)=>void;disabled:boolean;
}) {
 const start=useRef<{x:number;y:number}|null>(null);
 const position=(event:React.PointerEvent<HTMLDivElement>)=>{const bounds=event.currentTarget.getBoundingClientRect();return {x:Math.max(0,Math.min(1,(event.clientX-bounds.left)/bounds.width)),y:Math.max(0,Math.min(1,(event.clientY-bounds.top)/bounds.height))};};
 return <section className="local-edit-controls" aria-label="修改范围">
   <label>修改方式 <select aria-label="修改方式" value={mode} disabled={disabled} onChange={e=>onModeChange(e.target.value as 'global'|'local')}><option value="global">整图调整（全图可能变化）</option><option value="local">局部编辑（保护选区外）</option></select></label>
   {mode==='local' && <>
    <p>在图上拖动框选要修改的区域。框外像素保持原样；选区内部效果和边缘衔接仍需检查。</p>
    <div className="local-edit-image" aria-label="框选局部编辑区域" onPointerDown={e=>{if(disabled)return;e.preventDefault();start.current=position(e);e.currentTarget.setPointerCapture(e.pointerId);}}
     onPointerMove={e=>{if(!start.current||disabled)return;const end=position(e);onRegionChange({x:Math.min(start.current.x,end.x),y:Math.min(start.current.y,end.y),width:Math.abs(end.x-start.current.x),height:Math.abs(end.y-start.current.y)});}}
     onPointerUp={()=>{start.current=null;}} onPointerCancel={()=>{start.current=null;}}>
      <img src={resolveBackendImageUrl(imageUrl)} alt="局部编辑选区基图" draggable={false}/>
      {region&&<div className="local-edit-rectangle" style={{left:`${region.x*100}%`,top:`${region.y*100}%`,width:`${region.width*100}%`,height:`${region.height*100}%`}}/>}
    </div>
    <div className="local-edit-numbers">{(['x','y','width','height'] as const).map((key,i)=><label key={key}>{['左侧','顶部','宽度','高度'][i]} %<input type="number" min={0} max={100} step={.1} aria-label={`${['左侧','顶部','宽度','高度'][i]}百分比`} disabled={disabled} value={region?Math.round(region[key]*1000)/10:''} onChange={e=>onRegionChange({...region??{x:0,y:0,width:0,height:0},[key]:Number(e.target.value)/100})}/></label>)}
    <button type="button" disabled={disabled} onClick={()=>onRegionChange(undefined)}>清除选区</button></div>
   </>}
 </section>;
}
