import { useEffect, useCallback, useState } from 'react';
import { useColorConfig, type LayoutScheme } from '../../context/ColorConfigContext';
import { useProject } from '../../projects/ProjectContext';
import { countColorableRegions, createColorRegionsFromLayoutScheme } from './layoutRegionMapping';
import { apiUrl } from '../../utils/backendUrls';

interface LayoutSchemeWithCount extends LayoutScheme {
  regionCount?: number;
}

export default function LayoutSchemeSidebar() {
  const { currentProject } = useProject();
  const {
    selectedLayoutScheme,
    setSelectedLayoutScheme,
    setColorRegions,
  } = useColorConfig();

  const [layoutSchemes, setLayoutSchemes] = useState<LayoutSchemeWithCount[]>([]);
  const currentProjectId = currentProject?.id ?? '';

  const initializeRegions = useCallback((scheme: LayoutSchemeWithCount) => {
    setColorRegions(createColorRegionsFromLayoutScheme(scheme));
  }, [setColorRegions]);

  const loadLayoutSchemes = useCallback(async () => {
    if (!currentProjectId) {
      setLayoutSchemes([]);
      return;
    }

    try {
      const params = new URLSearchParams({ projectId: currentProjectId });
      const response = await fetch(apiUrl(`/layout-scheme/list?${params}`));
      if (response.ok) {
        const data = (await response.json()) as LayoutSchemeWithCount[];
        setLayoutSchemes(data);
        if (data.length > 0 && !selectedLayoutScheme) {
          setSelectedLayoutScheme(data[0]);
          initializeRegions(data[0]);
        }
      }
    } catch (error) {
      console.error('加载布局方案失败:', error);
    }
  }, [currentProjectId, selectedLayoutScheme, setSelectedLayoutScheme, initializeRegions]);

  useEffect(() => {
    setLayoutSchemes([]);
  }, [currentProjectId]);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      void loadLayoutSchemes();
    }, 0);
    return () => window.clearTimeout(timerId);
  }, [loadLayoutSchemes]);

  const handleSelectScheme = (scheme: LayoutSchemeWithCount) => {
    setSelectedLayoutScheme(scheme);
    initializeRegions(scheme);
  };

  return (
    <div style={{
      width: '260px',
      borderRight: '1px solid #E5E7EB',
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: '#FAFAFA',
      height: '100%'
    }}>
      <div style={{
        padding: '16px',
        borderBottom: '1px solid #E5E7EB',
        backgroundColor: '#FFFFFF'
      }}>
        <h3 style={{
          margin: 0,
          fontSize: '14px',
          fontWeight: 600,
          color: '#1F2937'
        }}>车身布局方案</h3>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '12px' }}>
        {layoutSchemes.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: '32px 16px',
            color: '#6B7280',
            fontSize: '13px'
          }}>
            <p style={{ margin: '0 0 8px 0' }}>暂无车身布局方案</p>
            <p style={{ margin: 0, fontSize: '12px' }}>
              请先在车身布局模块中选择布局方案
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {layoutSchemes.map((scheme) => {
              const isSelected = selectedLayoutScheme?.id === scheme.id;
              const componentCount = countColorableRegions(scheme);

              return (
                <div
                  key={scheme.id}
                  onClick={() => handleSelectScheme(scheme)}
                  style={{
                    padding: '12px',
                    borderRadius: '8px',
                    border: isSelected ? '2px solid #1D4ED8' : '1px solid #E5E7EB',
                    backgroundColor: isSelected ? '#EFF6FF' : '#FFFFFF',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                >
                  <div style={{
                    fontSize: '13px',
                    fontWeight: 500,
                    color: '#1F2937',
                    marginBottom: '6px'
                  }}>
                    {scheme.name}
                  </div>
                  <div style={{
                    fontSize: '11px',
                    color: '#6B7280'
                  }}>
                    包含 {componentCount} 个施色域
                  </div>
                  {scheme.createdAt && (
                    <div style={{
                      fontSize: '10px',
                      color: '#9CA3AF',
                      marginTop: '4px'
                    }}>
                      {new Date(scheme.createdAt).toLocaleDateString('zh-CN')}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
