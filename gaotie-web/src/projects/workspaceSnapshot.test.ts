import { describe, expect, it } from 'vitest';
import {
  createEmptyWorkspaceSnapshot,
  normalizeWorkspaceSnapshot,
  type WorkspaceSnapshot,
} from './workspaceSnapshot';

it('preserves the motif request independently from auto-search tags and migrates old snapshots', () => {
  expect(normalizeWorkspaceSnapshot({ image: { searchInput: '想找祥云', autoSearchKey: '龙' } }).image).toHaveProperty('searchInput', '想找祥云');
  expect(normalizeWorkspaceSnapshot({ image: { autoSearchKey: '龙' } }).image).toHaveProperty('searchInput', '龙');
});

describe('workspaceSnapshot', () => {
  it('preserves non-destructive crop and mirror flags in saved canvas layers', () => {
    const layer = { id: 'mirror-test', type: 'image', name: '纹样', src: 'image.png', x: 60, y: 20, width: 150, height: 100, rotation: 30, opacity: 1, flipX: true, flipY: true, crop: { left: .25, right: 0, top: 0, bottom: 0 } };
    expect(normalizeWorkspaceSnapshot({ canvas: { layers: [layer] } }).canvas.layers).toEqual([layer]);
  });
  it('preserves grouped discovery, facets and match reasons when restoring a project', () => {
    const snapshot = createEmptyWorkspaceSnapshot();
    snapshot.image.searchGroups = [{ id: '龙', label: '龙', keywords: ['龙'], directIds: ['1'], relatedIds: [], directTotal: 3, relatedTotal: 0 }];
    snapshot.image.intentFilters = { motifs: ['龙'], others: [], materials: ['铜'], dynasties: ['明'], carriers: ['盘'], layouts: ['对称'], groups: [{ id: '龙', label: '龙', keywords: ['龙'] }] };
    snapshot.image.patterns = [{ id: '1', name: '铜盘', imageUrl: '1.png', dynasty: '明', description: '1', matches: [{ groupId: '龙', kind: 'direct', reasons: ['母题：龙'] }] }];
    expect(normalizeWorkspaceSnapshot(snapshot).image).toEqual(snapshot.image);
    expect(normalizeWorkspaceSnapshot({ image: { patterns: [] } }).image.searchGroups).toEqual([]);
  });
  it('creates an empty snapshot with every module present', () => {
    const snapshot = createEmptyWorkspaceSnapshot();

    expect(snapshot.version).toBe(1);
    expect(snapshot.demand.chatHistory).toEqual([]);
    expect(snapshot.image.selectedPatterns).toEqual([]);
    expect(snapshot.caseSearch.selectedCases).toEqual([]);
    expect(snapshot.canvas.layers).toEqual([]);
    expect(snapshot.canvas.promptAssets).toEqual([]);
  });

  it('normalizes partial persisted data without dropping known fields', () => {
    const persisted = {
      activeTab: 'image',
      demand: {
        selectedTags: [{ id: 'tag-1', label: '龙纹' }],
      },
      image: {
        selectedPatterns: [{ id: 'p-1', name: '唐代龙纹' }],
      },
    };

    const normalized = normalizeWorkspaceSnapshot(
      persisted,
    ) as WorkspaceSnapshot;

    expect(normalized.activeTab).toBe('image');
    expect(normalized.demand.selectedTags).toEqual([
      { id: 'tag-1', label: '龙纹' },
    ]);
    expect(normalized.image.selectedPatterns).toEqual([
      { id: 'p-1', name: '唐代龙纹' },
    ]);
    expect(normalized.caseSearch.chatHistory).toEqual([]);
    expect(normalized.canvas.promptAssets).toEqual([]);
    expect(normalized.finalProposal.archivedProposals).toEqual([]);
  });

  it('normalizes saved prompt assets in canvas snapshots', () => {
    const normalized = normalizeWorkspaceSnapshot({
      canvas: {
        promptAssets: [
          {
            id: 'prompt-1',
            title: '飞凤纹 · 简约线条',
            promptText: '转化为简约线描',
            tags: [{ id: 'line-style:simplified', category: 'lineStyle', label: '简约线条' }],
            sourcePatterns: [{ id: 'pattern-1', name: '飞凤纹' }],
            quality: 'recommended',
            usageCount: 2,
            createdAt: '2026-07-02T00:00:00.000Z',
            updatedAt: '2026-07-02T00:00:00.000Z',
          },
        ],
      },
    });

    expect(normalized.canvas.promptAssets).toHaveLength(1);
    expect(normalized.canvas.promptAssets[0]?.title).toBe('飞凤纹 · 简约线条');
  });

  it('falls back to an empty snapshot for invalid values', () => {
    expect(normalizeWorkspaceSnapshot(null)).toEqual(
      createEmptyWorkspaceSnapshot(),
    );
    expect(normalizeWorkspaceSnapshot('bad-json')).toEqual(
      createEmptyWorkspaceSnapshot(),
    );
  });
});


it('migrates legacy reference selection but preserves an explicit empty selection', () => {
  const currentProposal = { packageSnapshot: { selectedReferenceImageUrls: ['capture.png'] } };
  expect(normalizeWorkspaceSnapshot({ finalProposal: { currentProposal } }).finalProposal.selectedReferenceImageUrls).toEqual(['capture.png']);
  expect(normalizeWorkspaceSnapshot({ finalProposal: { currentProposal, selectedReferenceImageUrls: [] } }).finalProposal.selectedReferenceImageUrls).toEqual([]);
});

it('discards legacy archive indexes because archives are loaded by project from the server', () => {
  expect(normalizeWorkspaceSnapshot({ finalProposal: { archivedProposals: [{ id: 'other-project' }] } }).finalProposal.archivedProposals).toEqual([]);
});


it('preserves explicit reference IDs including an empty choice and identifies legacy URL-only data', () => {
  expect(normalizeWorkspaceSnapshot({finalProposal:{selectedReferenceImageUrls:['same.png']}}).finalProposal.selectedReferenceAssetIds).toBeNull();
  expect(normalizeWorkspaceSnapshot({finalProposal:{selectedReferenceAssetIds:[], selectedReferenceImageUrls:['same.png']}}).finalProposal.selectedReferenceAssetIds).toEqual([]);
  expect(normalizeWorkspaceSnapshot({finalProposal:{selectedReferenceAssetIds:['capture-a']}}).finalProposal.selectedReferenceAssetIds).toEqual(['capture-a']);
});
