import { ArrowUpIcon } from 'tdesign-icons-react';
import { useEffect, useRef, useState } from 'react';
import { resolveBackendImageUrl } from '../../utils/backendUrls';
import type { StudioColor } from './colorStudio';
import { useColorStudio } from './useColorStudio';
import './ColorStudio.css';

export function ColorStrip({colors}:{colors:StudioColor[]}) {
 return <div className="studio-swatches">{colors.map((c,i)=><div key={`${c.hex}-${i}`} style={{flex:Math.max(8,c.proportion)}}><i style={{background:c.hex}}/><span>{c.role}</span><code>{c.hex}</code><small>{c.proportion}%</small></div>)}</div>;
}
function ReferenceImage({url,title}:{url:string;title:string}) {
 const [failed,setFailed]=useState(false);
 const [loaded,setLoaded]=useState(false);
 return <div className="studio-image-preview">
  {failed?<div className="studio-image-failure" role="status">图片加载失败<br/>可查看来源或换一张图片<button type="button" onClick={e=>{e.preventDefault();setFailed(false);setLoaded(false);}}>重新加载图片</button></div>:<>
   {!loaded&&<span className="studio-image-loading">正在加载图片…</span>}
   <img src={resolveBackendImageUrl(url)} referrerPolicy="no-referrer" alt={title} onLoad={()=>setLoaded(true)} onError={()=>setFailed(true)}/>
  </>}
 </div>;
}
export default function ColorConfigPage() {
 const c=useColorStudio();const {studio,setStudio,busy}=c;
 const [input,setInput]=useState('');const [nameEdit,setNameEdit]=useState({id:'',name:''});const [boardName,setBoardName]=useState('');
 const name=nameEdit.id===studio.draftPalette?.id?nameEdit.name:studio.draftPalette?.name ?? '';
 const setName=(value:string)=>setNameEdit({id:studio.draftPalette?.id ?? '',name:value});
 const messages=useRef<HTMLDivElement>(null);
 const following=useRef(true);
 useEffect(()=>{const panel=messages.current;if(panel&&following.current)panel.scrollTop=panel.scrollHeight;},[studio.messages.length,busy]);
 const submit=()=>{if(!input.trim()||busy)return;c.send(input);setInput('');};
 const savePalette=()=>{if(!studio.draftPalette)return;const p={...studio.draftPalette,id:crypto.randomUUID(),name:name.trim()||`色系${studio.palettes.length+1}`};setStudio(s=>({...s,palettes:[...s.palettes,p],activePaletteId:p.id,draftPalette:null}));};
 const saveBoard=()=>{const images=c.selected.length?studio.images.filter(i=>c.selected.includes(i.id)):studio.images;if(!images.length)return;setStudio(s=>({...s,boards:[...s.boards,{id:crypto.randomUUID(),name:boardName.trim()||`色彩看板${s.boards.length+1}`,images,createdAt:new Date().toISOString()}]}));setBoardName('');};
 return <div className="color-studio color-studio--two-column">
  <header className="studio-header"><h1>色彩配置</h1></header>
  <div className="studio-workspace">
   <section className="studio-dialogue" aria-label="色彩对话">
    <h2>色彩对话</h2>
    <details className="studio-context"><summary>参考意象</summary><p>{c.context.length?c.context.join(' · '):'暂无参考意象，可以直接描述色彩需求。'}</p>{studio.autoSearchKey && studio.autoSearchKey!==c.contextKey && <button disabled={!!busy} onClick={()=>c.send('根据更新后的主题重新检索一组配色参考图片。','search',true)}>主题已更新 · 重新搜图</button>}</details>
    <div className="studio-messages" ref={messages} role="log" aria-label="对话记录" tabIndex={0} aria-live="polite" onScroll={e=>{const panel=e.currentTarget;following.current=panel.scrollHeight-panel.scrollTop-panel.clientHeight<60;}}>
     {!studio.messages.length&&<div className="studio-welcome"><p>想要什么样的色彩？</p></div>}
     {studio.messages.map(m=><article key={m.id} aria-label={m.role==='user'?'你的消息':'色彩助手回复'} className={`studio-message ${m.role}`}><p>{m.text}</p></article>)}
     {busy&&<p role="status" className="studio-status">{busy} <button onClick={c.cancel}>停止</button></p>}
     {c.error&&<div role="alert" className="studio-error">{c.error}{c.canRetry&&<button disabled={!!busy} onClick={c.retry}>重试</button>}</div>}
    </div>
    <div className="studio-composer workspace-composer"><textarea aria-label="色彩需求" value={input} disabled={!!busy} maxLength={3000} placeholder="描述你想要的色彩…" onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing&&e.keyCode!==229){e.preventDefault();submit();}}}/><div className="studio-composer-footer"><div className="studio-quick"><button aria-label="寻找参考图片" disabled={!!busy} onClick={()=>c.send(input||'请检索适合当前文化主题的高质量真实配色参考图。','search')}>找参考图</button><button aria-label="直接给我配色" disabled={!!busy} onClick={()=>c.send(input||'请根据当前主题直接建议一套整体配色，不需要检索图片。','palette')}>直接配色</button></div><button className="studio-primary studio-send workspace-send" aria-label="发送需求" disabled={!!busy||!input.trim()} title="发送（Enter）" onClick={submit}><ArrowUpIcon size={22}/></button></div></div>
    <p className="studio-fineprint">发送为对话 · 生成色板请选择「直接配色」，搜图请选择「找参考图」</p>
   </section>
   <main className="studio-results">
    <section className="studio-panel studio-board"><div className="studio-section-title"><h2>灵感看板 <small>· {studio.images.length}</small></h2><label className="studio-upload" title="上传参考图">↑<span className="studio-sr-only">上传参考图</span><input aria-label="上传参考图" type="file" accept="image/png,image/jpeg,image/webp" disabled={!!busy} onChange={e=>{const f=e.target.files?.[0];if(f)c.upload(f);e.target.value='';}}/></label></div>
     {!studio.images.length?<div className="studio-empty">图片会在这里组成看板。也可以跳过图片，直接生成色系。</div>:<div className="studio-image-grid">{studio.images.map(image=><article key={image.id} className={c.selected.includes(image.id)?'selected':''}><label><input type="checkbox" aria-label={`选择 ${image.title}`} checked={c.selected.includes(image.id)} disabled={!!busy||(!c.selected.includes(image.id)&&c.selected.length>=6)} onChange={()=>c.setSelected(s=>s.includes(image.id)?s.filter(x=>x!==image.id):[...s,image.id])}/><ReferenceImage key={image.imageUrl} url={image.imageUrl} title={image.title}/><span>{image.title}</span></label><div>{image.sourceUrl?<a href={image.sourceUrl} target="_blank" rel="noreferrer">查看来源 ↗</a>:<small>用户上传</small>}<button disabled={!!busy} aria-label={`移除 ${image.title}`} onClick={()=>{setStudio(s=>({...s,images:s.images.filter(i=>i.id!==image.id)}));c.setSelected(s=>s.filter(x=>x!==image.id));}}>移除</button></div></article>)}</div>}
     <div className="studio-actions"><span className="studio-selection-count">已选 {c.selected.length} 张</span><button className="studio-primary" disabled={!!busy||!c.selected.length} onClick={c.extract}>提取配色</button><button disabled={!!busy||!studio.images.length} onClick={saveBoard}>保存看板</button></div><details className="studio-board-details"><summary>看板设置与来源说明</summary><input aria-label="看板名称" value={boardName} maxLength={80} onChange={e=>setBoardName(e.target.value)} placeholder={`色彩看板${studio.boards.length+1}`}/><p className="studio-fineprint">最多选取 6 张图片。网络图片仅供参考，保留原始来源；不代表获得商用授权。</p></details>
    </section>
    <section className="studio-panel studio-palette"><div className="studio-palette-header"><h2>配色提案</h2>{studio.draftPalette&&<><input aria-label="色板名称" value={name} maxLength={80} onChange={e=>setName(e.target.value)} placeholder="色板名称"/><button className="studio-save-palette" disabled={!!busy} onClick={savePalette}>保存色板</button></>}</div>{studio.draftPalette?<>
      <ColorStrip colors={studio.draftPalette.colors}/>
      <div className="studio-color-legend">{studio.draftPalette.colors.map((color,index)=><div key={index}><i style={{background:color.hex}}/><span>{color.role}</span><code>{color.hex}</code><small>{color.proportion}%</small></div>)}</div>
      <details className="studio-rationale"><summary>配色依据</summary><p>{studio.draftPalette.rationale}</p><p className="studio-fineprint">{studio.draftPalette.source==='image'?'基于图片候选色。':'AI 配色建议。'}比例为设计建议，不是图片面积测量，最终生图仅参考此配色关系。</p></details>
    </>:<div className="studio-empty studio-palette-empty">从参考图提色，或直接描述配色需求</div>}</section>
    <section className="studio-panel studio-palette-shelf"><h2>已保存色板 <small>· {studio.palettes.length}</small></h2>{!studio.palettes.length&&<p className="studio-muted">暂无保存的色板</p>}<div className="studio-saved-list">{studio.palettes.map(p=><article className={`studio-saved ${studio.activePaletteId===p.id?'is-active':''}`} data-palette-saved key={p.id}><button className="studio-saved-select" aria-label={`选作生成参考：${p.name}`} aria-pressed={studio.activePaletteId===p.id} onClick={()=>setStudio(s=>({...s,activePaletteId:p.id}))}><ColorStrip colors={p.colors}/><span>{p.name}</span>{studio.activePaletteId===p.id&&<span className="studio-saved-check" aria-label="已选作生成参考">✓</span>}</button><button className="studio-saved-edit" onClick={()=>setStudio(s=>({...s,draftPalette:{...p,id:crypto.randomUUID()}}))}>另存 / 改名</button></article>)}</div></section>
    {!!studio.boards.length&&<section className="studio-panel studio-boards"><details><summary>已保存看板 · {studio.boards.length}</summary><div className="studio-board-shelf">{studio.boards.map(b=><button key={b.id} disabled={!!busy} onClick={()=>{setStudio(s=>({...s,images:b.images,lastCandidates:[]}));c.setSelected([]);}}><strong>{b.name}</strong><span>{b.images.length} 张 · 载入看板</span></button>)}</div></details></section>}
   </main>
  </div>
 </div>;
}
