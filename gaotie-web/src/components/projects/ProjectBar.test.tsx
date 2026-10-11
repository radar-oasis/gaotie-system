// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProjectBar from './ProjectBar';

const testGlobal = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};
testGlobal.IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  renameProject: vi.fn(),
  deleteProject: vi.fn(),
  createProject: vi.fn(),
  selectProject: vi.fn(),
  logout: vi.fn(),
}));

vi.mock('../../auth/AuthContext', () => ({
  useAuth: () => ({
    user: { username: 'designer', displayName: 'Designer' },
    logout: mocks.logout,
  }),
}));

vi.mock('../../projects/ProjectContext', () => ({
  useProject: () => ({
    projects: [
      {
        id: 'project-1',
        name: '旧项目名',
      },
      { id: 'project-2', name: '第二个项目' },
    ],
    currentProject: {
      id: 'project-1',
      name: '旧项目名',
    },
    isLoading: false,
    error: '',
    lastSavedAt: null,
    selectProject: mocks.selectProject,
    createProject: mocks.createProject,
    renameProject: mocks.renameProject,
    deleteProject: mocks.deleteProject,
  }),
}));

const renderProjectBar = async () => {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(<ProjectBar isSaving={false} onSave={vi.fn()} />);
  });

  return { container, root };
};

const unmount = async (root: Root, container: HTMLElement) => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
};

describe('ProjectBar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renames the current project from the project bar', async () => {
    const { container, root } = await renderProjectBar();
    expect(container.querySelector('button[aria-label="重命名项目"]')).toBeNull();
    await act(async () => {
      container.querySelector('[aria-label="选择项目"]')?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    });
    const input = container.querySelector('input[aria-label="项目名称"]') as HTMLInputElement;
    expect(input).not.toBeNull();
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '新项目名');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });

    expect(mocks.renameProject).toHaveBeenCalledWith('project-1', '新项目名');

    await unmount(root, container);
  });

  it('opens a styled menu and selects a project', async () => {
    const { container, root } = await renderProjectBar();
    expect(container.querySelector('select')).toBeNull();
    await act(async () => (container.querySelector('[aria-label="选择项目"]') as HTMLButtonElement).click());
    const options = container.querySelectorAll('[role="menuitemradio"]');
    expect(options).toHaveLength(2);
    expect(options[0].getAttribute('aria-checked')).toBe('true');
    await act(async () => (options[1] as HTMLButtonElement).click());
    expect(mocks.selectProject).toHaveBeenCalledWith('project-2');
    expect(container.querySelector('[role="menu"]')).toBeNull();
    await unmount(root, container);
  });

  it('supports F2 editing and Escape without saving', async () => {
    const { container, root } = await renderProjectBar();
    await act(async () => container.querySelector('[aria-label="选择项目"]')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'F2', bubbles: true })));
    const input = container.querySelector('input');
    expect(input).not.toBeNull();
    await act(async () => input?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(container.querySelector('input')).toBeNull();
    expect(mocks.renameProject).not.toHaveBeenCalled();
    await unmount(root, container);
  });

  it('retains the name and shows an error when rename fails', async () => {
    mocks.renameProject.mockRejectedValueOnce(new Error('网络异常，请重试'));
    const { container, root } = await renderProjectBar();
    await act(async () => container.querySelector('[aria-label="选择项目"]')?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
    const input = container.querySelector('input') as HTMLInputElement;
    expect(input).not.toBeNull();
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '修改后名称');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('网络异常');
    expect(input.value).toBe('修改后名称');
    await unmount(root, container);
  });

  it('deletes the current project after confirmation', async () => {
    Object.defineProperty(window, 'confirm', {
      configurable: true,
      value: vi.fn(() => true),
    });
    const { container, root } = await renderProjectBar();
    const deleteButton = container.querySelector(
      'button[aria-label="删除项目"]',
    ) as HTMLButtonElement | null;

    expect(deleteButton).not.toBeNull();

    await act(async () => {
      deleteButton?.click();
    });

    expect(window.confirm).toHaveBeenCalledWith(
      '确定删除“旧项目名”吗？删除后不可在当前界面恢复。',
    );
    expect(mocks.deleteProject).toHaveBeenCalledWith('project-1');

    await unmount(root, container);
  });

  it('rejects blank names and ignores Enter during Chinese composition', async () => {
    const { container, root } = await renderProjectBar();
    await act(async () => container.querySelector('[aria-label="选择项目"]')?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
    const input = container.querySelector('input') as HTMLInputElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '新名称');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true })));
    expect(mocks.renameProject).not.toHaveBeenCalled();
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '   ');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    expect(container.querySelector('[role="alert"]')?.textContent).toBe('请输入项目名称');
    expect(mocks.renameProject).not.toHaveBeenCalled();
    await unmount(root, container);
  });

  it('navigates menu options with arrows and closes with Escape', async () => {
    const { container, root } = await renderProjectBar();
    const trigger = container.querySelector('[aria-label="选择项目"]') as HTMLButtonElement;
    await act(async () => trigger.click());
    const options = container.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]');
    options[0].focus();
    await act(async () => options[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })));
    expect(document.activeElement).toBe(options[1]);
    await act(async () => options[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(container.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(mocks.selectProject).not.toHaveBeenCalled();
    await unmount(root, container);
  });
});
