import { resolveBackendImageUrl } from "../superCanvas/imageUrls";
import type { GeneratedProposal } from "./finalProposalTypes";

interface GenerationPreviewProps {
  currentProposal: GeneratedProposal | null;
  isGenerating: boolean;
  errorMessage: string;
  onArchive: () => void;
  onClearCurrentProposal: () => void;
}

export default function GenerationPreview({
  currentProposal,
  isGenerating,
  errorMessage,
  onArchive,
  onClearCurrentProposal,
}: GenerationPreviewProps) {
  return (
    <div className="generation-preview">
      <div className="generation-preview-header">
        <div>
          <h1>效果生成</h1>
        </div>
        <div className="preview-actions">
          {currentProposal && (
            <span className="version-chip">V{currentProposal.version}</span>
          )}
          <button
            className="secondary-action"
            disabled={isGenerating || !currentProposal}
            onClick={onClearCurrentProposal}
          >
            清除当前效果
          </button>
          <button
            className="secondary-action"
            disabled={isGenerating || !currentProposal || currentProposal.review?.status === "pending"}
            onClick={onArchive}
          >
            保存方案
          </button>
        </div>
      </div>

      <div className="train-preview-frame" aria-busy={isGenerating}>
        {isGenerating ? (
          <div className="preview-loading" role="status">
            <span />
            <p>正在生成最终效果...</p>
          </div>
        ) : currentProposal ? (
          <img
            src={resolveBackendImageUrl(currentProposal.imageUrl)}
            alt="最终高铁涂装方案"
          />
        ) : (
          <div className="preview-empty">
            {import.meta.env.DEV ? <>
              <img src="/demo-train-effect.png" alt="临时模拟效果：用户提供的列车涂装图片" style={{ margin: '0 auto' }} />
            </> : <>
              <strong>等待生成最终效果</strong>
              <p>左侧设计输入会被整理为提示词和提示图。</p>
            </>}
          </div>
        )}
      </div>

      {errorMessage && <div className="proposal-error">{errorMessage}</div>}
      {!isGenerating && currentProposal?.referenceManifest && (
        <details className="compact-summary">
          <summary>本次已发送 {currentProposal.referenceManifest.length} 张参考图</summary>
          {currentProposal.referenceManifest.map(ref => (
            <p key={ref.index}>参考图 {ref.index} · {ref.label}：{ref.instruction}</p>
          ))}
        </details>
      )}
    </div>
  );
}
