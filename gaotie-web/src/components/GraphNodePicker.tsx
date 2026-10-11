import { useId, useRef, useState } from 'react';
import { ChevronDownIcon, CheckIcon } from 'tdesign-icons-react';

type Option = { value: string; label: string };
export default function GraphNodePicker({ value, options, onChange }: {
  value: string; options: Option[]; onChange: (value: string) => void;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const filtered = options.filter(option => option.label.toLowerCase().includes(query.toLowerCase()));
  const selected = options.find(option => option.value === value);
  const close = () => { setOpen(false); setQuery(''); setActive(0); };
  const choose = (option: Option) => { onChange(option.value); close(); input.current?.focus(); };
  return <div className="graph-node-picker" onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) close();
  }}>
    <label htmlFor={id}>查找图谱节点</label>
    <div className="graph-node-picker__control">
      <input id={id} ref={input} role="combobox" aria-expanded={open}
        aria-controls={`${id}-list`} aria-autocomplete="list"
        aria-activedescendant={open && filtered[active] ? `${id}-${active}` : undefined}
        value={open ? query : selected?.label ?? ''} placeholder="点击画布或搜索节点"
        onClick={() => setOpen(true)}
        onChange={event => { setQuery(event.target.value); setActive(0); setOpen(true); }}
        onKeyDown={event => {
          if (event.key === 'Escape') { event.preventDefault(); close(); }
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault(); setOpen(true);
            const next = open ? Math.max(0, Math.min(filtered.length - 1, active + (event.key === 'ArrowDown' ? 1 : -1))) : 0;
            setActive(next);
            document.getElementById(`${id}-${next}`)?.scrollIntoView?.({block:'nearest'});
          }
          if (event.key === 'Enter' && open && filtered[active]) { event.preventDefault(); choose(filtered[active]); }
        }} />
      <button type="button" aria-label={open ? '收起节点选项' : '展开节点选项'} aria-expanded={open}
        onClick={() => { if (open) close(); else setOpen(true); input.current?.focus(); }}>
        <ChevronDownIcon className={open ? 'is-open' : ''} />
      </button>
    </div>
    {open && <div className="graph-node-picker__menu" role="listbox" id={`${id}-list`} aria-label="图谱节点选项">
      {filtered.length ? filtered.map((option, index) => <button key={option.value} type="button"
        id={`${id}-${index}`} role="option" tabIndex={-1} aria-selected={value === option.value}
        className={active === index ? 'is-active' : ''}
        onMouseDown={event => event.preventDefault()} onMouseEnter={() => setActive(index)} onClick={() => choose(option)}>
        <span>{option.label}</span>{value === option.value && <CheckIcon />}
      </button>) : <p>没有匹配的节点</p>}
    </div>}
  </div>;
}
