import { useEffect, useCallback } from 'react';
import { DeleteIcon } from 'tdesign-icons-react';
import { useColorConfig, type ColorScheme } from '../../context/ColorConfigContext';
import { useProject } from '../../projects/ProjectContext';
import { apiUrl } from '../../utils/backendUrls';

export default function SavedColorSchemes() {
  const { currentProject } = useProject();
  const {
    savedSchemes,
    setSavedSchemes,
    setColorRegions,
    setCurrentColorScheme,
    setExtractedPalette,
    selectedLayoutScheme,
  } = useColorConfig();

  const loadSavedSchemes = useCallback(async () => {
    if (!currentProject?.id) {
      setSavedSchemes([]);
      return;
    }

    try {
      const params = new URLSearchParams({ projectId: currentProject.id });
      const layoutSchemeId = selectedLayoutScheme?.id;

      if (layoutSchemeId) {
        params.set('layoutSchemeId', layoutSchemeId);
      }

      const url = apiUrl(`/color-config/schemes?${params}`);

      const response = await fetch(url);
      if (response.ok) {
        const data = (await response.json()) as ColorScheme[];
        setSavedSchemes(data);
      }
    } catch (error) {
      console.error('加载已保存方案失败:', error);
    }
  }, [currentProject?.id, selectedLayoutScheme, setSavedSchemes]);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      void loadSavedSchemes();
    }, 0);
    return () => window.clearTimeout(timerId);
  }, [loadSavedSchemes]);

  const handleApplyScheme = (scheme: ColorScheme) => {
    if (scheme.regions && scheme.regions.length > 0) {
      setColorRegions(scheme.regions);
    }
    setExtractedPalette(scheme.palette || []);
    setCurrentColorScheme(scheme);
  };

  const handleDeleteScheme = async (schemeId: string) => {
    if (!confirm('确定要删除这个色彩方案吗？')) {
      return;
    }

    try {
      const response = await fetch(apiUrl(`/color-config/schemes/${schemeId}`), {
        method: 'DELETE',
      });

      if (response.ok) {
        setSavedSchemes(savedSchemes.filter((s: ColorScheme) => s.id !== schemeId));
      } else {
        alert('删除失败，请重试');
      }
    } catch (error) {
      console.error('删除方案失败:', error);
      alert('删除失败，请重试');
    }
  };

  return (
    <div style={{
      padding: '16px',
    }}>
      <h4 style={{
        margin: '0 0 12px 0',
        fontSize: '13px',
        fontWeight: 600,
        color: '#1F2937'
      }}>
        已保存色彩方案
      </h4>

      {savedSchemes.length === 0 ? (
        <p style={{
          margin: 0,
          fontSize: '12px',
          color: '#9CA3AF',
          textAlign: 'center',
          padding: '16px 0',
        }}>
          暂无已保存的色彩方案
        </p>
      ) : (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          maxHeight: '300px',
          overflowY: 'auto',
        }}>
          {savedSchemes.map((scheme) => (
            <div
              key={scheme.id}
              style={{
                padding: '10px',
                backgroundColor: '#FFFFFF',
                borderRadius: '8px',
                border: '1px solid #E5E7EB',
              }}
            >
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '6px',
              }}>
                <span style={{
                  fontSize: '12px',
                  fontWeight: 500,
                  color: '#1F2937',
                }}>
                  {scheme.name}
                </span>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <button
                    onClick={() => handleApplyScheme(scheme)}
                    style={{
                      padding: '3px 8px',
                      backgroundColor: '#1D4ED8',
                      color: '#FFFFFF',
                      border: 'none',
                      borderRadius: '4px',
                      fontSize: '10px',
                      cursor: 'pointer',
                    }}
                  >
                    应用
                  </button>
                  <button
                    onClick={() => handleDeleteScheme(scheme.id)}
                    style={{
                      padding: '3px',
                      backgroundColor: 'transparent',
                      color: '#EF4444',
                      border: 'none',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    <DeleteIcon />
                  </button>
                </div>
              </div>

              {scheme.palette && scheme.palette.length > 0 && (
                <div style={{
                  display: 'flex',
                  gap: '2px',
                  marginBottom: '4px',
                }}>
                  {scheme.palette.slice(0, 6).map((color, index) => (
                    <div
                      key={`palette-${index}`}
                      style={{
                        width: '20px',
                        height: '20px',
                        borderRadius: '3px',
                        backgroundColor: color,
                        border: '1px solid #E5E7EB',
                      }}
                      title={color}
                    />
                  ))}
                  {scheme.palette.length > 6 && (
                    <div
                      style={{
                        width: '20px',
                        height: '20px',
                        borderRadius: '3px',
                        backgroundColor: '#F3F4F6',
                        border: '1px solid #E5E7EB',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '9px',
                        color: '#6B7280',
                      }}
                    >
                      +{scheme.palette.length - 6}
                    </div>
                  )}
                </div>
              )}

              <div style={{
                fontSize: '10px',
                color: '#9CA3AF',
              }}>
                {scheme.createdAt
                  ? new Date(scheme.createdAt).toLocaleDateString('zh-CN')
                  : ''}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
