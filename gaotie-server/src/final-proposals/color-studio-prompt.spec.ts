import { PromptComposerService } from './prompt-composer.service';
import { buildDesignImagePackage } from './design-image-package';
describe('palette-only color direction',()=>{
  it('passes palette roles and user override into the actual Codex image package',()=>{
    const result=buildDesignImagePackage({designPackage:{demandTags:[],selectedPatterns:[],selectedCases:[],colorScheme:{id:'p',name:'青花',regions:[],palette:['#274485'],mode:'reference',colorRoles:[{hex:'#274485',role:'纹样',proportion:100}],rationale:'冷静蓝色'}},userPrompt:'改为红色'});
    expect(result.prompt).toContain('整体配色参考');expect(result.prompt).toContain('#274485');expect(result.prompt).toContain('本次明确的颜色要求优先');expect(result.prompt).not.toContain('区域配色：');
  });
  it('uses colors without regional constraints and prioritizes explicit user color request',()=>{
    const p=new PromptComposerService().composeGeneratePrompt({designPackage:{demandTags:[],selectedPatterns:[],selectedCases:[],colorScheme:{id:'p',name:'青花',regions:[],palette:['#274485','#f5f3ee'],mode:'reference',rationale:'蓝白',colorRoles:[{hex:'#274485',role:'主色',proportion:30},{hex:'#f5f3ee',role:'底色',proportion:70}]} as any},userPrompt:'改为红色系'});
    expect(p).toContain('#274485');
    expect(p).toContain('整体配色参考');
    expect(p).toContain('本次明确的颜色要求优先');
    expect(p).not.toContain('色彩必须按区域执行');
  });
});
