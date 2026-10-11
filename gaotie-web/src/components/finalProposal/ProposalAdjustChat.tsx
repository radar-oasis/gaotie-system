import { ArrowUpIcon } from "tdesign-icons-react";
import { useState } from "react";
import type {
  AdjustmentHistoryItem,
  PackageCompleteness,
} from "./finalProposalTypes";

interface ProposalAdjustChatProps {
  generationMode: "generate" | "regenerate" | "iterate";
  isGenerating: boolean;
  editMode?: 'global'|'local';
  submitBlocked?: boolean;
  completeness: PackageCompleteness;
  adjustmentHistory: AdjustmentHistoryItem[];
  onGenerate: (prompt: string) => void;
  onIterate: (instruction: string) => void;
}

export default function ProposalAdjustChat({
  generationMode,
  editMode = "global",
  submitBlocked = false,
  isGenerating,
  completeness,
  adjustmentHistory,
  onGenerate,
  onIterate,
}: ProposalAdjustChatProps) {
  const [input, setInput] = useState("");
  const isIterating = generationMode === "iterate";
  const primaryLabel =
    generationMode === "iterate"
      ? (editMode === "local" ? "编辑选中区域" : "微调当前方案")
      : generationMode === "regenerate"
        ? "基于新输入重新生成"
        : "生成最终效果";

  const submit = () => {
    if (isGenerating || submitBlocked) return;
    const value = input.trim();

    if (isIterating) {
      if (!value) {
        return;
      }
      onIterate(value);
    } else {
      onGenerate(value);
    }

    setInput("");
  };

  return (
    <div className="proposal-chat">
      {completeness.missingLabels.length > 0 && (
        <details className="proposal-hint"><summary>参考资料可选</summary>
          尚未提供 {completeness.missingLabels.join("、")}
          。参考资料均可选，仍可直接描述需求生成。
        </details>
      )}
      {generationMode === "regenerate" && (
        <div className="proposal-hint">
          左侧设计输入已更新，本次将重新生成，不会基于当前效果图微调。
        </div>
      )}

      {submitBlocked && <p role="status">请先完成结果验收，或选择有效的局部编辑区域。</p>}
      <div className="chat-input-row workspace-composer">
        <textarea
          aria-label="效果生成需求"
          value={input}
          disabled={isGenerating}
          placeholder={
            isIterating
              ? "输入微调指令，例如：车头雪花图案缩小一点，车窗带加深蓝色"
              : "输入额外生成要求，可留空直接生成"
          }
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) {
              event.preventDefault();
              submit();
            }
          }}
        />
        <button
          className="primary-action workspace-send"
          aria-label={primaryLabel}
          title={primaryLabel}
          disabled={isGenerating || submitBlocked || (isIterating && !input.trim())}
          onClick={submit}
        >
          {isGenerating ? <span className="pattern-spinner"/> : <ArrowUpIcon size={22}/>}
          <span className="workspace-control-label">{primaryLabel}</span>
        </button>
      </div>

      <details className="adjustment-history"><summary>修改记录 · {adjustmentHistory.length}</summary>
        {adjustmentHistory.map((item) => (
          <div key={item.id} className="history-item">
            <span>{item.status === "done" ? "已生成" : "失败"}</span>
            <p>{item.instruction}</p>
          </div>
        ))}
      </details>
    </div>
  );
}
