import { describe, expect, it } from 'vitest';
import { emptyStudio, normalizeStudio, paletteToScheme, buildStudioContext } from './colorStudio';
import { normalizeWorkspaceSnapshot } from '../../projects/workspaceSnapshot';

describe('color studio independent state', () => {
  it('preserves interruption and error information across project snapshots',()=>{
    const state={...emptyStudio(),pendingOperation:'正在检索参考图…',operationNotice:'网络异常'};
    expect(normalizeWorkspaceSnapshot({colorConfig:{studio:state}}).colorConfig.studio).toEqual(state);
    expect(normalizeStudio({pendingOperation:42,operationNotice:{}}).pendingOperation).toBe('');
  });
  it('restores old projects with an empty optional studio', () => {
    expect(normalizeWorkspaceSnapshot({colorConfig:{}}).colorConfig.studio).toEqual(emptyStudio());
  });
  it('preserves boards and palettes without a layout', () => {
    const state = emptyStudio();
    state.palettes = [{id:'p', name:'红色系',colors:[{hex:'#cc2233',role:'主色',proportion:100}],rationale:'建议',source:'suggestion',createdAt:'now'}];
    state.activePaletteId = 'p';
    const restored = normalizeWorkspaceSnapshot({colorConfig:{studio:state}});
    expect(restored.colorConfig.studio).toEqual(state);
    expect(paletteToScheme(state.palettes[0]).regions).toEqual([]);
    expect(paletteToScheme(state.palettes[0]).palette).toEqual(['#cc2233']);
    expect(paletteToScheme(state.palettes[0]).mode).toBe('reference');
  });
  it('rejects invalid nested saved data instead of breaking rendering', () => {
    const state=normalizeStudio({messages:[null],images:[{imageUrl:'javascript:alert(1)'}],palettes:[{id:'bad',colors:[{hex:'red'}]}],activePaletteId:'bad'});
    expect(state.images).toEqual([]);
    expect(state.messages).toEqual([]);
    expect(state.palettes).toEqual([]);
    expect(state.activePaletteId).toBeNull();
  });
  it('collects culture tags, selected imagery, and user demand text', () => {
    expect(buildStudioContext([{label:'春节',topic:'文化'}],['龙'],['希望是红色系'])).toEqual(['文化：春节','意象：龙','用户需求：希望是红色系']);
  });
});
