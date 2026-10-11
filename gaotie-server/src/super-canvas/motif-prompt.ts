/** One budget shared by enhancement and both transparent-asset image adapters. */
export const TRANSPARENT_ASSET_MAX_PROMPT_LENGTH = 800;
export const TRANSPARENT_ASSET_PROMPT_CONSTRAINT =
  'Create a single clean motif as a standalone flat motif asset for downstream compositing, not a train or scene. Preserve the user-requested subject, colors, style and linework. Keep the motif isolated for background removal.';
export const TRANSPARENT_ASSET_PROMPT_BODY_LIMIT =
  TRANSPARENT_ASSET_MAX_PROMPT_LENGTH -
  TRANSPARENT_ASSET_PROMPT_CONSTRAINT.length -
  2;

export function buildTransparentAssetPrompt(prompt: string): string {
  const normalized = prompt.trim();
  if (normalized.length > TRANSPARENT_ASSET_PROMPT_BODY_LIMIT) {
    throw new Error(
      `prompt exceeds transparent motif limit of ${TRANSPARENT_ASSET_PROMPT_BODY_LIMIT} characters`,
    );
  }
  return `${normalized}\n\n${TRANSPARENT_ASSET_PROMPT_CONSTRAINT}`;
}
