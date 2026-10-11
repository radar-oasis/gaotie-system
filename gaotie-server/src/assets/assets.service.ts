import { patternNameRoot, requestedPatternSequence, STORE_NAMED_PATTERN_SQL } from './pattern-naming';
import { normalizeProvenance, type PatternProvenance } from './asset-provenance';
import { AssetGraphService } from './asset-graph.service';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { DatabaseService } from '../database/database.service';
import { loadReferenceImage } from '../image-reference/load-reference-image';
import type { ArchiveFinalProposalInput } from '../final-proposals/final-proposals.types';

type AssetRow = {
  id: string;
  kind: 'pattern' | 'proposal';
  name: string;
  project_id: string | null;
  project_name: string;
  theme: string;
  imagery: string;
  payload: Record<string, any>;
  created_at: Date | string;
  image_data?: Buffer;
};
export interface FavoriteInput {
  projectId: string;
  name: string;
  imageDataUrl: string;
  prompt?: string;
  sourceImageUrl?: string;
  provenance?: PatternProvenance;
}
export type ProposalAssetInput = ArchiveFinalProposalInput & {
  projectId: string;
  projectName?: string;
  theme?: string;
  imagery?: string;
  sourceProposalId?: string;
  parentProposalId?: string;
  familyId?: string;
  review?: {status: 'pending' | 'accepted'; checks?: unknown; acceptedAt?: string};
  editProtection?: unknown;
  inputFingerprint?: string;
  inputFingerprintVersion?: 2;
  userInstruction?: string;
};
const fields =
  'id, kind, name, project_id, project_name, theme, imagery, payload, created_at';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const text = (value: unknown, limit: number, required = false): string => {
  if (value !== undefined && typeof value !== 'string')
    throw new BadRequestException('文字字段格式无效');
  const result = (value as string | undefined)?.trim() ?? '';
  if (result.length > limit || (required && !result))
    throw new BadRequestException('名称或说明为空或过长');
  return result;
};
@Injectable()
export class AssetsService {
  constructor(private readonly db: DatabaseService, @Optional() private readonly graph?: AssetGraphService) {}

  private async project(userId: string, id: string) {
    if (!uuid.test(id ?? '')) throw new BadRequestException('请先选择项目');
    const result = await this.db.query<{ id: string; name: string }>(
      'SELECT id, name FROM projects WHERE user_id = $1 AND id = $2',
      [userId, id],
    );
    if (!result.rows[0]) throw new NotFoundException('项目不存在');
    return result.rows[0];
  }

  private async png(buffer: Buffer): Promise<Buffer> {
    if (buffer.length > 20 * 1024 * 1024)
      throw new BadRequestException('图片不能超过 20 MB');
    try {
      const image = sharp(buffer, { limitInputPixels: 40_000_000 });
      const meta = await image.metadata();
      if (!['png', 'jpeg', 'webp'].includes(meta.format ?? ''))
        throw new Error();
      const result = await image.png().toBuffer();
      if (result.length > 25 * 1024 * 1024) throw new Error();
      return result;
    } catch {
      throw new BadRequestException('图片无效，请使用 PNG、JPEG 或 WebP');
    }
  }

  async readImage(userId: string, imageUrl: string, preserveResolution = false): Promise<Buffer> {
    const referenceId = referenceImageId(imageUrl);
    if (referenceId) return this.referenceImage(userId, referenceId);
    const id = assetImageId(imageUrl);
    return id ? this.image(userId, id) : loadReferenceImage(imageUrl, {preserveResolution});
  }

  async favorite(userId: string, input: FavoriteInput) {
    const project = await this.project(userId, input?.projectId);
    const name = text(input.name, 1000, true);
    const match =
      /^data:image\/(?:png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(
        input.imageDataUrl ?? '',
      );
    if (!match || match[1].length > 28 * 1024 * 1024)
      throw new BadRequestException('收藏图片格式无效或过大');
    const image = await this.png(Buffer.from(match[1], 'base64'));
    return this.store(
      userId,
      'pattern',
      project.id,
      project.name,
      name,
      '',
      '',
      image,
      {
        prompt: text(input.prompt, 48000),
        sourceImageUrl: text(input.sourceImageUrl, 2048),
        provenance: await this.persistProvenance(userId, input.provenance),
      },
    );
  }

  async archive(userId: string, input: ProposalAssetInput) {
    const project = await this.project(userId, input?.projectId);
    const pkg = input.packageSnapshot ? structuredClone(input.packageSnapshot) : undefined;
    if (
      !pkg ||
      !Array.isArray(pkg.demandTags) ||
      !Array.isArray(pkg.selectedPatterns) ||
      !Array.isArray(pkg.selectedCases)
    ) {
      throw new BadRequestException('缺少生成时的设计记录，请重新生成后保存');
    }
    if (input.review && input.review.status !== 'accepted') throw new BadRequestException('请先完成效果审核');
    const selected = pkg.selectedReferenceImageUrls;
    if (
      selected !== undefined &&
      (!Array.isArray(selected) ||
        selected.length > 12 ||
        selected.some((url) => typeof url !== 'string'))
    ) {
      throw new BadRequestException('纹样参考图记录无效');
    }
    if (!Number.isInteger(input.version) || input.version < 1)
      throw new BadRequestException('方案版本无效');
    const name = text(input.name, 160, true);
    const promptUsed = text(input.promptUsed, 100000, true);
    if (JSON.stringify(pkg).length > 24 * 1024 * 1024)
      throw new BadRequestException('设计记录过大');
    const sourceProposalId = text(input.sourceProposalId, 160);
    const parentProposalId = text(input.parentProposalId, 160);
    const familyId = text(input.familyId, 160) || (!parentProposalId && input.version === 1 ? sourceProposalId : '');
    let existingArchiveId = '';
    if (parentProposalId && parentProposalId === sourceProposalId) throw new BadRequestException('方案不能派生自自身');
    const identities = [...new Set([sourceProposalId, parentProposalId, familyId].filter(Boolean))];
    if (identities.length) {
      const linked = await this.db.query<{id:string; user_id:string; project_id:string; payload:Record<string,any>}>(
        "SELECT id, user_id, project_id, payload FROM assets WHERE kind = 'proposal' AND (payload->>'sourceProposalId' = ANY($1::text[]) OR payload->>'parentProposalId' = ANY($1::text[]) OR payload->>'familyId' = ANY($1::text[]) OR id::text = ANY($1::text[]))", [identities]);
      if (linked.rows.some(r => r.user_id !== userId || r.project_id !== project.id)) throw new BadRequestException('方案来源不属于当前项目');
      existingArchiveId = linked.rows.find(r => r.id === sourceProposalId && !r.payload?.sourceProposalId)?.id ?? '';
    }
    if (!existingArchiveId && sourceProposalId) {
      // Before stable IDs were persisted, this exact digest was the archive identity.
      // Verify against each candidate's stored pixels, never a matching name/version.
      const legacy = await this.db.query<{id:string}>(
        `SELECT id FROM assets WHERE user_id = $1 AND project_id = $2::uuid AND kind = 'proposal'
         AND COALESCE(payload->>'sourceProposalId', '') = ''
         AND source_key = encode(sha256(convert_to($2::text || $3::text, 'UTF8') || image_data), 'hex')`,
        [userId, project.id, sourceProposalId],
      );
      existingArchiveId = legacy.rows[0]?.id ?? '';
    }
    let image: Buffer;
    try {
      image = await this.png(
        await this.readImage(
          userId,
          text(input.imageUrl, 28 * 1024 * 1024, true),
          true,
        ),
      );
    } catch {
      throw new BadRequestException('效果图片无法保存，请确认原图仍可访问');
    }
    // Copy only references actually used, keeping their original URL as lineage metadata.
    const selectedIdsValue = (pkg as any).selectedReferenceAssetIds;
    if (selectedIdsValue !== undefined && (!Array.isArray(selectedIdsValue) || selectedIdsValue.length > 12 || selectedIdsValue.some(id => typeof id !== 'string' || !(pkg.canvasAssets ?? []).some(a => a.id === id)))) throw new BadRequestException('纹样参考素材记录无效');
    const selectedIds = selectedIdsValue === undefined ? undefined : new Set(selectedIdsValue);
    const selectedUrls = new Set(pkg.selectedReferenceImageUrls ?? []);
    const replacements = new Map<string, string>();
    for (const url of selectedUrls) replacements.set(url, await this.persistReference(userId, url));
    pkg.selectedReferenceImageUrls = [...selectedUrls].map(url => replacements.get(url)!);
    pkg.canvasAssets = await Promise.all((pkg.canvasAssets ?? []).filter(a => selectedUrls.has(a.imageUrl) && (!selectedIds || selectedIds.has(a.id))).map(async a => ({
      ...a, imageUrl: replacements.get(a.imageUrl)!,
      sourceAssetId: assetImageId(a.imageUrl) ?? a.sourceAssetId,
      provenance: await this.persistProvenance(userId, a.provenance),
    })));
    const detail = await this.store(
      userId,
      'proposal',
      project.id,
      text(input.projectName, 160) || project.name,
      name,
      text(input.theme, 1000),
      text(input.imagery, 4000),
      image,
      {
        review: input.review ? {status: input.review.status, checks: input.review.checks, acceptedAt: input.review.acceptedAt} : undefined,
        editProtection: input.editProtection,
        sourceProposalId: sourceProposalId || undefined,
        parentProposalId: parentProposalId || undefined,
        familyId: familyId || undefined,
        version: input.version,
        imageUrl: input.imageUrl,
        promptUsed,
        designRationale: text(input.designRationale, 16000),
        packageSnapshot: pkg,
        userInstruction: text(input.userInstruction, 48000),
        inputFingerprint: text(input.inputFingerprint, 24 * 1024 * 1024),
        inputFingerprintVersion: input.inputFingerprintVersion === 2 ? 2 : undefined,
      },
      text(input.sourceProposalId, 160),
      existingArchiveId,
    );
    return this.proposal(detail);
  }

  private async store(
    userId: string,
    kind: string,
    projectId: string,
    projectName: string,
    name: string,
    theme: string,
    imagery: string,
    image: Buffer,
    payload: Record<string, unknown>,
    sourceId = '',
    existingId = '',
  ) {
    const key = createHash('sha256')
      .update(projectId)
      .update(sourceId)
      .update(kind === 'proposal' && sourceId ? Buffer.alloc(0) : image)
      .digest('hex');
    const root = patternNameRoot((payload.provenance as PatternProvenance | undefined)?.sourcePatterns ?? []);
    const result = await this.db.query<AssetRow>(
      existingId ? `UPDATE assets SET project_name=$5, name=$6, theme=$7, imagery=$8, image_data=$9, payload=$10::jsonb, source_key=$11, deleted_at=NULL
        WHERE id=$1 AND user_id=$2 AND kind=$3 AND project_id=$4 RETURNING ${fields}` : kind === 'pattern' ? STORE_NAMED_PATTERN_SQL : `
      INSERT INTO assets (id, user_id, kind, project_id, project_name, name, theme, imagery, image_data, payload, source_key)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11)
      ON CONFLICT (user_id, kind, source_key) DO UPDATE SET
        deleted_at = NULL, name = EXCLUDED.name, theme = EXCLUDED.theme, imagery = EXCLUDED.imagery, image_data = EXCLUDED.image_data, payload = EXCLUDED.payload
      RETURNING ${fields}`,
      [
        existingId || randomUUID(),
        userId,
        kind,
        projectId,
        projectName,
        name,
        theme,
        imagery,
        image,
        JSON.stringify(payload),
        key,
        ...(kind === 'pattern' ? [root.key, root.base, requestedPatternSequence(name, root.base)] : []),
      ],
    );
    this.graph?.markDirty(userId);
    return this.dto(result.rows[0], true);
  }

  async referenceImage(userId: string, id: string): Promise<Buffer> {
    if (!uuid.test(id)) throw new NotFoundException('参考图不存在');
    const result = await this.db.query<{ image_data: Buffer }>(
      'SELECT image_data FROM asset_reference_images WHERE user_id = $1 AND id = $2', [userId, id],
    );
    if (!result.rows[0]) throw new NotFoundException('参考图不存在');
    return result.rows[0].image_data;
  }

  private async persistReference(userId: string, url: string): Promise<string> {
    const existing = referenceImageId(url);
    if (existing) { await this.referenceImage(userId, existing); return `/assets/references/${existing}/image`; }
    let image: Buffer;
    try { image = await this.png(await this.readImage(userId, url)); }
    catch { throw new BadRequestException('来源参考图无法保存，请确认图片仍可访问'); }
    const hash = createHash('sha256').update(image).digest('hex');
    const result = await this.db.query<{ id: string }>(
      `INSERT INTO asset_reference_images (id, user_id, content_hash, image_data) VALUES ($1,$2,$3,$4)
       ON CONFLICT (user_id, content_hash) DO UPDATE SET content_hash = EXCLUDED.content_hash RETURNING id`,
      [randomUUID(), userId, hash, image],
    );
    return `/assets/references/${result.rows[0].id}/image`;
  }

  private async persistProvenance(userId: string, value: unknown) {
    const provenance = normalizeProvenance(value);
    if (!provenance) return undefined;
    for (const ref of provenance.references) {
      const original = ref.originalImageUrl || ref.imageUrl;
      const sourceAssetId = assetImageId(ref.imageUrl);
      ref.imageUrl = await this.persistReference(userId, ref.imageUrl);
      if (sourceAssetId) ref.sourceAssetId = sourceAssetId;
      // Data URLs carry no extra identity; omit their duplicate bytes.
      ref.originalImageUrl = original.startsWith('data:') ? undefined : original;
    }
    if (provenance.outputImageUrl?.startsWith('data:')) provenance.outputImageUrl = undefined;
    return provenance;
  }

  async list(userId: string) {
    const result = await this.db.query<AssetRow>(
      `SELECT ${fields.replace('payload, ', '')} FROM assets WHERE user_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC, id`,
      [userId],
    );
    return result.rows.map((row) => this.dto(row));
  }
  async get(userId: string, id: string) {
    const row = await this.row(userId, id);
    const detail = this.dto(row, true);
    if (row.kind !== 'proposal') return detail;
    const payload = row.payload ?? {};
    const related = await this.db.query<AssetRow>(
      `SELECT ${fields} FROM assets WHERE user_id = $1 AND project_id = $2 AND kind = 'proposal' AND deleted_at IS NULL
       AND (payload->>'sourceProposalId' = $3 OR id::text = $3 OR payload->>'parentProposalId' = $4 OR payload->>'parentProposalId' = $5)`,
      [userId, row.project_id, payload.parentProposalId || '', payload.sourceProposalId || id, id],
    );
    const parent = payload.parentProposalId ? related.rows.find(r => (r.payload?.sourceProposalId === payload.parentProposalId || r.id === payload.parentProposalId) && r.id !== id) : undefined;
    const children = related.rows.filter(r => [payload.sourceProposalId || id, id].includes(r.payload?.parentProposalId) && r.id !== id);
    return { ...detail, lineage: { parent: parent ? { id: parent.id, name: parent.name } : undefined, children: children.map(r => ({ id: r.id, name: r.name })), parentStatus: parent ? 'available' : payload.parentProposalId ? 'not-saved' : 'unknown' } };
  }
  async image(userId: string, id: string): Promise<Buffer> {
    return (await this.row(userId, id, true)).image_data!;
  }
  private async row(userId: string, id: string, image = false) {
    if (!uuid.test(id)) throw new NotFoundException('资产不存在');
    const result = await this.db.query<AssetRow>(
      `SELECT ${fields}${image ? ', image_data' : ''} FROM assets WHERE user_id = $1 AND id = $2 AND deleted_at IS NULL`,
      [userId, id],
    );
    if (!result.rows[0]) throw new NotFoundException('资产不存在');
    return result.rows[0];
  }
  async remove(userId: string, id: string) {
    if (!uuid.test(id)) throw new NotFoundException('资产不存在');
    const result = await this.db.query(
      'UPDATE assets SET deleted_at = now() WHERE user_id = $1 AND id = $2 AND deleted_at IS NULL RETURNING id',
      [userId, id],
    );
    if (!result.rows[0]) throw new NotFoundException('资产不存在');
    this.graph?.markDirty(userId);
    return { ok: true };
  }
  async listProposals(userId: string, projectId?: string) {
    if (projectId !== undefined) await this.project(userId, projectId);
    const result = await this.db.query<AssetRow>(
      `SELECT ${fields} FROM assets WHERE user_id = $1 AND kind = 'proposal' AND deleted_at IS NULL${projectId !== undefined ? ' AND project_id = $2' : ''} ORDER BY created_at DESC`,
      projectId !== undefined ? [userId, projectId] : [userId],
    );
    return result.rows.map((row) => this.proposal(this.dto(row, true)));
  }
  async getProposal(userId: string, id: string) {
    const detail = await this.get(userId, id);
    if (detail.kind !== 'proposal') throw new NotFoundException('方案不存在');
    return this.proposal(detail);
  }
  private dto(row: AssetRow, detail = false) {
    return {
      id: row.id,
      kind: row.kind,
      name: row.name,
      projectId: row.project_id,
      projectName: row.project_name,
      theme: row.theme,
      imagery: row.imagery,
      imageUrl: `/assets/${row.id}/image`,
      createdAt: new Date(row.created_at).toISOString(),
      ...(detail ? { payload: row.payload } : {}),
    };
  }
  private proposal(detail: ReturnType<AssetsService['dto']>) {
    return {
      ...detail.payload,
      ...detail,
      payload: undefined,
    };
  }
}

export function assetImageId(value: string): string | null {
  if (typeof value !== 'string') return null;
  let path = value;
  if (!value.startsWith('/')) {
    try {
      const url = new URL(value);
      if (
        url.protocol !== 'http:' ||
        !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
        url.port !== (process.env.PORT || '3000') ||
        url.search ||
        url.hash ||
        url.username ||
        url.password
      )
        return null;
      path = url.pathname;
    } catch {
      return null;
    }
  }
  return /^\/assets\/([0-9a-f-]{36})\/image$/.exec(path)?.[1] ?? null;
}

export function referenceImageId(value: string): string | null {
  if (typeof value !== 'string') return null;
  // Reuse the strict local-origin parser so lookalike hosts never read private images.
  const mapped = value.replace('/assets/references/', '/assets/');
  return mapped === value ? null : assetImageId(mapped);
}
