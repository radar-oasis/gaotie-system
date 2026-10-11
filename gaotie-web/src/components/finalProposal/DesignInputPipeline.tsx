import { resolveBackendImageUrl } from '../superCanvas/imageUrls';
import { describeLayout3D } from '../layout3d/layout3d';
import type {
  FinalDesignPackage,
  PackageCompleteness,
} from './finalProposalTypes';

interface DesignInputPipelineProps {
  designPackage: FinalDesignPackage;
  completeness: PackageCompleteness;
  selectedReferenceImageUrls: string[];
  selectedReferenceAssetIds?: string[] | null;
  onToggleReference: (imageUrl: string, assetId?: string) => void;
  onNavigate?: (
    tab: 'demand' | 'image' | 'layout' | 'color' | 'canvas' | 'case',
  ) => void;
}

const sectionClassName = 'final-proposal-section';

export default function DesignInputPipeline({
  designPackage,
  completeness,
  selectedReferenceImageUrls,
  selectedReferenceAssetIds,
  onToggleReference,
  onNavigate,
}: DesignInputPipelineProps) {
  const referenceItems = [
    ...((designPackage.canvasAssets ?? [])
      .map((asset) => ({
        id: `canvas-${asset.id}`,
        assetId: asset.id,
        title: asset.name,
        imageUrl: asset.imageUrl,
        source: asset.source === 'capture' ? '画布截取' : '已转化纹样',
      }))),
  ];

  return (
    <aside className="design-input-pipeline">
      <div className="panel-heading">
        <div>
          <h2>设计参考</h2>
        </div>
      </div>

      {completeness.missingLabels.length > 0 && (
        <details className="completeness-warning"><summary>参考资料可选</summary>尚未提供：{completeness.missingLabels.join('、')}</details>
      )}

      <details className={sectionClassName}><summary>文化意象</summary><div className="tag-cloud">{designPackage.demandTags.length?designPackage.demandTags.map((tag,index)=><span key={`${tag.label}-${index}`}>{tag.label}</span>):<p className="empty-copy">暂无文化意象</p>}</div></details>
      <details className={sectionClassName} open><summary>车身布局</summary>
        <div className="section-title-row">
          <button onClick={() => onNavigate?.('layout')}>前往修改</button>
        </div>
        {designPackage.layoutScheme ? (
          <div className="compact-summary">
            <strong>{designPackage.layoutScheme.name}</strong>
            <details className="layout-reference-info"><summary>布局说明</summary>
            <p>
              {designPackage.layoutScheme.layout3d ? describeLayout3D(designPackage.layoutScheme.layout3d.config) : Object.entries(designPackage.layoutScheme.componentsMap)
                .map(([key, value]) => `${key}:${value}`)
                .join(' · ')}
            </p>
            {designPackage.layoutScheme.layout3d && <>
              <p>通用两节模型 · 灰阶仅表示区域 · 将附带三张布局参考图</p>
              {!designPackage.colorScheme && <p>尚未选择配色：默认保留黑白灰；如需颜色，请先选色板或在生成需求中明确说明。</p>}
            </>}
            </details>
            {designPackage.layoutScheme.layout3d && <>
              <div style={{ display: 'flex', gap: 5 }}>{designPackage.layoutScheme.layout3d.views.map(view =>
                <img key={view.view} src={resolveBackendImageUrl(view.imageUrl)} alt={`布局${view.view === 'side' ? '侧视' : view.view === 'front' ? '正视' : '斜前视'}`} style={{ width: '31%', height: 70, objectFit: 'contain', background: '#f3f5f7' }} />)}</div>
            </>}
          </div>
        ) : (
          <p className="empty-copy">暂无车身布局方案</p>
        )}
      </details>

      <details className={sectionClassName}><summary>涂装案例 · {designPackage.selectedCases.length}</summary>
        <div className="section-title-row">
          <button onClick={() => onNavigate?.('case')}>前往修改</button>
        </div>
        {designPackage.selectedCases.length ? (
          <div className="case-reference-list">
            {designPackage.selectedCases.map((caseRef) => (
              <article key={caseRef.id} className="case-reference-item">
                <img
                  src={resolveBackendImageUrl(caseRef.image)}
                  alt={caseRef.title}
                />
                <div>
                  <strong>{caseRef.title}</strong>
                  <p>
                    {caseRef.userDescription ||
                      caseRef.description ||
                      '已加入最终生图需求'}
                  </p>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="empty-copy">暂无涂装案例</p>
        )}
      </details>

      <details className={sectionClassName} open><summary>色彩方案</summary>
        <div className="section-title-row">
          <button onClick={() => onNavigate?.('color')}>前往修改</button>
        </div>
        {designPackage.colorScheme ? (
          <div className="compact-summary">
            <strong>{designPackage.colorScheme.name}</strong>
            <div className="palette-strip">
              {(designPackage.colorScheme.palette?.length
                ? designPackage.colorScheme.palette
                : designPackage.colorScheme.regions.map((region) => region.color)
              ).map((color) => (
                <span key={color} style={{ backgroundColor: color }} />
              ))}
            </div>
          </div>
        ) : (
          <p className="empty-copy">未使用色板（可选），可直接描述颜色需求</p>
        )}
      </details>

      <details className={sectionClassName} open><summary>纹样参考</summary>
        <div className="section-title-row">
          <button onClick={() => onNavigate?.('canvas')}>前往修改</button>
        </div>
        <details className="reference-help"><summary>参考图说明</summary><p className="empty-copy">所选画布截图或已转化纹样将与布局图、案例图及参考说明、配色一起发送。图层如有裁切、翻转或组合，请先截取画布以保留编辑效果。设计包最多 12 张，缺图或超限时会提示，不会自动省略。</p></details>
        <div className="reference-grid">
          {referenceItems.length ? (
            referenceItems.map((item) => {
              const selected = selectedReferenceAssetIds ? selectedReferenceAssetIds.includes(item.assetId) : selectedReferenceImageUrls.includes(item.imageUrl);

              return (
                <button
                  key={item.id}
                  className={`reference-thumb ${selected ? 'is-selected' : ''}`}
                  aria-pressed={selected}
                  onClick={() => onToggleReference(item.imageUrl, item.assetId)}
                  title={`${item.source}：${item.title}`}
                >
                  <img src={resolveBackendImageUrl(item.imageUrl)} alt={item.title} />
                  <span>{item.source}</span>
                </button>
              );
            })
          ) : (
            <p className="empty-copy">暂无可用提示图</p>
          )}
        </div>
      </details>
    </aside>
  );
}
