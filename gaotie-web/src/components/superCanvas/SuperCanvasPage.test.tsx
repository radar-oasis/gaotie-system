import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import TopNav from '../TopNav';
import { ImageSearchProvider } from '../../context/ImageSearchContext';
import SuperCanvasPage from './SuperCanvasPage';

describe('SuperCanvasPage navigation', () => {
  it('renders the super canvas page shell and nav tab', () => {
    const pageMarkup = renderToStaticMarkup(
      <ImageSearchProvider>
        <SuperCanvasPage />
      </ImageSearchProvider>,
    );
    const navMarkup = renderToStaticMarkup(
      <TopNav activeTab="canvas" onTabChange={vi.fn()} />,
    );

    expect(pageMarkup).toContain('super-canvas');
    expect(pageMarkup).toContain('AI 生成');
    expect(navMarkup).toContain('超级画布');
  });
});
