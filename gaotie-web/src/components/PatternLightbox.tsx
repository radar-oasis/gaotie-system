import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AddIcon, CloseIcon, MinusIcon } from 'tdesign-icons-react';
import type { Pattern } from '../context/ImageSearchContext';
import { resolveBackendImageUrl } from '../utils/backendUrls';

export default function PatternLightbox({ pattern, onClose }: { pattern: Pattern; onClose: () => void }) {
  const [zoom, setZoom] = useState(100);
  const [failed, setFailed] = useState(false);
  const modal = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const siblings = [...document.body.children].filter((element): element is HTMLElement => element instanceof HTMLElement && !element.contains(modal.current));
    const previousInert = siblings.map(element => element.inert);
    siblings.forEach(element => { element.inert = true; });
    modal.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); closeRef.current(); }
      if (event.key !== 'Tab') return;
      const focusable = [...(modal.current?.querySelectorAll<HTMLElement>('button:not(:disabled), [tabindex="0"]') ?? [])];
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', keydown);
    return () => {
      document.removeEventListener('keydown', keydown);
      document.body.style.overflow = previousOverflow;
      siblings.forEach((element, index) => { element.inert = previousInert[index]; });
      if (opener?.isConnected) opener.focus();
    };
  }, []);
  return createPortal(<div className="pattern-lightbox" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={modal} className="pattern-lightbox__dialog" role="dialog" aria-modal="true" aria-label={`${pattern.name} 大图预览`}>
      <header><h2>{pattern.name}</h2><button type="button" aria-label="关闭大图" onClick={onClose}><CloseIcon size={22} /></button></header>
      <div className="pattern-lightbox__viewport" tabIndex={0} aria-label="纹样大图">
        {failed ? <p role="status">图片加载失败，请关闭后重试。</p> : <div className="pattern-lightbox__canvas" style={{ width: `${zoom}%`, height: `${zoom}%` }}>
          <img src={resolveBackendImageUrl(pattern.imageUrl)} alt={pattern.name} onError={() => setFailed(true)} />
        </div>}
      </div>
      <footer>
        <button type="button" aria-label="缩小图片" disabled={zoom <= 100 || failed} onClick={() => setZoom(value => Math.max(100, value - 25))}><MinusIcon /></button>
        <button type="button" aria-label="适应窗口" onClick={() => setZoom(100)}>{zoom}%</button>
        <button type="button" aria-label="放大图片" disabled={zoom >= 300 || failed} onClick={() => setZoom(value => Math.min(300, value + 25))}><AddIcon /></button>
      </footer>
    </div>
  </div>, document.body);
}
