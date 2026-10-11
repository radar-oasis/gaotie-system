import { useEffect, useRef, type KeyboardEvent } from 'react';
import { ArrowUpIcon, ChevronRightIcon } from 'tdesign-icons-react';
import { useImageSearch } from '../context/ImageSearchContext';
import { useSharedTags, type ConfirmedTag } from '../context/SharedTagsContext';

interface IntentDialogueProps {
  onSearch: (userInput: string, tags?: ConfirmedTag[]) => void;
}

export default function IntentDialogue({ onSearch }: IntentDialogueProps) {
  const { intentFilters, isSearching, autoSearchKey, setAutoSearchKey, searchGroups, searchMessage, patterns, searchInput: input, setSearchInput: setInput } = useImageSearch();
  const { confirmedTags } = useSharedTags();
  const attemptedTags = useRef('');
  const composing = useRef(false);
  const tagText = confirmedTags.map(t => `${t.topic ? t.topic + '-' : ''}${t.label}`).join('、');

  useEffect(() => {
    if (!tagText || attemptedTags.current === tagText) return;
    if (autoSearchKey === tagText && (isSearching || patterns.length || searchGroups.length || searchMessage)) return;
    const timer = window.setTimeout(() => {
      attemptedTags.current = tagText;
      setAutoSearchKey(tagText);
      setInput(tagText);
      onSearch(tagText, confirmedTags);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [tagText, autoSearchKey, confirmedTags, onSearch, setAutoSearchKey, setInput, isSearching, patterns.length, searchGroups.length, searchMessage]);

  const submit = () => {
    if (!input.trim() || isSearching) return;
    // A manual request must not be replaced by the demand page's old tags.
    attemptedTags.current = tagText;
    onSearch(input.trim(), input.trim() === tagText ? confirmedTags : undefined);
  };
  const keyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && !composing.current && event.keyCode !== 229) {
      event.preventDefault();
      submit();
    }
  };
  const fields: [string, string[]][] = [
    ['意象', intentFilters.motifs], ['朝代', intentFilters.dynasties],
    ['材质', intentFilters.materials], ['其他条件', intentFilters.others],
    ['载体', intentFilters.carriers ?? []], ['构图', intentFilters.layouts ?? []],
  ];
  const reasons = [...new Set(patterns.flatMap(pattern => pattern.matches?.flatMap(match => match.reasons) ?? []))];
  const hasEvidence = fields.some(([, values]) => values.length) || searchGroups.length > 0;

  return <section className="pattern-composer" aria-label="纹样需求">
    <form className="pattern-composer__input workspace-composer" onSubmit={event => { event.preventDefault(); submit(); }}>
      <textarea aria-label="描述想找的纹样" placeholder="描述想找的纹样…" value={input}
        rows={2} maxLength={2000} onChange={event => setInput(event.target.value)}
        onCompositionStart={() => { composing.current = true; }}
        onCompositionEnd={() => { composing.current = false; }}
        onKeyDown={keyDown} disabled={isSearching} />
      <button type="submit" className="pattern-send workspace-send" aria-label="发送检索需求"
        title="发送（Enter）" disabled={!input.trim() || isSearching}>
        {isSearching ? <span className="pattern-spinner" /> : <ArrowUpIcon size={22} />}
      </button>
    </form>
    {hasEvidence && !isSearching && <details className="pattern-evidence" key={JSON.stringify(intentFilters)}>
      <summary>检索依据 <ChevronRightIcon /></summary>
      <div className="pattern-evidence__body">
        <dl>{fields.filter(([, values]) => values.length).map(([label, values]) =>
          <div key={label}><dt>{label}</dt><dd>{values.join('、')}</dd></div>)}</dl>
        {!!reasons.length && <ul>{reasons.slice(0, 8).map(reason => <li key={reason}>{reason}</li>)}</ul>}
        <p>相关灵感来自图谱关联与预设映射，不代表每张图片必然具有对应感受。</p>
        {patterns.length > 0 && searchGroups.length === 0 && <p>旧版结果，重新检索后可按意象查看。</p>}
      </div>
    </details>}
  </section>;
}
