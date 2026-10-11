import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useColorConfig } from '../../context/ColorConfigContext';
import { useSharedTags } from '../../context/SharedTagsContext';
import { useImageSearch } from '../../context/ImageSearchContext';
import { useChat } from '../../context/ChatContext';
import { useProject } from '../../projects/ProjectContext';
import { buildStudioContext, normalizeStudio, type StudioPalette } from './colorStudio';
import { studioChat, extractStudioColors, uploadStudioImage, type StudioMode, type StudioReply } from './colorStudioApi';
const id = () => crypto.randomUUID();
export function useColorStudio() {
 const {studio,setStudio,studioRequestRef,studioReadyProjectId}=useColorConfig();
 const {currentProject}=useProject();const {confirmedTags}=useSharedTags();const {intentFilters,selectedPatterns}=useImageSearch();const {chatHistory}=useChat();
 const context=useMemo(()=>buildStudioContext(confirmedTags,[...intentFilters.motifs,...selectedPatterns.map(p=>p.name)],chatHistory.filter(m=>m.role==='user').map(m=>m.content)),[confirmedTags,intentFilters.motifs,selectedPatterns,chatHistory]);
 const contextKey=JSON.stringify(context);const projectId=currentProject?.id ?? '';
 const [busy,setBusy]=useState('');const [error,setError]=useState('');const [selected,setSelected]=useState<string[]>([]);
 const lastAttempt=useRef<(()=>void)|null>(null);
 useEffect(()=>{setBusy('');setError('');setSelected([]);lastAttempt.current=null;return ()=>{studioRequestRef.current?.abort();};},[projectId,studioRequestRef]);
 const run=useCallback(async(label:string,action:(signal:AbortSignal)=>Promise<void>)=>{
   if(studioRequestRef.current && !studioRequestRef.current.signal.aborted)return;
   const controller=new AbortController();studioRequestRef.current=controller;setBusy(label);setError('');
   setStudio(s=>({...s,pendingOperation:label,operationNotice:''}));
   try{await action(controller.signal);if(!controller.signal.aborted)setStudio(s=>({...s,pendingOperation:''}));}catch(e){if(!controller.signal.aborted){const message=e instanceof Error?e.message:'操作失败，请重试';setError(message);setStudio(s=>({...s,pendingOperation:'',operationNotice:message}));}}
   finally{if(studioRequestRef.current===controller){studioRequestRef.current=null;setBusy('');}}
 },[studioRequestRef,setStudio]);
 const accept=useCallback((reply:StudioReply,signal:AbortSignal,source:'image'|'suggestion')=>{
   if(signal.aborted)return;
   const draft:StudioPalette|null=reply.palette?{...reply.palette,id:id(),source,createdAt:new Date().toISOString()}:null;
   setStudio(s=>normalizeStudio({...s,messages:[...s.messages,{id:id(),role:'assistant',text:reply.reply}],images:reply.images?.length?reply.images:s.images,draftPalette:draft ?? s.draftPalette}));
   if(reply.images?.length)setSelected([]);
 },[setStudio]);
 const send=useCallback((text:string,mode:StudioMode='chat',auto=false)=>{
   const message=text.trim();if(!message)return;
   const operation=()=>void run(mode==='search'?'正在检索参考图…':mode==='palette'?'正在构思配色…':'正在理解并处理你的需求…',async signal=>{
     setStudio(s=>({...s,messages:[...s.messages,{id:id(),role:'user',text:message}],...(auto?{autoSearchKey:contextKey}:{})}));
     // Direct requests must not be constrained by colors extracted from a previous board.
     const candidates:string[]=[];
     const current=studio.draftPalette ?? studio.palettes.find(p=>p.id===studio.activePaletteId);
     const enriched=current?[...context.slice(0,29),`当前参考色板（用户可要求改变）：${JSON.stringify(current.colors)}`]:context;
     accept(await studioChat(message,enriched,studio.messages,mode,candidates,signal),signal,'suggestion');
   });lastAttempt.current=operation;operation();
 },[run,setStudio,contextKey,studio.draftPalette,studio.palettes,studio.activePaletteId,studio.messages,accept,context]);
 useEffect(()=>{
   if(projectId && studioReadyProjectId===projectId && context.length && !studio.autoSearchKey && !studio.messages.length){
     send('请根据本项目已选文化主题和意象，检索一组清晰、适合观察配色的真实参考图片，组成灵感看板。先不提色。','search',true);
   }
 },[projectId,studioReadyProjectId,context.length,studio.autoSearchKey,studio.messages.length,send]);
 const extract=()=>{
   const images=studio.images.filter(i=>selected.includes(i.id)).slice(0,6);if(!images.length)return;
   const operation=()=>void run('正在逐图提色并组织配色方案…',async signal=>{
     const result=await extractStudioColors(images.map(i=>i.imageUrl),signal);if(signal.aborted)return;
     setStudio(s=>({...s,lastCandidates:result.colors}));
     if(result.failedImageUrls?.length){
       const failed=result.failedImageUrls;
       setSelected(s=>s.filter(id=>!images.some(image=>image.id===id&&failed.includes(image.imageUrl))));
       setStudio(s=>({...s,messages:[...s.messages,{id:id(),role:'assistant',text:`已跳过 ${failed.length} 张无法提色的图片，使用其余 ${result.successfulImages ?? images.length-failed.length} 张继续配色。`}]}));
     }
     setBusy('候选色已提取，正在组织配色方案…');
     accept(await studioChat('基于所选参考图的实际候选色生成一套整体配色。保留中性色，不机械选择第一个颜色；说明主辅色与建议比例，不指定车身区域。',context,studio.messages,'palette',result.colors,signal),signal,'image');
   });lastAttempt.current=operation;operation();
 };
 const upload=(file:File)=>{
   const operation=()=>void run('正在读取参考图并提取候选色…',async signal=>{
     const result=await uploadStudioImage(file,signal);if(signal.aborted)return;
     setStudio(s=>normalizeStudio({...s,images:[...s.images,result.image],lastCandidates:result.colors,messages:[...s.messages,{id:id(),role:'assistant',text:'图片已加入看板。可以选择图片提取配色，或告诉我希望保留哪些颜色。'}]}));setSelected([result.image.id]);
   });lastAttempt.current=operation;operation();
 };
 const cancel=()=>{studioRequestRef.current?.abort();studioRequestRef.current=null;setBusy('');setError('已停止本次操作。可以修改需求后重试。');setStudio(s=>({...s,pendingOperation:'',operationNotice:'已停止本次操作。可以修改需求后重试。'}));};
 const visibleError=error||(!busy&&(studio.pendingOperation?'上次操作已中断，请重新发送需求或重新选择图片提色。':studio.operationNotice))||'';
 return {studio,setStudio,context,contextKey,busy,error:visibleError,canRetry:!!lastAttempt.current,selected,setSelected,send,extract,upload,cancel,retry:()=>lastAttempt.current?.()};
}
