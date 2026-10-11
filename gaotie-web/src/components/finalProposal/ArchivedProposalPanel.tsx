import { resolveBackendImageUrl } from "../superCanvas/imageUrls";
import type { GeneratedProposal } from "./finalProposalTypes";

interface ArchivedProposalPanelProps {
  proposals: GeneratedProposal[];
  scope: "project" | "all";
  onScopeChange: (scope: "project" | "all") => void;
  currentProposal: GeneratedProposal | null;
  onDelete: (id: string) => void;
}

export default function ArchivedProposalPanel({
  proposals,
  scope,
  onScopeChange,
  currentProposal,
  onDelete,
}: ArchivedProposalPanelProps) {
  return (
    <aside className="archived-proposal-panel">
      <div className="panel-heading">
        <div>
          <h2>已保存方案 <small>{proposals.length}</small></h2>
          <select aria-label="归档范围" value={scope} onChange={event => onScopeChange(event.target.value as 'project' | 'all')}>
            <option value="project">当前项目</option><option value="all">全部项目</option>
          </select>
        </div>
      </div>

      <div className="archive-list">
        {proposals.length ? (
          proposals.map((proposal) => {
            const active = currentProposal?.id === proposal.id;

            return (
              <article
                key={proposal.id}
                className={`archive-card ${active ? "is-active" : ""}`}
              >
                <img
                  src={resolveBackendImageUrl(proposal.imageUrl)}
                  alt={proposal.name ?? `方案 V${proposal.version}`}
                />
                <div>
                  <strong>
                    {proposal.name ?? `方案 V${proposal.version}`}
                  </strong>
                  {scope === "all" && <small>项目：{proposal.projectName || proposal.projectId || "未标注项目"}</small>}
                  {proposal.designRationale&&<details><summary>设计说明</summary><p>{proposal.designRationale}</p></details>}
                  <time>{new Date(proposal.createdAt).toLocaleString()}</time>
                </div>
                <div className="archive-actions">
                  <button aria-label={`删除 ${proposal.name ?? `方案 V${proposal.version}`}`} onClick={() => onDelete(proposal.id)}>删除</button>
                </div>
              </article>
            );
          })
        ) : (
          <div className="archive-empty">暂无方案归档</div>
        )}
      </div>
    </aside>
  );
}
