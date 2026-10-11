import sharp from 'sharp';
import { compositeLocalEdit, pixelEditRegion } from './local-edit';
describe('protected local edits', () => {
  it.each([{x:-.1,y:0,width:.3,height:.3},{x:.9,y:0,width:.2,height:.3},{x:0,y:0,width:0,height:.3},{x:NaN,y:0,width:.3,height:.3}])('rejects invalid regions before generation %j', region => {
    expect(()=>pixelEditRegion(region,100,80)).toThrow();
  });
  it.each([17,83,211])('preserves every pixel outside the selected region for generated sample %s', async value => {
    const base=await sharp({create:{width:100,height:80,channels:3,background:{r:15,g:100,b:201}}}).png().toBuffer();
    const patch=await sharp({create:{width:40,height:30,channels:3,background:{r:value,g:20,b:40}}}).png().toBuffer();
    const region={x:.2,y:.25,width:.3,height:.5};
    const output=await compositeLocalEdit(base,patch,region);
    const {data,info}=await sharp(output.image).removeAlpha().raw().toBuffer({resolveWithObject:true});
    expect(info).toMatchObject({width:100,height:80});
    for(let y=0;y<80;y++)for(let x=0;x<100;x++) {
      const inside=x>=20 && x<50 && y>=20 && y<60;
      expect(Array.from(data.subarray((y*100+x)*3,(y*100+x)*3+3))).toEqual(inside?[value,20,40]:[15,100,201]);
    }
    expect(output.pixels).toEqual({left:20,top:20,width:30,height:40});
  });
});

it('preserves patterned semitransparent and transparent RGBA pixels exactly outside the region',async()=>{
 const raw=Buffer.from(Array.from({length:100*80*4},(_,i)=>(i*19+17)%256));
 const base=await sharp(raw,{raw:{width:100,height:80,channels:4}}).png().toBuffer();
 const patch=await sharp({create:{width:20,height:20,channels:4,background:{r:200,g:31,b:82,alpha:.45}}}).png().toBuffer();
 const result=await compositeLocalEdit(base,patch,{x:.2,y:.25,width:.3,height:.5});
 const after=await sharp(result.image).ensureAlpha().raw().toBuffer();
 for(let y=0;y<80;y++)for(let x=0;x<100;x++)if(!(x>=20&&x<50&&y>=20&&y<60)) {
  const offset=(y*100+x)*4;expect(after.subarray(offset,offset+4)).toEqual(raw.subarray(offset,offset+4));
 }
});
