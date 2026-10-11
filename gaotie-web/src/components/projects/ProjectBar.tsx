import { useAuth } from '../../auth/AuthContext';
import { useProject } from '../../projects/ProjectContext';
import { useEffect, useId, useRef, useState } from 'react';
import { AddIcon, CheckIcon, ChevronDownIcon, DeleteIcon, SaveIcon } from 'tdesign-icons-react';
import './ProjectBar.css';

interface ProjectBarProps {
  isSaving: boolean;
  onSave: () => void;
}

export default function ProjectBar({ isSaving, onSave }: ProjectBarProps) {
  const { user, logout } = useAuth();
  const {
    projects,
    currentProject,
    isLoading,
    error,
    lastSavedAt,
    selectProject,
    createProject,
    renameProject,
    deleteProject,
  } = useProject();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(false);
  const savingRef = useRef(false);
  const picker = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const menuId = useId();
  const errorId = useId();

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (!picker.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [open]);
  useEffect(() => {
    if (editing) { input.current?.focus(); input.current?.select(); }
  }, [editing]);

  const closeMenu = () => { setOpen(false); trigger.current?.focus(); };
  const beginRename = () => {
    if (!currentProject || busy || isLoading) return;
    setOpen(false); setName(currentProject.name); setActionError(''); setEditing(true);
  };
  const endRename = () => {
    setEditing(false); setActionError('');
    requestAnimationFrame(() => trigger.current?.focus());
  };
  const handleRenameProject = async () => {
    if (!currentProject || savingRef.current) return;
    const nextName = name.trim();
    if (!nextName) { setActionError('请输入项目名称'); return; }
    if (nextName === currentProject.name) { endRename(); return; }
    savingRef.current = true; setBusy(true); setActionError('');
    try {
      await renameProject(currentProject.id, nextName);
      endRename();
    } catch (renameError) {
      setActionError(renameError instanceof Error ? renameError.message : '重命名失败，请重试');
    } finally { savingRef.current = false; setBusy(false); }
  };

  const handleDeleteProject = async () => {
    if (!currentProject) {
      return;
    }

    const confirmed = window.confirm(
      `确定删除“${currentProject.name}”吗？删除后不可在当前界面恢复。`,
    );

    if (!confirmed) {
      return;
    }

    try {
      await deleteProject(currentProject.id);
    } catch (deleteError) {
      alert(deleteError instanceof Error ? deleteError.message : '删除失败');
    }
  };

  return (
    <div className="project-bar project-bar--polished">
      <div className="project-bar__group">
        <strong>项目</strong>
        <div className="project-picker" ref={picker} onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
        }}>
          {editing ? <div className="project-picker__edit">
            <input ref={input} aria-label="项目名称" aria-invalid={!!actionError} aria-describedby={actionError ? errorId : undefined}
              value={name} disabled={busy} maxLength={100} onChange={event => setName(event.target.value)}
              onKeyDown={event => {
                if (event.nativeEvent.isComposing || event.keyCode === 229) return;
                if (event.key === 'Enter') { event.preventDefault(); void handleRenameProject(); }
                if (event.key === 'Escape' && !busy) { event.preventDefault(); endRename(); }
              }} />
            <button type="button" aria-label="保存项目名称" title="保存名称" disabled={busy} onClick={() => void handleRenameProject()}><CheckIcon /></button>
            <span className="project-picker__hint">{busy ? '保存中…' : 'Enter 保存 · Esc 取消'}</span>
          </div> : <button ref={trigger} type="button" className="project-picker__trigger" aria-label="选择项目"
            title="双击项目名称重命名，也可按 F2" aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined}
            disabled={isLoading || busy || !projects.length} onClick={() => setOpen(value => !value)} onDoubleClick={beginRename}
            onKeyDown={event => {
              if (event.key === 'F2') { event.preventDefault(); beginRename(); }
              if (event.key === 'Escape') closeMenu();
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault(); setOpen(true);
                requestAnimationFrame(() => {
                  const items = picker.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]');
                  items?.[event.key === 'ArrowUp' ? items.length - 1 : 0]?.focus();
                });
              }
            }}><span>{isLoading ? '加载项目…' : currentProject?.name || '选择项目'}</span><ChevronDownIcon /></button>}
          {open && <div className="project-picker__menu" id={menuId} role="menu" aria-label="项目列表" onKeyDown={event => {
            const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')];
            const index = items.indexOf(document.activeElement as HTMLButtonElement);
            if (event.key === 'Escape') { event.preventDefault(); closeMenu(); }
            if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
              event.preventDefault();
              const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
              items[next]?.focus();
            }
          }}>
            <div className="project-picker__menu-label">切换项目</div>
            {projects.map(project => <button key={project.id} type="button" role="menuitemradio" aria-checked={project.id === currentProject?.id}
              className="project-picker__option" onClick={() => { selectProject(project.id); closeMenu(); }}>
              <span>{project.name}</span>{project.id === currentProject?.id && <CheckIcon />}
            </button>)}
          </div>}
        </div>
        <button type="button" disabled={busy || editing || isLoading} onClick={async () => {
          setBusy(true); setActionError('');
          try { await createProject(); } catch (err) { setActionError(err instanceof Error ? err.message : '新建失败'); }
          finally { setBusy(false); }
        }}><AddIcon />新建项目</button>
        <button
          type="button"
          title="删除项目"
          aria-label="删除项目"
          onClick={() => void handleDeleteProject()}
          disabled={!currentProject || projects.length === 0 || editing || busy}
        >
          <DeleteIcon />
        </button>
        <button
          type="button"
          className="project-bar__primary"
          onClick={onSave}
          disabled={!currentProject || isSaving}
        >
          <SaveIcon />{isSaving ? '保存中...' : '保存记录'}
        </button>
      </div>

      <div className="project-bar__status">
        {(actionError || error) && <span id={errorId} role="alert" className="project-bar__error">{actionError || error}</span>}
        {!actionError && !error && lastSavedAt && (
          <span>已保存 {new Date(lastSavedAt).toLocaleTimeString()}</span>
        )}
        <span>{user?.displayName || user?.username}</span>
        <button type="button" onClick={() => void logout()}>
          退出
        </button>
      </div>
    </div>
  );
}
