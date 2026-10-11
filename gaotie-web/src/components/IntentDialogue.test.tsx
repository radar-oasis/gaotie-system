// @vitest-environment happy-dom
import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ImageSearchProvider, useImageSearch } from '../context/ImageSearchContext';
import { SharedTagsProvider, useSharedTags } from '../context/SharedTagsContext';
import IntentDialogue from './IntentDialogue';

const testGlobal = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};
testGlobal.IS_REACT_ACT_ENVIRONMENT = true;

function SeedDemandTags() {
  const { confirmedTags, setConfirmedTags } = useSharedTags();

  useEffect(() => {
    setConfirmedTags([{ label: '静谧车厢', topic: '体验目标' }]);
    // The context setter is recreated by the provider on each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <span data-testid="tag-count">标签数量：{confirmedTags.length}</span>;
}

function SeedExistingImageSearch() {
  const image = useImageSearch();

  useEffect(() => {
    image.setPatterns([
      {
        id: 'pattern-1',
        name: '龙纹',
        imageUrl: '/images/dragon.png',
        dynasty: '唐代',
        description: '龙纹图案',
      },
    ]);
    image.setAutoSearchKey('体验目标-静谧车厢');
    // The context value is recreated by the provider on each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

const renderDialogue = async (onSearch: (input: string) => void) => {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(
      <SharedTagsProvider>
        <ImageSearchProvider>
          <SeedDemandTags />
          <IntentDialogue onSearch={onSearch} />
        </ImageSearchProvider>
      </SharedTagsProvider>,
    );
  });

  return { container, root };
};

const unmount = async (root: Root, container: HTMLElement) => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
};

describe('IntentDialogue', () => {
  it('retains a manually entered request when leaving and returning to the module', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    const onSearch = vi.fn();
    const render = async (visible: boolean) => {
      await act(async () => root.render(<SharedTagsProvider><ImageSearchProvider>
        {visible && <IntentDialogue onSearch={onSearch} />}
      </ImageSearchProvider></SharedTagsProvider>));
    };
    await render(true);
    const input = host.querySelector('textarea')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(input, '想找祥云');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="发送检索需求"]')!.click());
    await render(false);
    await render(true);
    expect(host.querySelector('textarea')!.value).toBe('想找祥云');
    await unmount(root, host);
  });
  it('keeps retrieval evidence collapsed and does not submit a composing Enter', async () => {
    function SeedEvidence() {
      const { setIntentFilters, setReasoning } = useImageSearch();
      useEffect(() => {
        setIntentFilters({ motifs: ['龙'], dynasties: [], materials: [], others: ['吉祥'] });
        setReasoning('模型内部推理不应直接显示');
      }, [setIntentFilters, setReasoning]);
      return null;
    }
    const onSearch = vi.fn();
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => root.render(<SharedTagsProvider><ImageSearchProvider><SeedEvidence /><IntentDialogue onSearch={onSearch} /></ImageSearchProvider></SharedTagsProvider>));
    const disclosure = container.querySelector('details');
    expect(disclosure).not.toBeNull();
    expect(disclosure!.open).toBe(false);
    expect(disclosure!.querySelector('summary')!.textContent).toContain('检索依据');
    expect(container.textContent).not.toContain('模型内部推理不应直接显示');
    const input = container.querySelector('textarea')!;
    expect(input.placeholder).toBe('描述想找的纹样…');
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(input, '想找吉祥的龙纹');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true })));
    expect(onSearch).not.toHaveBeenCalled();
    await act(async () => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    expect(onSearch).toHaveBeenCalledWith('想找吉祥的龙纹', undefined);
    await unmount(root, container);
  });
  it('retries a previously interrupted automatic search when no completed groups or error exist', async () => {
    vi.useFakeTimers();
    function InterruptedSearch() {
      const { setAutoSearchKey } = useImageSearch();
      useEffect(() => { setAutoSearchKey('体验目标-静谧车厢'); }, [setAutoSearchKey]);
      return null;
    }
    const onSearch = vi.fn();
    const container = document.createElement('div');
    const root = createRoot(container);
    await act(async () => root.render(<SharedTagsProvider><ImageSearchProvider>
      <SeedDemandTags /><InterruptedSearch /><IntentDialogue onSearch={onSearch} />
    </ImageSearchProvider></SharedTagsProvider>));
    await act(async () => { vi.advanceTimersByTime(350); });
    expect(onSearch).toHaveBeenCalledTimes(1);
    await unmount(root, container);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('uses confirmed demand tags for image search without clearing them', async () => {
    vi.useFakeTimers();
    const onSearch = vi.fn();
    const { container, root } = await renderDialogue(onSearch);

    await act(async () => {
      vi.advanceTimersByTime(350);
    });

    expect(onSearch).toHaveBeenCalledWith('体验目标-静谧车厢', expect.arrayContaining([expect.objectContaining({ label: '静谧车厢' })]));
    expect(container.textContent).toContain('标签数量：1');

    await unmount(root, container);
  });

  it('does not auto-search again when returning to the page with cached results', async () => {
    vi.useFakeTimers();
    const onSearch = vi.fn();
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);

    const render = async (showDialogue: boolean) => {
      await act(async () => {
        root.render(
          <SharedTagsProvider>
            <ImageSearchProvider>
              <SeedDemandTags />
              <SeedExistingImageSearch />
              {showDialogue && <IntentDialogue onSearch={onSearch} />}
            </ImageSearchProvider>
          </SharedTagsProvider>,
        );
      });
    };

    await render(true);
    await act(async () => {
      vi.advanceTimersByTime(350);
    });
    await render(false);
    await render(true);
    await act(async () => {
      vi.advanceTimersByTime(350);
    });

    expect(onSearch).not.toHaveBeenCalled();

    await unmount(root, container);
  });
});
