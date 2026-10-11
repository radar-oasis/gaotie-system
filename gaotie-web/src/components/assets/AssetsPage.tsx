import { REVIEW_CHECKS } from '../finalProposal/ProposalReview';
import { useEffect, useMemo, useState } from "react";
import { getAsset, listAssets, removeAsset, type Asset } from "./assetApi";
import { resolveBackendImageUrl } from "../../utils/backendUrls";
import AssetDialog from "./AssetDialog";
import AssetProjectFilter from "./AssetProjectFilter";
import AssetKnowledgeGraph from "./AssetKnowledgeGraph";
import type { PatternProvenance } from "./provenance";
import { describeLayout3D } from "../layout3d/layout3d";
import "./AssetsPage.css";

export default function AssetsPage({ onReusePattern }: { onReusePattern?: (asset: Asset) => Promise<void> | void }) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [kind, setKind] = useState<"pattern" | "proposal" | "graph">("graph");
  const [project, setProject] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Asset | null>(null);
  const [detailError, setDetailError] = useState("");
  const [detailRetry, setDetailRetry] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<Asset | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [removing, setRemoving] = useState(false);
  const [reusing, setReusing] = useState(false);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    listAssets().then(data => { if (alive) setAssets(data); })
      .catch(e => { if (alive) setError(e instanceof Error ? e.message : "资产加载失败"); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [retry]);
  useEffect(() => {
    let alive = true;
    setDetail(null);
    setDetailError("");
    if (selectedId) getAsset(selectedId).then(data => { if (alive) setDetail(data); })
      .catch(e => { if (alive) setDetailError(e instanceof Error ? e.message : "详情加载失败"); });
    return () => { alive = false; };
  }, [selectedId, detailRetry]);
  const projects = useMemo(() => Array.from(new Map(assets.map(a => [a.projectId ?? a.projectName, a.projectName])).entries()), [assets]);
  const visible = assets.filter(a => a.kind === kind && (!project || (a.projectId ?? a.projectName) === project) &&
    [a.name, a.projectName, a.theme, a.imagery].join(" ").toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const close = () => { if (!reusing) setSelectedId(null); };
  const requestDelete = (asset: Asset) => { setDeleteError(""); setDeleteTarget(asset); };
  const remove = async () => {
    if (!deleteTarget || removing) return;
    setRemoving(true); setDeleteError("");
    try {
      await removeAsset(deleteTarget.id);
      const remaining = assets.filter(a => a.id !== deleteTarget.id);
      setAssets(remaining);
      if (project && !remaining.some(a => (a.projectId ?? a.projectName) === project)) setProject("");
      if (selectedId === deleteTarget.id) setSelectedId(null);
      setDeleteTarget(null);
    } catch (e) { setDeleteError(e instanceof Error ? e.message : "删除失败，请重试"); }
    finally { setRemoving(false); }
  };
  const reuse = async () => {
    if (!detail || !onReusePattern || reusing) return;
    setReusing(true); setDetailError("");
    try { await onReusePattern(detail); setSelectedId(null); }
    catch (e) { setDetailError(e instanceof Error ? e.message : "暂时无法打开画布，请重试"); }
    finally { setReusing(false); }
  };
  return (
    <section className="asset-library">
      <header className="asset-library__heading">
        <h1>资产沉淀</h1>
        <span className="asset-library__total">{assets.length}<small>件资产</small></span>
      </header>
      <div className="asset-library__filters">
        <div className="asset-library__tabs" role="tablist" aria-label="资产类型">
          <button role="tab" aria-selected={kind === "graph"} onClick={() => setKind("graph")}>方案图谱</button>
          <button role="tab" aria-selected={kind === "pattern"} onClick={() => setKind("pattern")}>收藏纹样 <small>{assets.filter(a => a.kind === "pattern").length}</small></button>
          <button role="tab" aria-selected={kind === "proposal"} onClick={() => setKind("proposal")}>涂装方案 <small>{assets.filter(a => a.kind === "proposal").length}</small></button>
        </div>
        <AssetProjectFilter value={project} projects={projects} onChange={setProject} />
        {kind !== "graph" && <input type="search" aria-label="搜索资产" placeholder="搜索名称、主题或意象" value={query} onChange={e => setQuery(e.target.value)} />}
      </div>
      {kind === "graph" ? <AssetKnowledgeGraph key={assets.map(a => a.id).join(",")} projectId={project} onOpenAsset={setSelectedId} /> : loading ? (
        <p role="status" className="asset-empty">正在加载资产…</p>
      ) : error ? (
        <div role="alert" className="asset-empty">{error}<button onClick={() => setRetry(n => n + 1)}>重新加载</button></div>
      ) : visible.length ? (
        <div className="asset-grid">{visible.map(asset => (
          <article key={asset.id} className="asset-card">
            <button className="asset-card__open" onClick={() => setSelectedId(asset.id)} aria-label={`查看 ${asset.name}`}>
              <div className="asset-card__image"><img loading="lazy" src={resolveBackendImageUrl(asset.imageUrl)} alt={asset.name} /></div>
              <div className="asset-card__body">
                <small>{asset.projectName}</small><h2>{asset.name}</h2>
                {asset.theme && <p>{asset.theme}</p>}
                <footer><span>{asset.kind === "pattern" ? "收藏纹样" : "涂装方案"}</span><time>{new Date(asset.createdAt).toLocaleDateString("zh-CN")}</time></footer>
              </div>
            </button>
            <div className="asset-card__actions"><span>查看详情与来源</span><button className="asset-card__delete" aria-label={`删除 ${asset.name}`} onClick={() => requestDelete(asset)}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" /></svg>删除
            </button></div>
          </article>
        ))}</div>
      ) : (
        <div className="asset-empty"><span className="asset-empty__icon">◇</span><h2>{query || project ? "没有匹配的资产" : kind === "pattern" ? "暂无收藏纹样" : "暂无涂装方案"}</h2><p>{query || project ? "试试其他关键词或项目。" : kind === "pattern" ? "在转化画布中点击星标，收藏纹样或截图。" : "在效果生成中点击「保存方案」。"}</p></div>
      )}
      {selectedId && !deleteTarget && <AssetDialog title={detail?.name ?? "资产详情"} onClose={close}>
        {detailError && <div role="alert" className="asset-error">{detailError}{!detail && <button onClick={() => setDetailRetry(n => n + 1)}>重新加载详情</button>}</div>}
        {!detail && !detailError && <p role="status" className="asset-detail">正在加载详情…</p>}
        {detail && <><AssetDetail asset={detail} onOpenAsset={setSelectedId} /><footer className="asset-dialog__actions">
          <button className="asset-danger" disabled={reusing} onClick={() => requestDelete(detail)}>删除</button>
          <button disabled={reusing} onClick={close}>关闭</button>
          {detail.kind === "pattern" && onReusePattern && <button className="asset-primary" disabled={reusing} onClick={() => void reuse()}>{reusing ? "正在打开画布…" : "继续调整"}</button>}
        </footer></>}
      </AssetDialog>}
      {deleteTarget && <AssetDialog title="删除资产" onClose={() => { if (!removing) setDeleteTarget(null); }}>
        <div className="asset-delete-confirm"><p>确认删除「{deleteTarget.name}」？</p><span>原始画布和效果图会保留。</span></div>
        {deleteError && <p role="alert" className="asset-error">{deleteError}</p>}
        <footer className="asset-dialog__actions"><button disabled={removing} onClick={() => setDeleteTarget(null)}>保留</button><button className="asset-danger" disabled={removing} onClick={() => void remove()}>{removing ? "正在删除…" : "确认删除"}</button></footer>
      </AssetDialog>}
    </section>
  );
}
function AssetDetail({ asset, onOpenAsset }: { asset: Asset; onOpenAsset: (id:string) => void }) {
  const pkg = asset.payload?.packageSnapshot;
  const references = pkg?.selectedReferenceImageUrls ?? [];
  return (
    <div className="asset-detail">
      <div className="asset-detail__hero">
        <img src={resolveBackendImageUrl(asset.imageUrl)} alt={asset.name} />
      </div>
      <dl className="asset-detail__facts">
        <div>
          <dt>所属项目</dt>
          <dd>{asset.projectName}</dd>
        </div>
        <div>
          <dt>保存时间</dt>
          <dd>{new Date(asset.createdAt).toLocaleString("zh-CN")}</dd>
        </div>
      </dl>
      {asset.kind === "pattern" ? (
        <PatternOrigins provenance={asset.payload?.provenance} legacyPrompt={asset.payload?.prompt} />
      ) : (
        <>
          {asset.payload?.review?.status === 'accepted' && <section><h3>验收记录</h3>
            <p>已完成人工视觉验收 · {asset.payload.review.acceptedAt ? new Date(asset.payload.review.acceptedAt).toLocaleString() : '时间未记录'}</p>
            <ul>{REVIEW_CHECKS.filter(([key])=>asset.payload?.review?.checks.includes(key)).map(([key,label])=><li key={key}>{label}</li>)}</ul>
            {asset.payload.editProtection && <p>局部编辑 · 选区外像素已保护；区域 {asset.payload.editProtection.pixels.left}, {asset.payload.editProtection.pixels.top}，{asset.payload.editProtection.pixels.width} × {asset.payload.editProtection.pixels.height} 像素。</p>}
          </section>}
          <section><h3>版本来源</h3>
            {asset.lineage?.parent ? <button onClick={() => onOpenAsset(asset.lineage!.parent!.id)}>打开父方案：{asset.lineage.parent.name}</button> : <p>{asset.lineage?.parentStatus === 'not-saved' ? '父方案尚未保存或已删除' : asset.payload?.sourceProposalId && !asset.payload?.parentProposalId && asset.payload?.version === 1 ? '首次生成方案' : '历史来源未记录'}</p>}
            {asset.payload?.userInstruction && <p>修改指令：{asset.payload.userInstruction}</p>}
            {!!asset.lineage?.children.length && <div><h4>派生版本</h4>{asset.lineage.children.map(child => <button key={child.id} onClick={() => onOpenAsset(child.id)}>{child.name}</button>)}</div>}
          </section>
          <section>
            <h3>设计主题</h3>
            <p>{asset.theme || "未填写"}</p>
            <h3>设计意象</h3>
            <p>{asset.imagery || "未填写"}</p>
          </section>
          <section>
            <h3>布局方案</h3>
            <p>{pkg?.layoutScheme?.name || "未采用布局方案"}</p>
            {pkg?.layoutScheme?.layout3d && (
              <>
                <p>{describeLayout3D(pkg.layoutScheme.layout3d.config)}</p>
                <div className="asset-detail__references">
                  {pkg.layoutScheme.layout3d.views.map((view) => (
                    <figure key={view.view}>
                      <img
                        src={resolveBackendImageUrl(view.imageUrl)}
                        alt={`布局${view.view}`}
                      />
                      <figcaption>
                        {
                          {
                            side: "侧视",
                            front: "正视",
                            perspective: "斜前视",
                          }[view.view]
                        }
                      </figcaption>
                    </figure>
                  ))}
                </div>
              </>
            )}
            {!pkg?.layoutScheme?.layout3d && pkg?.layoutScheme && (
              <p>
                {Object.entries(pkg.layoutScheme.componentsMap)
                  .map(([part, value]) => `${part}：${value}`)
                  .join("；")}
              </p>
            )}
          </section>
          <section>
            <h3>采用的纹样参考图 · {references.length}</h3>
            {references.length ? (
              <div className="asset-detail__references">
                {references.map((url, i) => (
                  <figure key={url}>
                    <img
                      src={resolveBackendImageUrl(url)}
                      alt={`纹样参考 ${i + 1}`}
                    />
                    <figcaption>
                      {pkg?.canvasAssets?.find((a) => a.imageUrl === url)
                        ?.name || `参考 ${i + 1}`}
                    </figcaption>
                    <PatternOrigins compact provenance={pkg?.canvasAssets?.find(a => a.imageUrl === url)?.provenance} />
                  </figure>
                ))}
              </div>
            ) : (
              <p>未采用纹样参考图</p>
            )}
          </section>
          <section>
            <h3>配色方案</h3>
            <p>{pkg?.colorScheme?.name || "未采用配色方案"}</p>
            <div className="asset-swatches">
              {(
                pkg?.colorScheme?.palette ??
                pkg?.colorScheme?.regions?.map((r) => r.color) ??
                []
              ).map((color, i) => (
                <span key={`${color}-${i}`}>
                  <i style={{ backgroundColor: color }} />
                  {color}
                </span>
              ))}
            </div>
            {!!pkg?.colorScheme?.colorRoles?.length && <ul>{pkg.colorScheme.colorRoles.map((role,i) => <li key={i}>{role.role} {role.hex} · {role.proportion}%</li>)}</ul>}
            {pkg?.colorScheme?.rationale && <p>{pkg.colorScheme.rationale}</p>}
          </section>
          {!!pkg?.selectedCases?.length && (
            <section>
              <h3>涂装案例</h3>
              <div className="asset-detail__references">
                {pkg.selectedCases.map((c) => (
                  <figure key={c.id}>
                    <img src={resolveBackendImageUrl(c.image)} alt={c.title} />
                    <figcaption>{c.title}</figcaption>
                    <p>{c.userDescription || c.description}</p>
                  </figure>
                ))}
              </div>
            </section>
          )}
          <section>
            <h3>设计说明</h3>
            <p>{asset.payload?.designRationale || "未记录"}</p>
            <details><summary>生成提示词</summary>
            <p className="asset-detail__prompt">{asset.payload?.promptUsed || "未记录"}</p></details>
          </section>
        </>
      )}
    </div>
  );
}

function PatternOrigins({ provenance, legacyPrompt, compact = false }: { provenance?: PatternProvenance; legacyPrompt?: string; compact?: boolean }) {
  const sources = provenance?.sourcePatterns ?? [];
  const references = provenance?.references ?? [];
  return <div className={compact ? "asset-origins asset-origins--compact" : "asset-origins"}>
    <section><h3>来源纹样</h3>{sources.length ? <div className="asset-detail__references">{sources.map(source => <figure key={source.id}>
      {source.imageUrl && <img src={resolveBackendImageUrl(source.imageUrl)} alt={source.name} />}
      <figcaption>{source.name}{source.dynasty && <small> · {source.dynasty}</small>}</figcaption>
    </figure>)}</div> : <p>未记录来源纹样</p>}</section>
    <section><h3>参考原图</h3>{references.length ? <div className="asset-detail__references">{references.map((reference, index) => <figure key={`${reference.imageUrl}-${index}`}>
      <img src={resolveBackendImageUrl(reference.imageUrl)} alt={reference.name || `参考原图 ${index + 1}`} />
      <figcaption>{reference.name || `参考原图 ${index + 1}`}</figcaption>
    </figure>)}</div> : <p>未记录参考原图</p>}</section>
    <section><h3>生成提示词</h3><p className="asset-detail__prompt">{provenance?.originalPrompt || legacyPrompt || "未记录提示词"}</p>
      {provenance?.optimizedPrompt && provenance.optimizedPrompt !== provenance.originalPrompt && <details><summary>优化后的提示词</summary><p className="asset-detail__prompt">{provenance.optimizedPrompt}</p></details>}
      {provenance?.notes && <p>{provenance.notes}</p>}
    </section>
  </div>;
}
