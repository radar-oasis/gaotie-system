import { lazy, Suspense, useCallback, useState, useEffect, type MouseEvent } from 'react';
import { ArrowRightIcon, DeleteIcon, RenameIcon, SaveIcon } from 'tdesign-icons-react';
import { useProject } from '../projects/ProjectContext';
import { apiUrl } from '../utils/backendUrls';
import { useColorConfig } from '../context/ColorConfigContext';
import type { Layout3DData } from './layout3d/layout3d';
import './layout3d/Layout3DEditor.css';

const Layout3DEditor = lazy(() => import('./layout3d/Layout3DEditor'));

interface LayoutComponent {
  id: string;
  category: string;
  name: string;
  imageUrl: string;
}

interface LayoutScheme {
  id?: string;
  name: string;
  componentsMap: Record<string, string>;
  layout3d?: Layout3DData;
  createdAt?: string;
  updatedAt?: string;
  projectId?: string | null;
}

interface LayoutCategory {
  id: string;
  name: string;
  components: LayoutComponent[];
}

const LEGACY_NO_PAINT_ID = '不涂装';

function getLayoutElementUrl(path: string) {
  return apiUrl(`/layout-elements/${path}`);
}

function normalizeComponentsMap(
  componentsMap: Record<string, string> = {},
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(componentsMap).filter(
      ([, componentId]) => componentId !== LEGACY_NO_PAINT_ID,
    ),
  );
}

const LAYOUT_CATEGORIES: LayoutCategory[] = [
  {
    id: '车窗带',
    name: '车窗带',
    components: [
      { id: 'A1', category: '车窗带', name: '车窗带A1', imageUrl: getLayoutElementUrl('车窗带/A1.png') },
      { id: 'A2', category: '车窗带', name: '车窗带A2', imageUrl: getLayoutElementUrl('车窗带/A2.png') },
      { id: 'A3', category: '车窗带', name: '车窗带A3', imageUrl: getLayoutElementUrl('车窗带/A3.png') },
    ],
  },
  {
    id: '车门',
    name: '车门',
    components: [
      { id: 'C1', category: '车门', name: '车门C1', imageUrl: getLayoutElementUrl('车门/C1.png') },
    ],
  },
  {
    id: '车顶侧',
    name: '车顶侧',
    components: [
      { id: 'D1', category: '车顶侧', name: '车顶侧D1', imageUrl: getLayoutElementUrl('车顶侧/D1.png') },
      { id: 'D2', category: '车顶侧', name: '车顶侧D2', imageUrl: getLayoutElementUrl('车顶侧/D2.png') },
    ],
  },
  {
    id: '车底侧',
    name: '车底侧',
    components: [
      { id: 'E1', category: '车底侧', name: '车底侧E1', imageUrl: getLayoutElementUrl('车底侧/E1.png') },
    ],
  },
  {
    id: '下车底区',
    name: '下车底区',
    components: [
      { id: 'F1', category: '下车底区', name: '下车底区F1', imageUrl: getLayoutElementUrl('下车底区/F1.png') },
      { id: 'F2', category: '下车底区', name: '下车底区F2', imageUrl: getLayoutElementUrl('下车底区/F2.png') },
      { id: 'F3', category: '下车底区', name: '下车底区F3', imageUrl: getLayoutElementUrl('下车底区/F3.png') },
    ],
  },
  {
    id: '车头侧',
    name: '车头侧',
    components: [
      { id: 'G1', category: '车头侧', name: '车头侧G1', imageUrl: getLayoutElementUrl('车头侧/G1.png') },
      { id: 'G2', category: '车头侧', name: '车头侧G2', imageUrl: getLayoutElementUrl('车头侧/G2.png') },
      { id: 'G3', category: '车头侧', name: '车头侧G3', imageUrl: getLayoutElementUrl('车头侧/G3.png') },
      { id: 'G4', category: '车头侧', name: '车头侧G4', imageUrl: getLayoutElementUrl('车头侧/G4.png') },
    ],
  },
  {
    id: '腰线',
    name: '腰线',
    components: [
      { id: 'B1', category: '腰线', name: '腰线B1', imageUrl: getLayoutElementUrl('腰线/B1.png') },
      { id: 'B2', category: '腰线', name: '腰线B2', imageUrl: getLayoutElementUrl('腰线/B2.png') },
      { id: 'B3', category: '腰线', name: '腰线B3', imageUrl: getLayoutElementUrl('腰线/B3.png') },
      { id: 'B4', category: '腰线', name: '腰线B4', imageUrl: getLayoutElementUrl('腰线/B4.png') },
    ],
  },
];

export default function LayoutElementsPage() {
  return <div style={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
    <div style={{ flex: 1, minHeight: 0 }}><Suspense fallback={<p style={{ padding: 24 }}>正在加载三维布局工作台…</p>}>
      <Layout3DEditor />
    </Suspense></div>
  </div>;
}

export function LegacyLayoutElementsPage() {
  const { setSelectedLayoutScheme } = useColorConfig();
  const { currentProject } = useProject();
  const [selectedComponents, setSelectedComponents] = useState<Record<string, string>>({});
  const [savedSchemes, setSavedSchemes] = useState<LayoutScheme[]>([]);
  const [schemeCount, setSchemeCount] = useState(0);
  const currentProjectId = currentProject?.id ?? '';

  const loadSchemes = useCallback(async () => {
    if (!currentProjectId) {
      setSavedSchemes([]);
      setSchemeCount(0);
      return;
    }

    try {
      const params = new URLSearchParams({ projectId: currentProjectId });
      const response = await fetch(apiUrl(`/layout-scheme/list?${params}`));
      if (response.ok) {
        const data = (await response.json()) as LayoutScheme[];
        const normalizedSchemes = data.filter(scheme => !scheme.layout3d).map((scheme) => ({
          ...scheme,
          componentsMap: normalizeComponentsMap(scheme.componentsMap),
        }));
        setSavedSchemes(normalizedSchemes);
        setSchemeCount(data.length);
      }
    } catch (error) {
      console.error('Failed to load schemes:', error);
    }
  }, [currentProjectId]);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      void loadSchemes();
    }, 0);

    return () => window.clearTimeout(timerId);
  }, [loadSchemes]);

  useEffect(() => {
    setSelectedComponents({});
    setSavedSchemes([]);
    setSchemeCount(0);
  }, [currentProjectId]);

  const handleSelectComponent = (categoryId: string, componentId: string) => {
    setSelectedComponents((prev) => {
      if (prev[categoryId] === componentId) {
        const newState = { ...prev };
        delete newState[categoryId];
        return newState;
      }
      return { ...prev, [categoryId]: componentId };
    });
  };

  const handleSaveScheme = async () => {
    if (!currentProjectId) {
      alert('请先选择项目');
      return;
    }

    const newSchemeName = `方案${schemeCount + 1}`;
    const scheme: LayoutScheme = {
      name: newSchemeName,
      componentsMap: { ...selectedComponents },
      projectId: currentProjectId,
    };

    try {
      const response = await fetch(apiUrl('/layout-scheme/save'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(scheme),
      });

      if (response.ok) {
        const saved = await response.json();
        if (saved.id) setSelectedLayoutScheme({id:saved.id,name:saved.name || newSchemeName,componentsMap:normalizeComponentsMap(saved.componentsMap || scheme.componentsMap)});
        await loadSchemes();
        alert(`方案"${newSchemeName}"已保存！`);
      }
    } catch (error) {
      console.error('Failed to save scheme:', error);
      alert('保存失败，请重试');
    }
  };

  const handleRenameScheme = async (
    event: MouseEvent<HTMLButtonElement>,
    scheme: LayoutScheme,
  ) => {
    event.stopPropagation();

    if (!scheme.id) {
      alert('该方案缺少 ID，无法重命名');
      return;
    }

    const nextName = window.prompt('请输入新的车身布局方案名称', scheme.name);

    if (!nextName || nextName.trim() === scheme.name) {
      return;
    }

    try {
      const response = await fetch(apiUrl(`/layout-scheme/${scheme.id}`), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: nextName.trim() }),
      });

      if (!response.ok) {
        alert('重命名失败，请重试');
        return;
      }

      await loadSchemes();
    } catch (error) {
      console.error('Failed to rename scheme:', error);
      alert('重命名失败，请重试');
    }
  };

  const handleLoadScheme = (scheme: LayoutScheme) => {
    setSelectedComponents(normalizeComponentsMap(scheme.componentsMap));
    if (scheme.id) setSelectedLayoutScheme({id:scheme.id,name:scheme.name,componentsMap:normalizeComponentsMap(scheme.componentsMap),createdAt:scheme.createdAt});
  };

  const handleDeleteScheme = async (
    event: MouseEvent<HTMLButtonElement>,
    scheme: LayoutScheme,
  ) => {
    event.stopPropagation();

    if (!scheme.id) {
      alert('该方案缺少 ID，无法删除');
      return;
    }

    const confirmed = window.confirm(`确定删除"${scheme.name}"吗？`);
    if (!confirmed) return;

    try {
      const response = await fetch(apiUrl(`/layout-scheme/${scheme.id}`), {
        method: 'DELETE',
      });

      if (!response.ok) {
        alert('删除失败，请重试');
        return;
      }

      const result = (await response.json()) as { success?: boolean };
      if (!result.success) {
        alert('方案不存在或已被删除');
      }

      await loadSchemes();
    } catch (error) {
      console.error('Failed to delete scheme:', error);
      alert('删除失败，请重试');
    }
  };

  const handleNextStep = () => {
    const selectedIds = Object.values(selectedComponents);
    console.log('Selected component IDs:', selectedIds);
    alert(`车身布局已确认，当前选中：\n${selectedIds.join(', ') || '无'}`);
  };

  const selectedAreaCount = Object.keys(selectedComponents).length;

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden', backgroundColor: '#ffffff' }}>
      <div
        style={{
          flex: '1 1 auto',
          minWidth: 0,
          padding: '24px 28px 32px',
          boxSizing: 'border-box',
          overflowY: 'auto',
          borderRight: '1px solid #e5e7eb',
        }}
      >
        <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '20px' }}>车身布局选择</h2>
        <p style={{ color: '#666', marginBottom: '30px' }}>
          请为每个车身区域选择布局方案，若不选择则视为此区域不作为独立施色域
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '40px' }}>
          {LAYOUT_CATEGORIES.map((category) => (
            <div key={category.id}>
              <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '16px', color: '#333' }}>
                {category.name}
              </h3>
              <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                {category.components.map((component) => {
                  const isSelected = selectedComponents[category.id] === component.id;

                  return (
                    <div
                      key={component.id}
                      onClick={() => handleSelectComponent(category.id, component.id)}
                      style={{
                        width: '140px',
                        height: '160px',
                        boxSizing: 'border-box',
                        border: isSelected ? '2px solid #0052d9' : '1px solid #e5e7eb',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: isSelected ? '#eff6ff' : '#fff',
                        transition: 'all 0.2s',
                        position: 'relative',
                        overflow: 'hidden',
                      }}
                    >
                      <img
                        src={component.imageUrl}
                        alt={component.name}
                        style={{
                          width: '100%',
                          height: '120px',
                          objectFit: 'contain',
                        }}
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                      <div style={{
                        width: '100%',
                        boxSizing: 'border-box',
                        padding: '8px',
                        textAlign: 'center',
                        fontSize: '12px',
                        backgroundColor: '#f9fafb',
                        borderTop: '1px solid #e5e7eb',
                      }}>
                        {component.name}
                      </div>
                      {isSelected && (
                        <div style={{
                          position: 'absolute',
                          top: '8px',
                          right: '8px',
                          width: '20px',
                          height: '20px',
                          borderRadius: '50%',
                          backgroundColor: '#3b82f6',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#fff',
                          fontSize: '12px',
                        }}>
                          ✓
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div
        style={{
          flex: '0 0 360px',
          minWidth: '320px',
          maxWidth: '36%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          boxSizing: 'border-box',
          backgroundColor: '#f9fafb',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '20px 20px 16px',
            borderBottom: '1px solid #e5e7eb',
            backgroundColor: '#ffffff',
          }}
        >
          <h3 style={{ fontSize: '18px', fontWeight: '600', margin: 0 }}>车身布局清单</h3>
          <p style={{ color: '#6b7280', fontSize: '13px', margin: '8px 0 0' }}>
            当前已选择 {selectedAreaCount} 个区域
          </p>
        </div>

        {savedSchemes.length === 0 ? (
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '24px',
              color: '#999',
              fontSize: '14px',
              textAlign: 'center',
            }}
          >
            暂无保存的车身布局方案
          </div>
        ) : (
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px 12px', boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {savedSchemes.map((scheme) => (
                <div
                  key={scheme.id ?? scheme.name}
                  onClick={() => handleLoadScheme(scheme)}
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    padding: '14px',
                    backgroundColor: '#fff',
                    borderRadius: '8px',
                    border: '1px solid #e5e7eb',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    overflow: 'hidden',
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLDivElement).style.borderColor = '#3b82f6';
                    (e.currentTarget as HTMLDivElement).style.boxShadow = '0 2px 8px rgba(59, 130, 246, 0.2)';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLDivElement).style.borderColor = '#e5e7eb';
                    (e.currentTarget as HTMLDivElement).style.boxShadow = 'none';
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', minWidth: 0 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontWeight: '500',
                          marginBottom: '8px',
                          color: '#111827',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {scheme.name}
                      </div>
                      <div style={{ fontSize: '12px', color: '#666' }}>
                        {Object.keys(scheme.componentsMap).length} 个区域已配置
                      </div>
                    </div>
                    <button
                      type="button"
                      title={`重命名${scheme.name}`}
                      aria-label={`重命名${scheme.name}`}
                      onClick={(event) => handleRenameScheme(event, scheme)}
                      style={{
                        width: '28px',
                        height: '28px',
                        flex: '0 0 28px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 0,
                        border: '1px solid transparent',
                        borderRadius: '6px',
                        backgroundColor: 'transparent',
                        color: '#6b7280',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                      }}
                    >
                      <RenameIcon size="16px" />
                    </button>
                    <button
                      type="button"
                      title={`删除${scheme.name}`}
                      aria-label={`删除${scheme.name}`}
                      onClick={(event) => handleDeleteScheme(event, scheme)}
                      style={{
                        width: '28px',
                        height: '28px',
                        flex: '0 0 28px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 0,
                        border: '1px solid transparent',
                        borderRadius: '6px',
                        backgroundColor: 'transparent',
                        color: '#6b7280',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#fef2f2';
                        (e.currentTarget as HTMLButtonElement).style.color = '#dc2626';
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
                        (e.currentTarget as HTMLButtonElement).style.color = '#6b7280';
                      }}
                    >
                      <DeleteIcon size="16px" />
                    </button>
                  </div>
                  <div
                    style={{
                      fontSize: '11px',
                      color: '#999',
                      marginTop: '6px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {Object.values(scheme.componentsMap).join(', ')}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div
          style={{
            padding: '16px 20px 20px',
            borderTop: '1px solid #e5e7eb',
            backgroundColor: '#ffffff',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          }}
        >
          <button
            onClick={handleSaveScheme}
            style={{
              width: '100%',
              height: '40px',
              border: '1px solid #d1d5db',
              borderRadius: '8px',
              backgroundColor: '#ffffff',
              color: '#1f2937',
              fontSize: '14px',
              fontWeight: '500',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
            }}
          >
            <SaveIcon size="16px" />
            保存车身布局
          </button>
          <button
            onClick={handleNextStep}
            style={{
              width: '100%',
              height: '44px',
              border: 'none',
              borderRadius: '8px',
              backgroundColor: '#0052d9',
              color: '#fff',
              fontSize: '16px',
              fontWeight: '500',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
            }}
          >
            下一步
            <ArrowRightIcon size="16px" />
          </button>
        </div>
      </div>
    </div>
  );
}
