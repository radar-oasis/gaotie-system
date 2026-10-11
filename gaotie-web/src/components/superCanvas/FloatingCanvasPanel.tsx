import { useLayoutEffect, useRef, useState, type ReactNode, type PointerEvent } from 'react';

type Props = {
  title: string;
  side: 'left' | 'right';
  count: number;
  width: number;
  collapsed: boolean;
  onToggle: () => void;
  children: ReactNode;
};

export default function FloatingCanvasPanel({ title, side, count, width, collapsed, onToggle, children }: Props) {
  const panelRef = useRef<HTMLElement>(null);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const drag = useRef<{ x: number; y: number; left: number; top: number; id: number } | null>(null);

  const bound = (x: number, y: number) => {
    const panel = panelRef.current;
    const parent = panel?.parentElement;
    if (!panel || !parent) return { x, y };
    return {
      x: Math.max(8, Math.min(x, parent.clientWidth - panel.offsetWidth - 8)),
      y: Math.max(8, Math.min(y, parent.clientHeight - panel.offsetHeight - 8)),
    };
  };

  useLayoutEffect(() => {
    const panel = panelRef.current;
    const parent = panel?.parentElement;
    if (!panel || !parent) return;
    const constrain = () => setPosition(current => {
      if (!current) return current;
      const next = bound(current.x, current.y);
      return next.x === current.x && next.y === current.y ? current : next;
    });
    constrain();
    const observer = new ResizeObserver(constrain);
    observer.observe(parent);
    observer.observe(panel);
    return () => observer.disconnect();
  }, [width, collapsed]);

  const startDrag = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    const panel = panelRef.current!;
    drag.current = { x: event.clientX, y: event.clientY, left: panel.offsetLeft, top: panel.offsetTop, id: event.pointerId };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  return <aside ref={panelRef} aria-label={title}
    className={`super-canvas__panel super-canvas__panel--${side} ${collapsed ? 'is-collapsed' : ''}`}
    style={{ width: collapsed ? 190 : width, ...(position ? { left: position.x, top: position.y, right: 'auto' } : {}) }}>
    <div className="super-canvas__panel-header">
      <button type="button" className="super-canvas__panel-drag" aria-label={`移动${title}`}
        title="拖动调整位置，也可用方向键移动" onPointerDown={startDrag}
        onPointerMove={event => {
          const start = drag.current;
          if (!start || start.id !== event.pointerId) return;
          event.stopPropagation();
          setPosition(bound(start.left + event.clientX - start.x, start.top + event.clientY - start.y));
        }}
        onPointerUp={event => { drag.current = null; if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
        onPointerCancel={() => { drag.current = null; }}
        onLostPointerCapture={() => { drag.current = null; }}
        onKeyDown={event => {
          const delta: Record<string, [number, number]> = { ArrowLeft: [-16, 0], ArrowRight: [16, 0], ArrowUp: [0, -16], ArrowDown: [0, 16] };
          if (!delta[event.key]) return;
          event.preventDefault(); event.stopPropagation();
          const panel = panelRef.current!;
          const [x, y] = delta[event.key];
          setPosition(bound(panel.offsetLeft + x, panel.offsetTop + y));
        }}>
        <span>{title}</span><span className="super-canvas__panel-count">{count}</span>
      </button>
      <button type="button" className="super-canvas__collapse-button" aria-expanded={!collapsed}
        aria-label={`${collapsed ? '展开' : '收起'}${title}`} onClick={onToggle}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" style={{ transform: collapsed ? 'rotate(180deg)' : undefined }}><path d="m6 15 6-6 6 6" /></svg>
      </button>
    </div>
    {!collapsed && children}
  </aside>;
}
