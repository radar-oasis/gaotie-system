import type { FinalDesignPackage } from "./finalProposalTypes";

export const buildFinalInputFingerprint = (
  designPackage: FinalDesignPackage,
  selectedReferenceImageUrls: string[] = [],
): string => {
  return stableStringify({
    demandTags: designPackage.demandTags.map((tag) => ({
      label: tag.label,
      topic: tag.topic,
    })),
    selectedPatterns: designPackage.selectedPatterns.map((pattern) => ({
      id: pattern.id,
      imageUrl: pattern.imageUrl,
      description: pattern.description,
    })),
    selectedCases: designPackage.selectedCases.map((caseRef) => ({
      id: caseRef.id,
      image: caseRef.image,
      description: caseRef.description,
      userDescription: caseRef.userDescription,
    })),
    layoutComponentsMap: designPackage.layoutScheme?.componentsMap ?? {},
    layout3d: designPackage.layoutScheme?.layout3d,
    colorDirection: designPackage.colorScheme?.mode === 'reference' ? {
      palette: designPackage.colorScheme.palette,
      colorRoles: designPackage.colorScheme.colorRoles,
      rationale: designPackage.colorScheme.rationale,
    } : undefined,
    colorRegions:
      designPackage.colorScheme?.regions.map((region) => ({
        name: region.name,
        color: region.color,
        colorName: region.colorName,
        description: region.description,
        category: region.category,
        componentId: region.componentId,
        layoutElementImageUrl: region.layoutElementImageUrl,
      })) ?? [],
    canvasAssets:
      designPackage.canvasAssets?.filter(asset => designPackage.selectedReferenceAssetIds ? designPackage.selectedReferenceAssetIds.includes(asset.id) : selectedReferenceImageUrls.includes(asset.imageUrl)).map((asset) => ({
        id: asset.id,
        imageUrl: asset.imageUrl,
        source: asset.source,
      })) ?? [],
    selectedReferenceImageUrls: [...selectedReferenceImageUrls].sort(),
  });
};

function stableStringify(value: unknown): string {
  return JSON.stringify(sortRecursively(value));
}

function sortRecursively(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortRecursively);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entryValue]) => [key, sortRecursively(entryValue)]),
  );
}
