import {expect,it,vi} from 'vitest';
import {prepareFinalDesignPackage} from './prepareFinalDesignPackage';
import {exportFavorite} from '../assets/favoriteImage';
import type {ImageLayer} from '../superCanvas/types';
vi.mock('../assets/favoriteImage',()=>({exportFavorite:vi.fn(async()=> 'data:image/png;base64,baked')}));
it('bakes the selected transformed identity and retains unselected same-URL material',async()=>{
 const layer={id:'crop',type:'image',name:'crop',src:'/original.png',rotation:0,opacity:1,width:100,height:100,x:0,y:0,crop:{left:.2,right:0,top:0,bottom:0}} as ImageLayer;
 const pkg={demandTags:[],selectedPatterns:[],selectedCases:[],selectedReferenceAssetIds:['crop'],selectedReferenceImageUrls:['/original.png'],canvasAssets:[{id:'crop',name:'裁剪',source:'layer' as const,imageUrl:'/original.png'},{id:'uncropped',name:'原图',source:'layer' as const,imageUrl:'/original.png'}]};
 const result=await prepareFinalDesignPackage(pkg,[layer]);
 expect(exportFavorite).toHaveBeenCalledWith(layer);expect(result.selectedReferenceImageUrls).toEqual(['data:image/png;base64,baked']);
 expect(result.canvasAssets?.[1].imageUrl).toBe('/original.png');expect(pkg.canvasAssets[0].imageUrl).toBe('/original.png');
});
