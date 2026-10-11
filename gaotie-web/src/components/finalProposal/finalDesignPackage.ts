import type { FinalDesignPackage, PackageCompleteness } from './finalProposalTypes';

const uniqueNonEmpty = (values: Array<string | undefined>): string[] => {
  const result: string[] = [];

  for (const value of values) {
    const normalized = value?.trim();

    if (!normalized || result.includes(normalized)) {
      continue;
    }

    result.push(normalized);
  }

  return result;
};

export const buildDefaultReferenceSelection = (
  designPackage: FinalDesignPackage,
): string[] =>
  uniqueNonEmpty(designPackage.selectedReferenceImageUrls ?? []);

export const summarizePackageCompleteness = (
  designPackage: FinalDesignPackage,
): PackageCompleteness => {
  const checks = [
    {
      label: '车身布局',
      ready: Boolean(designPackage.layoutScheme),
    },
    {
      label: '涂装案例',
      ready: designPackage.selectedCases.length > 0,
    },
    {
      label: '纹样素材',
      ready: designPackage.selectedPatterns.length > 0,
    },
    {
      label: '色彩方案',
      ready: Boolean(designPackage.colorScheme),
    },
    {
      label: '提示图',
      ready: (designPackage.selectedReferenceImageUrls?.length ?? 0) > 0,
    },
  ];

  return {
    readyCount: checks.filter((check) => check.ready).length,
    totalCount: checks.length,
    missingLabels: checks
      .filter((check) => !check.ready)
      .map((check) => check.label),
  };
};
