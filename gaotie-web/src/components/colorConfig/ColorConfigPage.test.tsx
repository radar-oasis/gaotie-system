// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { ColorConfigProvider } from '../../context/ColorConfigContext';
import ColorConfigPage from './ColorConfigPage';
vi.mock('../../projects/ProjectContext',()=>({useProject:()=>({currentProject:{id:'p'}})}));
vi.mock('../../context/SharedTagsContext',()=>({useSharedTags:()=>({confirmedTags:[]})}));
vi.mock('../../context/ImageSearchContext',()=>({useImageSearch:()=>({intentFilters:{motifs:[]},selectedPatterns:[]})}));
vi.mock('../../context/ChatContext',()=>({useChat:()=>({chatHistory:[]})}));
(globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
afterEach(()=>vi.unstubAllGlobals());
it('shows interruption after leaving and returning to a pending request',async()=>{
 let signal:AbortSignal|undefined;
 vi.stubGlobal('fetch',vi.fn((_url,options)=>{signal=options.signal;return new Promise((_resolve,reject)=>signal!.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError'))));}));
 const host=document.createElement('div');const root=createRoot(host);
 const render=(show:boolean)=><ColorConfigProvider>{show?<ColorConfigPage/>:null}</ColorConfigProvider>;
 await act(async()=>root.render(render(true)));
 await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="寻找参考图片"]')!.click());
 await act(async()=>root.render(render(false)));
 expect(signal?.aborted).toBe(true);
 await act(async()=>root.render(render(true)));
 expect(host.textContent).toContain('已中断');
 expect(host.querySelector('[role="alert"]')?.textContent).toContain('重新');
 await act(async()=>root.unmount());
});
it('explains the default chat action next to explicit search and palette actions',async()=>{
 const host=document.createElement('div');const root=createRoot(host);
 await act(async()=>root.render(<ColorConfigProvider><ColorConfigPage/></ColorConfigProvider>));
 expect(host.textContent).toContain('发送为对话');
 await act(async()=>root.unmount());
});
it('continues palette generation after partial extraction and saves the result',async()=>{
 const image=(id:string)=>({id,title:id,imageUrl:`https://example.com/${id}.png`,sourceUrl:''});
 const fetcher=vi.fn().mockResolvedValueOnce({ok:true,json:async()=>({reply:'参考图',images:[image('good'),image('bad')]})})
 .mockResolvedValueOnce({ok:true,json:async()=>({colors:['#cc2233'],successfulImages:1,failedImageUrls:['https://example.com/bad.png']})})
 .mockResolvedValueOnce({ok:true,json:async()=>({reply:'已生成',images:[],palette:{name:'验收色板',colors:[{hex:'#cc2233',role:'主色',proportion:100}],rationale:'提取'}})});
 vi.stubGlobal('fetch',fetcher);
 const host=document.createElement('div');const root=createRoot(host);
 await act(async()=>root.render(<ColorConfigProvider><ColorConfigPage/></ColorConfigProvider>));
 await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="寻找参考图片"]')!.click());
 for(const checkbox of host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'))await act(async()=>checkbox.click());
 await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='提取配色')!.click());
 expect(host.textContent).toContain('已跳过 1 张');
 expect(host.querySelector<HTMLInputElement>('[aria-label="选择 bad"]')!.checked).toBe(false);
 expect(JSON.parse(fetcher.mock.calls[2][1].body).candidateColors).toEqual(['#cc2233']);
 await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='保存色板')!.click());
 expect(host.querySelectorAll('[data-palette-saved]')).toHaveLength(1);
 expect(host.textContent).not.toContain('已中断');
 await act(async()=>root.unmount());
});
it('scrolls only the message container, never the outer workbench',async()=>{
 const outerScroll=vi.fn();
 const original=HTMLElement.prototype.scrollIntoView;
 HTMLElement.prototype.scrollIntoView=outerScroll;
 const host=document.createElement('div');const root=createRoot(host);
 try {
  await act(async()=>root.render(<ColorConfigProvider><ColorConfigPage/></ColorConfigProvider>));
  expect(outerScroll).not.toHaveBeenCalled();
  expect(host.querySelector('[aria-label="对话记录"]')?.getAttribute('tabindex')).toBe('0');
 } finally {await act(async()=>root.unmount());HTMLElement.prototype.scrollIntoView=original;}
});
it('shows image failure with a retry instead of an empty picture',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>({reply:'找到参考图片',images:[{id:'img',title:'红墙',imageUrl:'https://example.com/red.jpg',sourceUrl:'https://example.com/source'}]})})));
 const host=document.createElement('div');const root=createRoot(host);
 await act(async()=>root.render(<ColorConfigProvider><ColorConfigPage/></ColorConfigProvider>));
 await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="寻找参考图片"]')!.click());
 await act(async()=>host.querySelector('img')!.dispatchEvent(new Event('error')));
 expect(host.textContent).toContain('图片加载失败');
 const retry=[...host.querySelectorAll('button')].find(b=>b.textContent==='重新加载图片');
 expect(retry).toBeDefined();
 await act(async()=>retry!.click());
 expect(host.querySelector('img')).not.toBeNull();
 await act(async()=>root.unmount());
});
it('opens an airy conversation workspace without forcing a next step or avatars',async()=>{
 const host=document.createElement('div');const root=createRoot(host);
 await act(async()=>root.render(<ColorConfigProvider><ColorConfigPage/></ColorConfigProvider>));
 expect(host.querySelector('h1')?.textContent).toBe('色彩配置');
 expect(host.querySelector('.color-studio--two-column')).not.toBeNull();
 expect(host.querySelector('.workspace-composer .workspace-send .t-icon-arrow-up')).not.toBeNull();
 expect(host.textContent).not.toContain('选择布局方案');
 expect(host.textContent).not.toContain('进入效果生成');
 expect(host.querySelector('.studio-context')?.tagName).toBe('DETAILS');
 expect(host.querySelector('.studio-dialogue h2')?.textContent).toBe('色彩对话');
 expect(host.querySelector('.studio-palette')).not.toBeNull();
 expect(host.querySelector('.studio-dialogue .avatar')).toBeNull();
 await act(async()=>root.unmount());
});
it('generates and saves a named palette without image or layout',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>({reply:'红色系建议',images:[],palette:{name:'朱红',colors:[{hex:'#cc2233',role:'主色',proportion:100}],rationale:'建议'}})})));
 const host=document.createElement('div');const root=createRoot(host);
 await act(async()=>root.render(<ColorConfigProvider><ColorConfigPage/></ColorConfigProvider>));
 const button=host.querySelector<HTMLButtonElement>('[aria-label="直接给我配色"]');
 expect(button).toBeDefined();await act(async()=>button!.click());
 expect(host.querySelector<HTMLInputElement>('[aria-label="色板名称"]')?.value).toBe('朱红');
 expect(host.querySelector('.studio-palette-header .studio-save-palette')?.textContent).toBe('保存色板');
 expect(host.querySelector('.studio-rationale')?.hasAttribute('open')).toBe(false);
 expect(host.querySelector('.studio-color-legend')?.textContent).toContain('#cc2233');
 expect(host.querySelector('.studio-message.assistant')?.getAttribute('aria-label')).toBe('色彩助手回复');
 expect(host.querySelector('.studio-message.assistant img, .studio-message.assistant svg')).toBeNull();
 const save=[...host.querySelectorAll('button')].find(b=>b.textContent==='保存色板');
 expect(save).toBeDefined();await act(async()=>save!.click());
 expect(host.textContent).toContain('已保存色板');
 expect(host.querySelectorAll('[data-palette-saved]').length).toBe(1);
 expect(host.querySelector('.studio-saved-select')?.getAttribute('aria-pressed')).toBe('true');
 await act(async()=>root.unmount());
});
