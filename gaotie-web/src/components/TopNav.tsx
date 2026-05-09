interface TopNavProps {
  activeTab: 'demand' | 'image' | 'layout' | 'canvas';
  onTabChange: (tab: 'demand' | 'image' | 'layout' | 'canvas') => void;
}

export default function TopNav({ activeTab, onTabChange }: TopNavProps) {
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
        <button
          onClick={() => onTabChange('demand')}
          style={{
            padding: '8px 20px',
            borderRadius: '20px',
            border: 'none',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: 500,
            transition: 'all 0.2s',
            backgroundColor: activeTab === 'demand' ? '#0052d9' : '#f3f4f6',
            color: activeTab === 'demand' ? '#ffffff' : '#666666',
          }}
        >
          需求分析
        </button>
        <button
          onClick={() => onTabChange('image')}
          style={{
            padding: '8px 20px',
            borderRadius: '20px',
            border: 'none',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: 500,
            transition: 'all 0.2s',
            backgroundColor: activeTab === 'image' ? '#0052d9' : '#f3f4f6',
            color: activeTab === 'image' ? '#ffffff' : '#666666',
          }}
        >
          意象图片检索
        </button>
        <button
          onClick={() => onTabChange('layout')}
          style={{
            padding: '8px 20px',
            borderRadius: '20px',
            border: 'none',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: 500,
            transition: 'all 0.2s',
            backgroundColor: activeTab === 'layout' ? '#0052d9' : '#f3f4f6',
            color: activeTab === 'layout' ? '#ffffff' : '#666666',
          }}
        >
          布局元素
        </button>
        <button
          onClick={() => onTabChange('canvas')}
          style={{
            padding: '8px 20px',
            borderRadius: '20px',
            border: 'none',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: 500,
            transition: 'all 0.2s',
            backgroundColor: activeTab === 'canvas' ? '#0052d9' : '#f3f4f6',
            color: activeTab === 'canvas' ? '#ffffff' : '#666666',
          }}
        >
          超级画布
        </button>
      </div>
    </header>
  );
}
