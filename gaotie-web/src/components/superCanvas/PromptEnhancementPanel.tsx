import { useEffect, useRef, useState } from 'react';
import { enhancePrompt, type EnhancementReference, type PromptEnhancement } from './promptEnhancement';
import './PromptEnhancementPanel.css';

interface Props {
  prompt: string;
  references: EnhancementReference[];
  referenceKey: string;
  scopeKey: string;
  disabled: boolean;
  onApply: (prompt: string) => void;
}
interface Comparison {
  result: PromptEnhancement;
  scopeKey: string;
  referenceKey: string;
}

export default function PromptEnhancementPanel({ prompt, references, referenceKey, scopeKey, disabled, onApply }: Props) {
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [applied, setApplied] = useState<string | null>(null);
  const [appliedLabel, setAppliedLabel] = useState('原始输入');
  const [collapsed, setCollapsed] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);
  const requestKey = JSON.stringify([scopeKey, referenceKey, prompt]);
  const latestKey = useRef(requestKey);
  latestKey.current = requestKey;

  useEffect(() => {
    controllerRef.current?.abort();
    setBusy(false);
    setError('');
  }, [requestKey]);
  useEffect(() => {
    setComparison(null);
    setDrafts({});
    setApplied(null);
    setNotice('');
    return () => controllerRef.current?.abort();
  }, [scopeKey]);

  const result = comparison?.scopeKey === scopeKey ? comparison.result : null;
  const referenceChanged = comparison?.referenceKey !== referenceKey;
  const inputChanged = !!result && prompt !== result.originalPrompt && prompt !== applied;
  const stale = !!result && (referenceChanged || inputChanged);
  const invalidCount = references.length > 8;

  const optimize = async () => {
    if (!prompt.trim() || busy || disabled || invalidCount) return;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const key = requestKey;
    setBusy(true); setError(''); setNotice('');
    try {
      const enhanced = await enhancePrompt({ prompt, references }, controller.signal);
      if (controller.signal.aborted || latestKey.current !== key) return;
      setComparison({ result: enhanced, scopeKey, referenceKey });
      setDrafts(Object.fromEntries(enhanced.directions.map(direction => [direction.id, direction.prompt])));
      setApplied(null);
      setAppliedLabel('原始输入');
      setCollapsed(false);
    } catch (cause) {
      if (!controller.signal.aborted && latestKey.current === key) setError(cause instanceof Error ? cause.message : '提示词优化失败，请重试。');
    } finally {
      if (!controller.signal.aborted && latestKey.current === key) setBusy(false);
    }
  };

  const apply = (text: string, label: string) => {
    setApplied(text);
    setAppliedLabel(label);
    onApply(text);
    setNotice(`${label}已放入输入框，尚未生图。确认后点击 AI 转化。`);
  };
  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); setNotice('已复制，可粘贴到你的对照记录。'); }
    catch { setNotice('复制不可用，请从文本框手动选择复制。'); }
  };

  return <section className="prompt-enhancer" aria-label="提示词优化">
    <div className="prompt-enhancer__header">
      <div><strong>提示词优化</strong><span>填入后需手动点击 AI 转化</span></div>
      <button type="button" onClick={() => void optimize()} disabled={!prompt.trim() || disabled || busy || invalidCount}>
        {busy ? '正在优化…' : '优化提示词'}
      </button>
      {result && <button type="button" aria-expanded={!collapsed} onClick={() => setCollapsed(previous => !previous)}>{collapsed ? '查看建议' : '收起建议'}</button>}
      {busy && <button type="button" onClick={() => { controllerRef.current?.abort(); setBusy(false); setNotice('已取消优化，原输入未改变。'); }}>取消优化</button>}
    </div>
    <p className="prompt-enhancer__hint">仅使用当前选中图层的名称和已有信息，不读取图片内容；优化不会自动生图。</p>
    <p className="prompt-enhancer__hint">{references.length ? `本次参考：${references.map((ref, index) => `图${index + 1} ${ref.name}`).join('；')}` : '未选中参考图层：按文字需求优化。若要转化原纹样，请先选中画布中的图片。'}</p>
    {invalidCount && <p role="alert">一次最多参考 8 个图层，请减少选择。</p>}
    {error && <p className="prompt-enhancer__error" role="alert">{error} 原始输入保留，可重试。</p>}
    {result && <>
      <p className="prompt-enhancer__hint">当前输入来源：{inputChanged ? '手动修改（未复核）' : appliedLabel}。
      </p>
    </>}
    {result && !collapsed && <div className="prompt-enhancer__comparison">
      <div className="prompt-enhancer__original">
        <strong>本轮原始输入</strong><p>{result.originalPrompt}</p>
        <button type="button" disabled={disabled || busy} onClick={() => apply(result.originalPrompt, '原始输入')}>恢复原始输入</button>
        <button type="button" onClick={() => void copy(result.originalPrompt)}>复制原文</button>
      </div>
      {stale && <p className="prompt-enhancer__warning">输入或参考图已变化，以下保留为对照记录；请重新优化后再应用方向。</p>}
      <div className="prompt-enhancer__directions">
        {result.directions.map(direction => {
          const draft = drafts[direction.id] ?? direction.prompt;
          const edited = draft !== direction.prompt;
          const overLimit = draft.length > result.maxPromptLength;
          return <article key={direction.id}>
            <strong>{direction.id === 'preserve' ? '保留型' : '探索型'} · {direction.title}</strong>
            <label>
              <span className="prompt-enhancer__hint">可编辑的{direction.id === 'preserve' ? '保留型' : '探索型'}提示词</span>
              <textarea value={draft} disabled={disabled || busy} onChange={event => setDrafts(previous => ({ ...previous, [direction.id]: event.target.value }))} />
            </label>
            <p className={overLimit ? 'prompt-enhancer__error' : 'prompt-enhancer__hint'}>{draft.length} / {result.maxPromptLength} 字符{overLimit ? '，请缩短后再应用；不会自动截断。' : ''}</p>
            <p><b>拟保留：</b>{direction.retained.join('；') || '请结合原始输入确认'}</p>
            <p><b>新增建议：</b>{direction.changes.join('；') || '无额外建议'}</p>
            <details><summary>{edited ? '候选已编辑，原检查需重新复核' : '查看文本检查与待确认项'}</summary>
              <p className="prompt-enhancer__hint">以下包含模型建议，不代表图片已验证；修改候选后请重新核对。</p>
              <ul>{direction.checks.map((check, index) => <li key={index}>{check.status === 'warning' ? '待确认' : '检查'} · {check.label}：{check.detail}</li>)}</ul>
            </details>
            <div className="prompt-enhancer__actions">
              <button type="button" disabled={disabled || busy || stale || overLimit || !draft.trim()} onClick={() => apply(draft.trim(), direction.id === 'preserve' ? '保留型' : '探索型')}>
                {direction.id === 'preserve' ? '填入保留型（不生图）' : '填入探索型（不生图）'}
              </button>
              <button type="button" onClick={() => void copy(draft)}>复制候选</button>
            </div>
          </article>;
        })}
      </div>
      {result.warnings.map((warning, index) => <p className="prompt-enhancer__warning" key={index}>{warning}</p>)}
      <p className="prompt-enhancer__hint">候选仅供本轮对照，填入后仍需手动点击 AI 转化。</p>
    </div>}
    {notice && <p role="status">{notice}</p>}
  </section>;
}
