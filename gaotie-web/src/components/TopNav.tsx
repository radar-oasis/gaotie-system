import { BookOpenIcon, EditIcon, PaletteIcon, SearchIcon, ImageIcon } from 'tdesign-icons-react';

interface TopNavProps {
  activeTab: 'demand' | 'image' | 'layout' | 'color' | 'canvas' | 'case' | 'proposal' | 'assets';
  onTabChange: (tab: 'demand' | 'image' | 'layout' | 'color' | 'canvas' | 'case' | 'proposal' | 'assets') => void;
}

const NAV_ITEMS: Array<{
  tab: TopNavProps['activeTab'];
  label: string;
}> = [
  { tab: 'demand', label: '文化主题解读' },
  { tab: 'image', label: '纹样检索' },
  { tab: 'canvas', label: '纹样转化画布' },
  { tab: 'layout', label: '车身布局' },
  { tab: 'color', label: '色彩配置' },
  { tab: 'case', label: '涂装案例' },
  { tab: 'proposal', label: '效果生成' },
  { tab: 'assets', label: '资产沉淀' },
];

export default function TopNav({ activeTab, onTabChange }: TopNavProps) {
  if (activeTab === 'image' || activeTab === 'demand' || activeTab === 'canvas' || activeTab === 'layout' || activeTab === 'color' || activeTab === 'case' || activeTab === 'proposal' || activeTab === 'assets') {
    const icons = {
      assets: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><rect x="3" y="7" width="18" height="14" rx="3"/><path d="M3 11h18M8 7V3h8v4M9 15h6"/></svg>,
      demand: <BookOpenIcon />, canvas: <EditIcon />,
      layout: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="5" y="3" width="14" height="15" rx="4" /><path d="M5 11h14M9 6h6M8 18l-2 3m10-3 2 3M9 21h6" /><path d="M8 14.5h1m6 0h1" />
      </svg>,
      color: <PaletteIcon />, case: <SearchIcon />, proposal: <ImageIcon />,
      image: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
        <path d="M12 12C2 12 3 3 7.5 3 12 3 12 12 12 12Zm0 0s0-9 4.5-9C21 3 22 12 12 12Zm0 0c10 0 9 9 4.5 9C12 21 12 12 12 12Zm0 0s0 9-4.5 9C3 21 2 12 12 12Z" />
      </svg>,
    };
    return <nav className="pattern-workspace-nav" aria-label="工作台模块">
      {NAV_ITEMS.map(item => <button key={item.tab} type="button" onClick={() => onTabChange(item.tab)}
        aria-current={item.tab === activeTab ? 'page' : undefined}>
        {icons[item.tab]}<span>{item.tab === 'case' ? '案例检索' : item.label}</span>
      </button>)}
    </nav>;
  }
  return (
    <header
      style={{
        height: '64px',
        display: 'flex',
        alignItems: 'center',
        padding: '0 32px',
        backgroundColor: '#ffffff',
        borderBottom: '1px solid #e7e7e7',
        boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
      }}
    >
      <div style={{ display: 'flex', gap: '8px' }}>
        {NAV_ITEMS.map((item) => {
          const isActive = activeTab === item.tab;

          return (
            <button
              key={item.tab}
              onClick={() => onTabChange(item.tab)}
              style={{
                padding: '8px 20px',
                borderRadius: '20px',
                border: 'none',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 500,
                transition: 'all 0.2s',
                backgroundColor: isActive ? '#0052d9' : '#f3f4f6',
                color: isActive ? '#ffffff' : '#666666',
              }}
            >
              {item.label}
            </button>
          );
        })}
      </div>
    </header>
  );
}
