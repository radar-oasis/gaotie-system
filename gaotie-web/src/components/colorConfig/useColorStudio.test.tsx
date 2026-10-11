// @vitest-environment happy-dom
import { act, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { ColorConfigProvider, useColorConfig } from '../../context/ColorConfigContext';
import { useColorStudio } from './useColorStudio';
const state=vi.hoisted(()=>({projectId:'p1',tags:[] as {label:string}[]}));
vi.mock('../../projects/ProjectContext',()=>({useProject:()=>({currentProject:{id:state.projectId}})}));
vi.mock('../../context/SharedTagsContext',()=>({useSharedTags:()=>({confirmedTags:state.tags})}));
vi.mock('../../context/ImageSearchContext',()=>({useImageSearch:()=>({intentFilters:{motifs:[]},selectedPatterns:[]})}));
vi.mock('../../context/ChatContext',()=>({useChat:()=>({chatHistory:[]})}));
(globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
let controls:ReturnType<typeof useColorStudio>;
function Harness(){const c=useColorConfig();controls=useColorStudio();useEffect(()=>{c.setStudioReadyProjectId(state.projectId);},[c.setStudioReadyProjectId]);return <span>{controls.studio.messages.map(m=>m.text).join('|')}</span>;}
afterEach(()=>{vi.unstubAllGlobals();state.projectId='p1';state.tags=[];});
it('searches inherited culture once and does not repeat on rerender',async()=>{
 state.tags=[{label:'春节'}];const fetcher=vi.fn(async()=>({ok:true,json:async()=>({reply:'找到参考',images:[]})}));vi.stubGlobal('fetch',fetcher);
 const host=document.createElement('div');const root=createRoot(host);
 await act(async()=>root.render(<ColorConfigProvider><Harness/></ColorConfigProvider>));
 expect(fetcher).toHaveBeenCalledTimes(1);expect(controls.studio.autoSearchKey).toContain('春节');
 await act(async()=>root.render(<ColorConfigProvider><Harness/></ColorConfigProvider>));expect(fetcher).toHaveBeenCalledTimes(1);
 await act(async()=>root.unmount());
});
it('discards a late response after switching projects',async()=>{
 let finish!:(x:unknown)=>void;let signal:AbortSignal|undefined;
 vi.stubGlobal('fetch',vi.fn((_url,init)=>{signal=init.signal;return new Promise(resolve=>{finish=resolve;});}));
 const host=document.createElement('div');const root=createRoot(host);
 await act(async()=>root.render(<ColorConfigProvider><Harness/></ColorConfigProvider>));
 await act(async()=>controls.send('红色系','palette'));
 state.projectId='p2';await act(async()=>root.render(<ColorConfigProvider><Harness/></ColorConfigProvider>));
 expect(signal?.aborted).toBe(true);
 await act(async()=>finish({ok:true,json:async()=>({reply:'来自旧项目的回答',images:[]})}));
 expect(host.textContent).not.toContain('来自旧项目的回答');
 await act(async()=>root.unmount());
});
