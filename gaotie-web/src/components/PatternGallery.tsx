import { useMemo, useState } from 'react';
import { ChevronLeftIcon, ChevronRightIcon, ImageIcon } from 'tdesign-icons-react';
import { useImageSearch, type Pattern, type MatchKind } from '../context/ImageSearchContext';
import { clampPatternPage, getPatternPage, getPatternPageCount } from '../utils/patternResults';
import PatternCard from './PatternCard';
import PatternLightbox from './PatternLightbox';
import Neo4jPatternBrowser from './Neo4jPatternBrowser';
import './PatternGallery.css';

export default function PatternGallery({ onLoadMore, loadingMore = false }: {
  onLoadMore?: (groupId: string, kind: MatchKind) => void;
  loadingMore?: boolean;
}) {
  const { patterns, searchGroups, selectedPatterns, intentFilters, isSearching, searchMessage, addPattern, removePattern } = useImageSearch();
  const [groupId, setGroupId] = useState('');
  const [lane, setLane] = useState<{ groupId: string; kind: MatchKind } | null>(null);
  const [view, setView] = useState({ key: '', page: 1 });
  const [preview, setPreview] = useState<Pattern | null>(null);
  const [mode, setMode] = useState<'images' | 'graph'>('graph');
  const group = searchGroups.find(item => item.id === groupId) ?? searchGroups[0];
  const kind = lane?.groupId === group?.id && lane ? lane.kind : group?.directTotal === 0 ? 'related' : 'direct';
  const filtered = useMemo(() => {
    if (!group) return patterns;
    const byId = new Map(patterns.map(pattern => [pattern.id, pattern]));
    return (kind === 'direct' ? group.directIds : group.relatedIds).flatMap(id => byId.has(id) ? [byId.get(id)!] : []);
  }, [patterns, group, kind]);
  const resultTotal = group ? kind === 'direct' ? group.directTotal : group.relatedTotal : patterns.length;
  const key = `${group?.id ?? ''}:${kind}:${filtered[0]?.id ?? ''}`;
  const page = clampPatternPage(view.key === key ? view.page : 1, filtered.length);
  const totalPages = getPatternPageCount(filtered.length);
  const selectedIds = new Set(selectedPatterns.map(pattern => pattern.id));

  return <section className="pattern-gallery" aria-label="纹样检索结果" aria-busy={isSearching}>
    {!!searchGroups.length && <div className="pattern-groups" role="tablist" aria-label="意象分组">
      {searchGroups.map(item => <button type="button" role="tab" aria-selected={group?.id === item.id} key={item.id}
        onClick={() => { setGroupId(item.id); setLane(null); setView({ key: '', page: 1 }); }}>
        {item.label}<span>{item.directTotal + item.relatedTotal}</span>
      </button>)}
    </div>}
    {(patterns.length > 0 || group) && <div className="pattern-gallery__heading">
      {group ? <div className="pattern-lanes" aria-label="匹配范围">
        {(['direct', 'related'] as const).map(value => <button key={value} type="button" aria-pressed={kind === value}
          onClick={() => { setLane({ groupId: group.id, kind: value }); setView({ key: '', page: 1 }); }}>
          {value === 'direct' ? '直接匹配' : '相关灵感'}
        </button>)}
      </div> : <h2>检索结果</h2>}
      <span className="pattern-gallery__count">{resultTotal} 张</span>
      <div className="pattern-view-switch" aria-label="检索展示方式">
        <button aria-label="图谱视图" aria-pressed={mode === 'graph'} onClick={() => setMode('graph')}>图谱</button>
        <button aria-label="图片视图" aria-pressed={mode === 'images'} onClick={() => setMode('images')}>图片</button>
      </div>
    </div>}
    {searchMessage && <p className="pattern-search-message" role="status">{searchMessage}</p>}
    {isSearching ? <div className="pattern-empty" role="status"><span className="pattern-spinner" /><p>正在检索…</p></div>
      : filtered.length === 0 ? <div className="pattern-empty"><ImageIcon size={36} /><p>{group ? `暂无${kind === 'direct' ? '直接匹配' : '相关灵感'}` : '描述需求，开始找纹样'}</p>
        {group && kind === 'direct' && group.relatedTotal > 0 && <button className="pattern-text-action" onClick={() => setLane({ groupId: group.id, kind: 'related' })}>查看相关灵感 <ChevronRightIcon /></button>}
      </div> : mode === 'graph' ? <Neo4jPatternBrowser key={`${key}:${JSON.stringify(intentFilters)}:${filtered.map(p => p.id).join('|')}`} patterns={filtered} query={group ? { ...intentFilters, groups: [{id: group.id, label: group.label, keywords: group.keywords}] } : undefined} kind={kind} selectedIds={selectedIds} onToggle={pattern => selectedIds.has(pattern.id) ? removePattern(pattern.id) : addPattern(pattern)} onPreview={setPreview} /> : <div className="pattern-grid" key={key}>
        {getPatternPage(filtered, page).map(pattern => <PatternCard key={`${pattern.id}:${pattern.imageUrl}`} pattern={pattern}
          selected={selectedIds.has(pattern.id)}
          reasons={pattern.matches?.filter(match => match.groupId === group?.id && match.kind === kind).flatMap(match => match.reasons) ?? []}
          onToggle={() => selectedIds.has(pattern.id) ? removePattern(pattern.id) : addPattern(pattern)}
          onPreview={() => setPreview(pattern)} />)}
      </div>}
    {mode === 'images' && totalPages > 1 && <div className="pattern-pagination" aria-label="结果分页">
      <button type="button" aria-label="上一页" disabled={page <= 1} onClick={() => setView({ key, page: page - 1 })}><ChevronLeftIcon /></button>
      <span>{page} / {totalPages}</span>
      <button type="button" aria-label="下一页" disabled={page >= totalPages} onClick={() => setView({ key, page: page + 1 })}><ChevronRightIcon /></button>
    </div>}
    {group && resultTotal > filtered.length && <div className="pattern-load-more">
      <button type="button" disabled={loadingMore || isSearching} onClick={() => onLoadMore?.(group.id, kind)}>
        {loadingMore ? '加载中…' : `加载更多${kind === 'direct' ? '匹配' : '灵感'}`}
      </button>
    </div>}
    {preview && <PatternLightbox pattern={preview} onClose={() => setPreview(null)} />}
  </section>;
}
