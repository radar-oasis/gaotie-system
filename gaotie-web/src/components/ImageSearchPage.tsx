import { useCallback, useEffect, useState } from 'react';
import IntentDialogue from './IntentDialogue';
import PatternGallery from './PatternGallery';
import SelectedPatternsList from './SelectedPatternsList';
import { useImageSearch, type MatchKind } from '../context/ImageSearchContext';
import { useProject } from '../projects/ProjectContext';
import { apiUrl } from '../utils/backendUrls';
import { fallbackSearchFilters, filtersFromTags, mergeSearchPage, normalizeIntentFilters, queryPatternGroups } from '../utils/patternSearch';
import './PatternSearch.css';

export default function ImageSearchPage({ onConfirm }: { onConfirm: () => void }) {
  const image = useImageSearch();
  const { setPatterns, setSearchGroups, setIntentFilters, setReasoning, setIsSearching, setSearchMessage } = image;
  const { currentProject } = useProject();
  const requestRef = image.searchRequestRef;
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    setIsSearching(false);
    setLoadingMore(false);
    return () => { requestRef.current?.abort(); };
  }, [currentProject?.id, setIsSearching, requestRef]);

  const handleSearch = useCallback(async (input: string, tags?: { label: string }[]) => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    const { signal } = controller;
    setLoadingMore(false);
    setIsSearching(true);
    setPatterns([]);
    setSearchGroups([]);
    setReasoning('');
    setSearchMessage('');
    try {
      let filters = tags?.length ? filtersFromTags(tags) : fallbackSearchFilters(input);
      let reasoning = '正在根据图谱词表识别意象和筛选条件。';
      {
        try {
          const response = await fetch(apiUrl('/image-search/parse-intent'), {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userInput: input, ...(tags?.length ? { groups: filters.groups } : {}) }), signal,
          });
          if (response.ok) {
            const parsed = await response.json();
            filters = normalizeIntentFilters(parsed.filters, filters);
            reasoning = typeof parsed.reasoning === 'string' ? parsed.reasoning : '已解析检索条件。';
          }
        } catch { if (signal.aborted) return; }
      }
      if (signal.aborted) return;
      setIntentFilters(filters);
      setReasoning(reasoning);
      const result = await queryPatternGroups(filters, signal);
      if (signal.aborted) return;
      if (result.filters) setIntentFilters(result.filters);
      setPatterns(result.patterns);
      setSearchGroups(result.groups);
      if (!result.patterns.length) setSearchMessage('当前条件暂无素材。可尝试具体意象或减少限定条件。');
    } catch {
      if (!signal.aborted) setSearchMessage('检索接口异常，请稍后重试。');
    } finally {
      if (!signal.aborted) setIsSearching(false);
    }
  }, [setPatterns, setSearchGroups, setIntentFilters, setReasoning, setIsSearching, setSearchMessage, requestRef]);

  const handleLoadMore = async (groupId: string, kind: MatchKind) => {
    const group = image.searchGroups.find(item => item.id === groupId);
    if (!group || loadingMore || image.isSearching) return;
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    const page = { groupId, kind, offset: (kind === 'direct' ? group.directIds : group.relatedIds).length };
    setLoadingMore(true);
    setSearchMessage('');
    try {
      const incoming = await queryPatternGroups(image.intentFilters, controller.signal, page);
      if (controller.signal.aborted) return;
      const merged = mergeSearchPage({ patterns: image.patterns, groups: image.searchGroups }, incoming, page);
      setPatterns(merged.patterns);
      setSearchGroups(merged.groups);
    } catch {
      if (!controller.signal.aborted) setSearchMessage('更多素材加载失败，可重试。');
    } finally {
      if (requestRef.current === controller) setLoadingMore(false);
    }
  };

  return <div className="pattern-search-page">
    <main className="pattern-search-main">
      <h1>纹样检索</h1>
      <IntentDialogue onSearch={handleSearch} />
      <PatternGallery onLoadMore={handleLoadMore} loadingMore={loadingMore} />
    </main>
    <SelectedPatternsList onConfirm={onConfirm} />
  </div>;
}
