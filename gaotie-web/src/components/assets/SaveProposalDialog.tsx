import { useRef, useState } from "react";
import type { GeneratedProposal } from "../finalProposal/finalProposalTypes";
import AssetDialog from "./AssetDialog";
export interface ProposalMetadata {
  name: string;
  theme: string;
  imagery: string;
}
export default function SaveProposalDialog({
  proposal,
  projectName,
  onSave,
  onClose,
}: {
  proposal: GeneratedProposal;
  projectName: string;
  onSave: (metadata: ProposalMetadata) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(
    proposal.name || `方案 V${proposal.version}`,
  );
  const [theme, setTheme] = useState(proposal.theme || "");
  const [imagery, setImagery] = useState(
    proposal.imagery ??
      proposal.packageSnapshot?.demandTags.map((t) => t.label).join("、") ??
      "",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  return (
    <AssetDialog
      title="保存涂装方案"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (lock.current) return;
          lock.current = true;
          setBusy(true);
          setError("");
          try {
            await onSave({
              name: name.trim(),
              theme: theme.trim(),
              imagery: imagery.trim(),
            });
            onClose();
          } catch (e) {
            setError(e instanceof Error ? e.message : "保存失败，请重试");
          } finally {
            lock.current = false;
            setBusy(false);
          }
        }}
      >
        <div className="asset-save-form">
          <label>
            项目名称
            <input value={projectName} readOnly />
          </label>
          <label>
            方案名称
            <input
              required
              maxLength={160}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label>
            设计主题
            <input
              required
              maxLength={1000}
              placeholder="例如：山海相逢 · 东方流动美学"
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
            />
          </label>
          <label>
            设计意象
            <textarea
              maxLength={4000}
              placeholder="记录本方案的文化意象与设计表达"
              value={imagery}
              onChange={(e) => setImagery(e.target.value)}
            />
          </label>
          <p>
            一并保存本次生成时的布局方案、配色、案例与实际采用的{" "}
            {proposal.packageSnapshot?.selectedReferenceImageUrls?.length ?? 0}{" "}
            张纹样参考图。保存后可在「资产沉淀」查看。
          </p>
          {error && (
            <p role="alert" className="asset-error">
              {error}
            </p>
          )}
        </div>
        <footer className="asset-dialog__actions">
          <button type="button" disabled={busy} onClick={onClose}>
            取消
          </button>
          <button className="asset-primary" disabled={busy} type="submit">
            {busy ? "正在保存…" : "保存到资产沉淀"}
          </button>
        </footer>
      </form>
    </AssetDialog>
  );
}
