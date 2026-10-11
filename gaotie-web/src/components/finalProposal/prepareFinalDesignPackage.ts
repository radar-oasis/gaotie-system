import {exportFavorite} from '../assets/favoriteImage';
import {requiresRenderedReference} from '../assets/provenance';
import type {CanvasLayer} from '../superCanvas/types';
import type {FinalDesignPackage} from './finalProposalTypes';

/** Bake only selected transformed layers so the pixels, archive and lineage agree. */
export async function prepareFinalDesignPackage(pkg:FinalDesignPackage,layers:CanvasLayer[]):Promise<FinalDesignPackage> {
 const selectedIds=pkg.selectedReferenceAssetIds ?? (pkg.canvasAssets??[]).filter(a=>pkg.selectedReferenceImageUrls?.includes(a.imageUrl)).map(a=>a.id);
 const canvasAssets=await Promise.all((pkg.canvasAssets??[]).map(async asset=>{
  if(!selectedIds.includes(asset.id))return asset;
  const layer=layers.find(item=>item.id===asset.id);
  if(!layer || layer.type!=='image' || !requiresRenderedReference(layer))return asset;
  return {...asset,imageUrl:await exportFavorite(layer)};
 }));
 return {...pkg,canvasAssets,selectedReferenceAssetIds:selectedIds,
  selectedReferenceImageUrls:[...new Set(canvasAssets.filter(a=>selectedIds.includes(a.id)).map(a=>a.imageUrl))]};
}
