// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import GenerationPreview from './GenerationPreview';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
it('shows the temporary train preview without enabling archive or creating a proposal', async () => {
  const host = document.createElement('div');
  const root = createRoot(host);
  await act(async () => root.render(<GenerationPreview currentProposal={null} isGenerating={false} errorMessage="" onArchive={() => { throw new Error('must not save'); }} onClearCurrentProposal={() => {}} />));
  expect(host.querySelector('img')?.getAttribute('src')).toBe('/demo-train-effect.png');
  expect(host.textContent).not.toContain('Effect Preview');
  expect(host.textContent).not.toContain('临时模拟效果');
  expect(host.textContent).not.toContain('等待生成最终效果');
  expect([...host.querySelectorAll('button')].find(b => b.textContent === '保存方案')?.disabled).toBe(true);
  await act(async () => root.unmount());
});
it('shows the actual numbered reference manifest returned by the generation service', async () => {
  const host=document.createElement('div'); const root=createRoot(host);
  await act(async()=>root.render(<GenerationPreview currentProposal={{id:'r',version:1,imageUrl:'/real.png',promptUsed:'p',designRationale:'r',createdAt:'now',referenceManifest:[{index:1,role:'canvas',label:'画布构图',instruction:'保留位置'},{index:2,role:'layout',label:'车窗带布局',instruction:'连续贯穿'}]}} isGenerating={false} errorMessage="" onArchive={()=>{}} onClearCurrentProposal={()=>{}} />));
  expect(host.textContent).toContain('本次已发送 2 张参考图');
  expect(host.textContent).toContain('参考图 2 · 车窗带布局');
  await act(async()=>root.unmount());
});
