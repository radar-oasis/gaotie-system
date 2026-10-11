import { BadRequestException } from '@nestjs/common';
import sharp from 'sharp';

/** Coordinates in the displayed, orientation-corrected image, normalized to [0,1]. */
export interface EditRegion { x: number; y: number; width: number; height: number }
export function pixelEditRegion(region: EditRegion | undefined, width: number, height: number) {
  if (!region || ![region.x,region.y,region.width,region.height].every(Number.isFinite)
    || region.x < 0 || region.y < 0 || region.width <= 0 || region.height <= 0
    || region.x + region.width > 1.000000001 || region.y + region.height > 1.000000001) {
    throw new BadRequestException('请在当前效果图中选择有效的局部编辑区域');
  }
  const left=Math.floor(region.x*width), top=Math.floor(region.y*height);
  const right=Math.min(width,Math.ceil((region.x+region.width)*width));
  const bottom=Math.min(height,Math.ceil((region.y+region.height)*height));
  if(right<=left || bottom<=top) throw new BadRequestException('编辑区域至少需要一个像素');
  return {left,top,width:right-left,height:bottom-top};
}

export async function compositeLocalEdit(base: Buffer, generated: Buffer, region: EditRegion) {
  const decoded=await sharp(base).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const pixels=pixelEditRegion(region,decoded.info.width,decoded.info.height);
  const patch=await sharp(generated).resize(pixels.width,pixels.height,{fit:'fill'}).ensureAlpha().raw().toBuffer();
  // Copy raw rows, avoiding alpha premultiplication/rounding in a full-image composite.
  const output=Buffer.from(decoded.data);
  for(let row=0;row<pixels.height;row++) {
    patch.copy(output,((pixels.top+row)*decoded.info.width+pixels.left)*4,row*pixels.width*4,(row+1)*pixels.width*4);
  }
  const image=await sharp(output,{raw:{width:decoded.info.width,height:decoded.info.height,channels:4}}).png().toBuffer();
  return {image,pixels};
}
