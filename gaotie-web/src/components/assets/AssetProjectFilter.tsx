import { useEffect, useId, useRef, useState } from "react";

export default function AssetProjectFilter({ value, projects, onChange }: {
  value: string;
  projects: [string, string][];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const options = useRef<(HTMLButtonElement | null)[]>([]);
  const id = useId();
  const choices: [string, string][] = [["", "全部项目"], ...projects];
  const selected = Math.max(0, choices.findIndex(([key]) => key === value));
  const close = (returnFocus = true) => {
    setOpen(false);
    if (returnFocus) trigger.current?.focus();
  };
  useEffect(() => {
    if (open) options.current[active]?.focus();
  }, [open, active]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  return (
    <div className="asset-project-filter" ref={root} onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false);
    }}>
      <button ref={trigger} type="button" className="asset-project-filter__trigger"
        aria-label="按项目筛选" aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? id : undefined}
        onClick={() => { setActive(selected); setOpen(!open); }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault(); setActive(selected); setOpen(true);
          }
        }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M3 7h7l2-3h9v16H3z" /></svg>
        <span>{choices[selected][1]}</span>
        <svg className="asset-project-filter__chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {open && <div className="asset-project-filter__menu" role="listbox" id={id} aria-label="项目" onKeyDown={(event) => {
        if (event.key === "Escape") { event.preventDefault(); close(); }
        if (event.key === "Tab") { close(false); }
        if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
          event.preventDefault();
          setActive(event.key === "Home" ? 0 : event.key === "End" ? choices.length - 1 : (active + (event.key === "ArrowDown" ? 1 : -1) + choices.length) % choices.length);
        }
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault(); onChange(choices[active][0]); close();
        }
      }}>
        {choices.map(([key, name], index) => <button type="button" key={key} role="option"
          data-value={key} aria-selected={key === value} tabIndex={active === index ? 0 : -1}
          ref={(node) => { options.current[index] = node; }}
          onClick={() => { onChange(key); close(); }}>
          <span>{name}</span><span aria-hidden="true">{key === value ? "✓" : ""}</span>
        </button>)}
      </div>}
    </div>
  );
}
