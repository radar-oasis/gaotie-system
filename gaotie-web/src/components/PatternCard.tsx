import { useEffect, useRef, useState } from 'react';
import { AddIcon, CheckIcon, ChevronRightIcon, ImageIcon } from 'tdesign-icons-react';
import type { Pattern } from '../context/ImageSearchContext';
import { resolveBackendImageUrl } from '../utils/backendUrls';

export default function PatternCard({ pattern, selected, reasons, onToggle, onPreview }: {
  pattern: Pattern;
  selected: boolean;
  reasons: string[];
  onToggle: () => void;
  onPreview: () => void;
}) {
  const [flipped, setFlipped] = useState(false);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const backRef = useRef<HTMLDivElement>(null);
  const infoRef = useRef<HTMLButtonElement>(null);
  const imageUrl = resolveBackendImageUrl(pattern.imageUrl);
  const tags = pattern.motifs?.length ? pattern.motifs : pattern.categories ?? [];
  const reset = (focus = false) => {
    setFlipped(false);
    if (focus) requestAnimationFrame(() => infoRef.current?.focus());
  };
  useEffect(() => { if (flipped) backRef.current?.focus({ preventScroll: true }); }, [flipped]);
  const metadata: [string, string | undefined][] = [
    ['朝代', pattern.dynasty], ['意象', pattern.motifs?.join('、')],
    ['类型', pattern.categories?.join('、')], ['材质', pattern.materials?.join('、')],
    ['载体', pattern.carriers?.join('、')], ['构图', pattern.layouts?.join('、')],
    ['文化寓意', undefined], ['来源', undefined],
  ];

  return <article className={`pattern-card${selected ? ' is-selected' : ''}`} data-pattern-id={pattern.id}
    data-flipped={flipped} onMouseLeave={() => reset()}
    onBlur={event => { if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) reset(); }}
    onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); reset(true); } }}>
    <div className="pattern-card__turn">
      <div className="pattern-card__front" aria-hidden={flipped} inert={flipped}>
        <button type="button" className="pattern-card__image" aria-label={`放大 ${pattern.name}`}
          onClick={onPreview} disabled={!imageUrl || failed}>
          {imageUrl && !failed ? <>
            {!loaded && <span className="pattern-card__loading" aria-label="图片加载中" />}
            <img src={imageUrl} alt={pattern.name} loading="lazy" decoding="async"
              onLoad={() => setLoaded(true)} onError={() => setFailed(true)} />
          </> : <span className="pattern-card__fallback"><ImageIcon size={30} />{failed ? '图片加载失败' : '暂无图片'}</span>}
        </button>
        <button type="button" className="pattern-card__select" aria-label={`${selected ? '取消选择' : '选择'} ${pattern.name}`}
          aria-pressed={selected} title={selected ? '取消选择' : '加入已选'} onClick={onToggle}>
          {selected ? <CheckIcon size={19} /> : <AddIcon size={19} />}
        </button>
        <button type="button" ref={infoRef} className="pattern-card__info" aria-label={`查看 ${pattern.name} 的信息`}
          aria-expanded={flipped} onClick={() => setFlipped(true)}>
          <strong title={pattern.name}>{pattern.name}</strong>
          <span className="pattern-card__tags">{tags.length ? tags.slice(0, 2).map(tag => <span key={tag}>{tag}</span>) : <span>纹样信息</span>}</span>
          <ChevronRightIcon className="pattern-card__arrow" size={18} />
        </button>
      </div>
      <div ref={backRef} className="pattern-card__back" aria-hidden={!flipped} inert={!flipped}
        tabIndex={flipped ? 0 : -1} role="group" aria-label={`${pattern.name} 详细信息`}
        onClick={() => reset(true)} onKeyDown={event => {
          if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); reset(true); }
        }}>
        <h3>{pattern.name}</h3>
        <dl>{metadata.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || '暂无记录'}</dd></div>)}</dl>
        {pattern.description && <p className="pattern-card__description">{pattern.description}</p>}
        {!!reasons.length && <div className="pattern-card__reasons"><h4>匹配依据</h4>{reasons.map(reason => <p key={reason}>{reason}</p>)}</div>}
      </div>
    </div>
  </article>;
}
