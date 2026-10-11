type Root = { id: string; name: string };
export function patternNameRoot(roots: Root[]) {
  const sorted = [...new Map(roots.filter(p => p.id && p.name.trim()).map(p => [p.id, p])).values()].sort((a,b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  return { key: JSON.stringify(sorted.map(p => p.id)), base: sorted.length ? `${sorted[0].name.trim()}${sorted.length > 1 ? `等${sorted.length}种纹样` : ''}` : '转化纹样' };
}
export function requestedPatternSequence(name: string, base: string) {
  const value = name.startsWith(`${base}-`) ? Number(name.slice(base.length + 1)) : 0;
  return Number.isSafeInteger(value) && value > 0 && value < 1000000000 ? value : 1;
}
// One statement: the counter row serializes allocations. Its source-key map makes
// concurrent duplicate requests idempotent even if their statement snapshots
// cannot yet see the other transaction's newly inserted asset.
export const STORE_NAMED_PATTERN_SQL = `
WITH existing AS (
  SELECT name FROM assets WHERE user_id = $2 AND kind = 'pattern' AND source_key = $11
), allocated AS (
  INSERT INTO asset_name_counters (user_id, root_key, last_value, allocations)
  SELECT $2, $12, $14::bigint, jsonb_build_object($11::text, $14::bigint)
  WHERE $6::text IS NOT NULL AND NOT EXISTS (SELECT 1 FROM existing)
  ON CONFLICT (user_id, root_key) DO UPDATE SET
    last_value = CASE WHEN asset_name_counters.allocations ? $11::text THEN asset_name_counters.last_value
      ELSE GREATEST(asset_name_counters.last_value + 1, $14::bigint) END,
    allocations = CASE WHEN asset_name_counters.allocations ? $11::text THEN asset_name_counters.allocations
      ELSE asset_name_counters.allocations || jsonb_build_object($11::text, GREATEST(asset_name_counters.last_value + 1, $14::bigint)) END
  RETURNING allocations ->> $11::text AS sequence
)
INSERT INTO assets (id, user_id, kind, project_id, project_name, name, theme, imagery, image_data, payload, source_key)
SELECT $1, $2, $3, $4, $5,
  COALESCE((SELECT name FROM existing), $13::text || '-' || (SELECT sequence FROM allocated)),
  $7, $8, $9, $10::jsonb, $11
ON CONFLICT (user_id, kind, source_key) DO UPDATE SET
  deleted_at = NULL, name = assets.name,
  payload = assets.payload || EXCLUDED.payload
RETURNING id, kind, name, project_id, project_name, theme, imagery, payload, created_at`;
