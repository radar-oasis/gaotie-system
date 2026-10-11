import sharp from 'sharp';
import {AssetsService} from './assets.service';
it('archives a full-resolution RGBA result without altering protected pixels',async()=>{
 const raw=Buffer.from(Array.from({length:2400*10*4},(_,i)=>(i*19+17)%256));
 const png=await sharp(raw,{raw:{width:2400,height:10,channels:4}}).png().toBuffer();
 const service=new AssetsService({query:jest.fn()} as any);
 jest.spyOn(service as any,'project').mockResolvedValue({id:'p',name:'项目'});
 const store=jest.spyOn(service as any,'store').mockResolvedValue({id:'a',name:'a',payload:{},createdAt:'now'});
 await service.archive('u',{projectId:'p',name:'local',version:2,imageUrl:`data:image/png;base64,${png.toString('base64')}`,promptUsed:'local edit',designRationale:'preserved',packageSnapshot:{demandTags:[],selectedCases:[],selectedPatterns:[]}});
 const image=store.mock.calls[0][7] as Buffer;
 const decoded=await sharp(image).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 expect(decoded.info.width).toBe(2400);expect(decoded.data).toEqual(raw);
});
