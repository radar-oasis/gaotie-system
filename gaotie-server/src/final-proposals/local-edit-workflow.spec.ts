import sharp from 'sharp';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import {join,basename} from 'node:path';
import {FinalProposalsService} from './final-proposals.service';
import {FinalProposalsRepository} from './final-proposals.repository';
import {PromptComposerService} from './prompt-composer.service';
import {generateCodexImage} from '../codex-image/codex-image-client';
jest.mock('../codex-image/codex-image-client',()=>({generateCodexImage:jest.fn()}));
it('sends only the crop to the provider and preserves full-size protected pixels',async()=>{
 const prior=process.env.LOCAL_CODEX_IMAGE_ENABLED;process.env.LOCAL_CODEX_IMAGE_ENABLED='true';
 const dir=await mkdtemp(join(tmpdir(),'local-edit-'));
 try {
  const base=await sharp({create:{width:2400,height:120,channels:3,background:'#ffffff'}}).png().toBuffer();
  const patch=await sharp({create:{width:30,height:30,channels:3,background:'#008080'}}).png().toBuffer();
  jest.mocked(generateCodexImage).mockResolvedValue({taskId:'local-test',images:[{value:patch.toString('base64')}]} as any);
  const service=new FinalProposalsService(new PromptComposerService(),new FinalProposalsRepository());
  (service as any).outputDir=dir;
  const input={editMode:'local' as const,baseImageUrl:`data:image/png;base64,${base.toString('base64')}`,instruction:'门区域填白',designPackage:{demandTags:[{label:"敦煌"}],selectedPatterns:[],selectedCases:[]},editRegion:{x:.25,y:.25,width:.25,height:.5}};
  const result=await service.iterate(input);
  expect(result.editProtection?.outsideRegion).toBe('pixel-identical');
  const args=jest.mocked(generateCodexImage).mock.calls[0][0];
  expect(args.referenceImages).toHaveLength(1);
  expect(await sharp(args.referenceImages![0]).metadata()).toMatchObject({width:600,height:60});
  const image=await readFile(join(dir,basename(result.imageUrl)));
  expect(await sharp(image).metadata()).toMatchObject({width:2400,height:120});
  expect(await sharp(image).extract({left:0,top:0,width:600,height:120}).removeAlpha().raw().toBuffer()).toEqual(await sharp(base).extract({left:0,top:0,width:600,height:120}).removeAlpha().raw().toBuffer());
  jest.mocked(generateCodexImage).mockClear();
  await expect(service.iterate({...input,editRegion:{x:2,y:0,width:.1,height:.1}})).rejects.toThrow('编辑区域');
  expect(generateCodexImage).not.toHaveBeenCalled();
 }finally{if(prior===undefined)delete process.env.LOCAL_CODEX_IMAGE_ENABLED;else process.env.LOCAL_CODEX_IMAGE_ENABLED=prior;await rm(dir,{recursive:true,force:true});}
});
