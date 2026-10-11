// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi, beforeEach, afterEach } from 'vitest';
import { CaseSearchContextProvider as CaseSearchProvider } from '../../context/CaseSearchContext';
import CaseSearchPage from './CaseSearchPage';
(globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
beforeEach(() => vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>({available:true,message:'案例库已就绪'})}))));
afterEach(() => vi.unstubAllGlobals());
it('provides an accessible composer and selected reference panel in the new workspace',async()=>{
 const host=document.createElement('div');const root=createRoot(host);
 await act(async()=>root.render(<CaseSearchProvider><CaseSearchPage onConfirm={()=>{}}/></CaseSearchProvider>));
 expect(host.querySelector('.case-workspace h1')?.textContent).toBe('案例检索');
 expect(host.querySelector('textarea[aria-label="案例需求"]')).not.toBeNull();
 expect(host.querySelector('.workspace-composer .workspace-send .t-icon-arrow-up')).not.toBeNull();
 expect(host.querySelector('aside[aria-label="已选案例"]')).not.toBeNull();
 expect(host.querySelector('.t-avatar')).toBeNull();
 expect(host.querySelector<HTMLButtonElement>('[aria-label="发送案例需求"]')?.disabled).toBe(true);
 await act(async()=>root.unmount());
});
it('searches, selects, annotates and confirms a case',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>({status:'success',reply:'找到一组案例',cases:[{id:'one',title:'蓝白流线',image:'/case.png'}]})})));
 const host=document.createElement('div');const root=createRoot(host);const confirm=vi.fn();
 try{
 await act(async()=>root.render(<CaseSearchProvider><CaseSearchPage onConfirm={confirm}/></CaseSearchProvider>));
 const input=host.querySelector('textarea[aria-label="案例需求"]') as HTMLTextAreaElement;
 expect(input).not.toBeNull();
 await act(async()=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(input,'蓝白色');input.dispatchEvent(new Event('input',{bubbles:true}));});
 await act(async()=>input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',isComposing:true,bubbles:true})));
 expect(vi.mocked(fetch).mock.calls.filter(([url])=>String(url).endsWith('/chat'))).toHaveLength(0);
 await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="发送案例需求"]')!.click());
 await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="选取 蓝白流线"]')!.click());
 const note=host.querySelector('textarea[aria-label="蓝白流线的参考说明"]') as HTMLTextAreaElement;
 await act(async()=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(note,'参考窗带');note.dispatchEvent(new Event('input',{bubbles:true}));});
 await act(async()=>host.querySelector<HTMLButtonElement>('.case-confirm')!.click());
 expect(confirm).toHaveBeenCalledWith([expect.objectContaining({id:'one',userDescription:'参考窗带'})]);
 await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="删除 蓝白流线"]')!.click());
 expect(host.querySelector('.case-selected-card')).toBeNull();
 }finally{await act(async()=>root.unmount());vi.unstubAllGlobals();}
});

it('allows the optional case step to be skipped explicitly', async () => {
 const host=document.createElement('div'); const root=createRoot(host); const onSkip=vi.fn();
 await act(async()=>root.render(<CaseSearchProvider><CaseSearchPage onConfirm={()=>{}} onSkip={onSkip}/></CaseSearchProvider>));
 const skip=Array.from(host.querySelectorAll('button')).find(b=>b.textContent?.includes('跳过案例'));
 expect(skip).toBeDefined(); await act(async()=>skip!.click()); expect(onSkip).toHaveBeenCalledOnce();
 await act(async()=>root.unmount());
});
