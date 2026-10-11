import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpIcon } from 'tdesign-icons-react';
import type { GraphControls } from '../NativeGraphCanvas';
import type { NativeGraph } from '../../utils/nativeGraph';
import '../Neo4jPatternBrowser.css';
import '../WorkspaceDialogue.css';
import { apiUrl, resolveBackendImageUrl } from '../../utils/backendUrls';
import './AssetKnowledgeGraph.css';
const NativeGraphCanvas = lazy(() => import('../NativeGraphCanvas'));
interface GraphNode { id: string; label: string; kind: string; assetId?: string; imageUrl?: string }
interface ChatMessage { role: 'user' | 'assistant'; content: string }
interface GraphResult {
  reply?: string;
  nodes: GraphNode[];
  edges: { id: string; source: string; target: string; label: string }[];
  matches: { assetId: string; name: string; kind: string; paths: string[][] }[];
  status: { truncated?: boolean; [key: string]: unknown };
}
const colors: Record<string, string> = { palette: '#f5c3a3', 'color-role': '#f4df96', 'capture-pattern': '#b5d9be', 'change-instruction': '#f1cee7', project: '#e9e5db', pattern: '#c5d78f', transformed: '#c5d78f', original: '#a9ddf4', originalPattern: '#a9ddf4', 'original-pattern': '#a9ddf4', 'transformed-pattern': '#c5d78f', 'final-image': '#dbe2ec', 'layout-region': '#e7c7d3', proposal: '#c9bffc', theme: '#ffdfb0', imagery: '#ffdfb0', layout: '#e7c7d3', image: '#dbe2ec' };
function nodeLabel(name: string) {
  const suffix = name.match(/-\d+$/)?.[0] ?? '';
  const compact = name.length > 12 ? `${name.slice(0, suffix ? 8 : 11)}…${suffix}` : name;
  return compact.match(/.{1,6}/g)?.join('\n') ?? compact;
}
export default function AssetKnowledgeGraph({ projectId, onOpenAsset }: { projectId: string; onOpenAsset: (id: string) => void }) {
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [revision, setRevision] = useState(0);
  const [graph, setGraph] = useState<GraphResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState('');
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<GraphNode | null>(null);
  const composing = useRef(false);
  const conversation = useRef<HTMLDivElement>(null);
  const network = useRef<GraphControls | null>(null);
  const request = useRef<AbortController | null>(null);
  useEffect(() => {
    request.current?.abort();
    const abort = new AbortController();
    request.current = abort;
    queueMicrotask(() => { if (!abort.signal.aborted) { setLoading(true); setError(''); setSelected(null); setGraph(null); setMessages([]); setPending(''); setQuery(''); } });
    fetch(apiUrl(`/assets/graph?${new URLSearchParams({ projectId })}`), { credentials: 'include', signal: abort.signal })
      .then(async r => { const body = await r.json(); if (!r.ok) throw new Error(body.message || '图谱暂不可用'); return body as GraphResult; })
      .then(data => { if (!abort.signal.aborted) setGraph(data); })
      .catch(e => { if (!abort.signal.aborted) setError(e.message); })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => { abort.abort(); request.current?.abort(); };
  }, [projectId, revision]);
  const ask = async (value = query) => {
    const message = value.trim();
    if (!message || loading) return;
    request.current?.abort();
    const abort = new AbortController();
    request.current = abort;
    setLoading(true); setPending(message); setError('');
    try {
      const response = await fetch(apiUrl('/assets/graph/chat'), {
        method: 'POST', credentials: 'include', signal: abort.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, projectId, history: messages.slice(-10).map(item => ({ ...item, content: item.content.slice(0, 1500) })) }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || '对话检索失败，请重试');
      if (abort.signal.aborted) return;
      setGraph(body); setSelected(null); setQuery('');
      setMessages(old => [...old, { role: 'user', content: message }, { role: 'assistant', content: body.reply || '已更新相关资产与关系。' }].slice(-20) as ChatMessage[]);
    } catch (e) {
      if (!abort.signal.aborted) { setQuery(message); setError(e instanceof Error ? e.message : '对话检索失败，请重试'); }
    } finally { if (!abort.signal.aborted) { setLoading(false); setPending(''); } }
  };
  useEffect(() => { if (conversation.current) conversation.current.scrollTop = conversation.current.scrollHeight; }, [messages, pending]);
  const askNode = (node: GraphNode) => {
    const prompt = node.kind === 'project' ? `我想查看项目「${node.label}」中的涂装方案` : node.kind === 'proposal' ? `请展示方案「${node.label}」的纹样和布局关系` : `哪些方案采用了「${node.label}」？`;
    setQuery(prompt); void ask(prompt);
  };
  const nativeGraph = useMemo<NativeGraph | null>(() => graph ? ({
    nodes: graph.nodes.map(node => ({ id: node.id, label: node.label, labels: [node.kind], properties: {} })),
    relationships: graph.edges.map(edge => ({ id: edge.id, from: edge.source, to: edge.target, type: edge.label })),
    patterns: [], total: graph.nodes.length, offset: 0, pageSize: graph.nodes.length,
    patternCount: 0, truncated: !!graph.status.truncated,
  }) : null, [graph]);
  return <div className="asset-knowledge pattern-workspace">
    <div className="asset-knowledge__conversation">
      {!!messages.length && <div className="asset-knowledge__messages" ref={conversation} role="log" aria-label="图谱对话" aria-live="polite">{messages.map((message, i) => <div key={i} className={`asset-knowledge__message asset-knowledge__message--${message.role}`}><small>{message.role === 'user' ? '你' : '检索助手'}</small><p>{message.content}</p></div>)}</div>}
      {pending && <p className="asset-knowledge__pending">{pending}</p>}
      <form className="asset-knowledge__search workspace-composer" onSubmit={e => { e.preventDefault(); void ask(); }}>
        <label><span className="asset-sr-only">对话检索</span><textarea rows={2} aria-label="图谱对话" value={query} onChange={e => setQuery(e.target.value)} placeholder="问问项目、方案或纹样，例如：默认项目有哪些涂装方案？" maxLength={1000} disabled={loading}
          onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && !composing.current && e.keyCode !== 229) { e.preventDefault(); void ask(); } }} /></label>
        <button className="workspace-send" type="submit" aria-label="发送图谱问题" title="发送（Enter）" disabled={loading || !query.trim()}>{pending ? <span className="pattern-spinner" /> : <ArrowUpIcon size={22} />}</button>
      </form>
      {!!messages.length && <button className="asset-knowledge__reset" type="button" disabled={loading} onClick={() => setRevision(n => n + 1)}>全部关系</button>}
      {loading && <p role="status" className="asset-knowledge__hint">{pending ? '正在理解问题并检索相关关系…' : '正在加载方案图谱…'}</p>}
      {error && <div role="alert" className="asset-error">{error}<button onClick={() => graph ? void ask() : setRevision(n => n + 1)} disabled={loading}>重试</button></div>}
    </div>
    {graph && <>
      <div className="asset-knowledge__legend"><span>原始纹样</span><span>转化纹样</span><span>涂装方案</span><span>配色方案</span><small>{graph.nodes.length} 个节点 · {graph.edges.length} 条关系</small></div>
      {graph.status.truncated && <p role="status">关系较多，仅显示部分节点；请按项目或关键词缩小范围。</p>}
      {graph.nodes.length ? <div className="asset-knowledge__workspace"><div className="neo4j-native__stage">
        <Suspense fallback={<p role="status">正在绘制关系…</p>}><NativeGraphCanvas ref={network} graph={nativeGraph!} nodeColors={colors} formatLabel={nodeLabel} ariaLabel="资产关系图" onSelect={id => setSelected(graph.nodes.find(node => node.id === id) ?? null)} /></Suspense>
        <div className="neo4j-native__tools"><button aria-label="放大图谱" onClick={() => network.current?.zoom(1.25)}>＋</button><button aria-label="缩小图谱" onClick={() => network.current?.zoom(0.8)}>−</button><button onClick={() => network.current?.fit()}>适应画布</button></div>
      </div><aside>
        {selected ? <><h3>{selected.label}</h3>{selected.imageUrl && <img className="asset-knowledge__preview" src={resolveBackendImageUrl(selected.imageUrl)} alt={selected.label} />}{selected.kind === 'palette' && <ul>{graph.edges.filter(e => e.source === selected.id && e.label === '颜色角色').map(e => <li key={e.id}>{graph.nodes.find(n => n.id === e.target)?.label}</li>)}</ul>}{selected.assetId && <button className="asset-primary" onClick={() => onOpenAsset(selected.assetId!)}>查看资产</button>}{['project', 'proposal', 'original-pattern', 'transformed-pattern', 'capture-pattern', 'palette'].includes(selected.kind) && <button disabled={loading} onClick={() => askNode(selected)}>查询相关方案</button>}{selected.kind === 'proposal' && <button disabled={loading} onClick={() => void ask(`方案「${selected.label}」采用了什么配色？`)}>查看采用配色</button>}</> : <p>点击节点查看资产或继续检索。</p>}
        <details><summary>节点列表 · {graph.nodes.length}</summary>{graph.nodes.map(node => <button key={node.id} className="asset-knowledge__node" onClick={() => { setSelected(node); network.current?.focus(node.id); }}>{node.label}</button>)}</details>
      </aside></div> : <p className="asset-empty">{messages.length ? '没有找到符合条件的关系，可以换个名称或补充条件。' : '保存纹样或涂装方案后，自动建立关联。'}</p>}
      {!!graph.matches.length && <section className="asset-knowledge__results"><h3>{messages.length ? '检索结果' : '图谱中的资产'} · {graph.matches.length}</h3>{graph.matches.map(match => <article key={match.assetId}><button onClick={() => onOpenAsset(match.assetId)}>{match.name} <span>查看详情 ↗</span></button>{match.paths.slice(0, 3).map((path, i) => <p key={i}>{path.map(step => graph.nodes.find(n => n.id === step)?.label ?? step).join(' → ')}</p>)}</article>)}</section>}
    </>}
  </div>;
}
