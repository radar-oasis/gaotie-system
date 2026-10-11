import { useState } from 'react';
import { ArrowRightIcon, CloseIcon, ImageIcon } from 'tdesign-icons-react';
import { useImageSearch, type Pattern } from '../context/ImageSearchContext';
import { resolveBackendImageUrl } from '../utils/backendUrls';
import PatternLightbox from './PatternLightbox';

function SelectedImage({ pattern }: { pattern: Pattern }) {
  const [failed, setFailed] = useState(false);
  const url = resolveBackendImageUrl(pattern.imageUrl);
  return url && !failed ? <img src={url} alt={pattern.name} onError={() => setFailed(true)} /> : <ImageIcon size={24} />;
}

export default function SelectedPatternsList({ onConfirm }: { onConfirm: () => void }) {
  const { selectedPatterns, removePattern } = useImageSearch();
  const [preview, setPreview] = useState<Pattern | null>(null);
  return <aside className="pattern-selected" aria-label="已选素材">
    <header><h2>已选素材</h2><span className="pattern-selected__count" aria-live="polite">{selectedPatterns.length}</span></header>
    <div className="pattern-selected__list">
      {selectedPatterns.length === 0 ? <p className="pattern-selected__empty">还未选择素材</p> : selectedPatterns.map(pattern =>
        <div className="pattern-selected__item" key={pattern.id}>
          <button type="button" className="pattern-selected__image" aria-label={`预览已选 ${pattern.name}`} disabled={!pattern.imageUrl} onClick={() => setPreview(pattern)}>
            <SelectedImage pattern={pattern} />
          </button>
          <div className="pattern-selected__name"><strong title={pattern.name}>{pattern.name}</strong>
            <span>{pattern.motifs?.slice(0, 2).join(' · ') || pattern.dynasty}</span></div>
          <button type="button" className="pattern-selected__remove" aria-label={`删除 ${pattern.name}`} title="移除" onClick={() => removePattern(pattern.id)}><CloseIcon /></button>
        </div>)}
    </div>
    <button type="button" className="pattern-selected__confirm" onClick={onConfirm} disabled={!selectedPatterns.length}>进入纹样转化 <ArrowRightIcon size={21} /></button>
    {preview && <PatternLightbox pattern={preview} onClose={() => setPreview(null)} />}
  </aside>;
}
