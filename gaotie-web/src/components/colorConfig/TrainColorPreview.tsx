import { useColorConfig } from '../../context/ColorConfigContext';

export default function TrainColorPreview() {
  const {
    colorRegions,
    selectedLayoutScheme,
    selectedRegionId,
    setSelectedRegionId,
    updateRegion,
  } = useColorConfig();

  const layoutElementRegions = colorRegions.filter((region) => region.layoutElementImageUrl);
  const selectedRegion = colorRegions.find((region) => region.id === selectedRegionId)
    || colorRegions[0];
  const activeRegionId = selectedRegion?.id;

  const handleSelectRegion = (regionId: string) => {
    setSelectedRegionId(regionId);
  };

  return (
    <div style={{
      padding: '16px',
      backgroundColor: '#F9FAFB',
      borderRadius: '8px',
      marginBottom: '16px',
    }}>
      <h4 style={{
        margin: '0 0 12px 0',
        fontSize: '13px',
        fontWeight: 600,
        color: '#1F2937'
      }}>
        {selectedLayoutScheme?.name || '方案预览'}
      </h4>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
        gap: '12px',
      }}>
        {layoutElementRegions.length === 0 ? (
          <div style={{
            padding: '24px',
            borderRadius: '8px',
            backgroundColor: '#FFFFFF',
            border: '1px dashed #D1D5DB',
            color: '#9CA3AF',
            fontSize: '12px',
            textAlign: 'center',
          }}>
            当前方案暂无可配置车身布局区域
          </div>
        ) : (
          layoutElementRegions.map((region) => (
            <div
              key={region.id}
              onClick={() => handleSelectRegion(region.id)}
              style={{
                backgroundColor: '#FFFFFF',
                border: activeRegionId === region.id ? '2px solid #1D4ED8' : '1px solid #E5E7EB',
                borderRadius: '8px',
                overflow: 'hidden',
                cursor: 'pointer',
                boxShadow: activeRegionId === region.id ? '0 0 0 3px rgba(29,78,216,0.08)' : 'none',
                transition: 'border-color 0.15s, box-shadow 0.15s',
              }}
            >
              <div style={{
                position: 'relative',
                aspectRatio: '16 / 9',
                backgroundColor: '#F3F4F6',
              }}>
                <img
                  src={region.layoutElementImageUrl}
                  alt={`${region.name}${region.componentId ?? ''}`}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain',
                  }}
                />
                <div style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  bottom: 0,
                  height: '10px',
                  backgroundColor: region.color,
                }} />
              </div>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px',
                padding: '8px',
                fontSize: '11px',
              }}>
                <span style={{ color: '#4B5563' }}>
                  {region.name}{region.componentId ? ` ${region.componentId}` : ''}
                </span>
                <span style={{ fontFamily: 'monospace', color: '#9CA3AF' }}>
                  {region.color}
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '8px',
        marginTop: '12px',
      }}>
        {colorRegions.map((region) => (
          <button
            key={region.id}
            onClick={() => handleSelectRegion(region.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 8px',
              backgroundColor: '#FFFFFF',
              borderRadius: '4px',
              border: activeRegionId === region.id ? '1px solid #1D4ED8' : '1px solid #E5E7EB',
              fontSize: '11px',
              cursor: 'pointer',
              boxShadow: activeRegionId === region.id ? '0 0 0 2px rgba(29,78,216,0.08)' : 'none',
            }}
          >
            <div
              style={{
                width: '12px',
                height: '12px',
                borderRadius: '2px',
                backgroundColor: region.color,
                border: '1px solid #D1D5DB',
              }}
            />
            <span style={{ color: '#4B5563' }}>{region.name}</span>
            <span style={{
              fontFamily: 'monospace',
              color: '#9CA3AF',
              fontSize: '10px',
            }}>
              {region.color}
            </span>
          </button>
        ))}
      </div>

      {selectedRegion && (
        <div style={{
          marginTop: '12px',
          padding: '12px',
          borderRadius: '8px',
          border: '1px solid #D7E3FF',
          backgroundColor: '#F8FAFF',
        }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: '48px minmax(0, 1fr) auto',
            gap: '10px',
            alignItems: 'center',
            marginBottom: '10px',
          }}>
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '8px',
              backgroundColor: selectedRegion.color,
              border: '1px solid #CBD5E1',
            }} />
            <div style={{ minWidth: 0 }}>
              <input
                type="text"
                value={selectedRegion.name}
                onChange={(event) => updateRegion(selectedRegion.id, { name: event.target.value })}
                style={{
                  width: '100%',
                  border: '1px solid #E5E7EB',
                  borderRadius: '4px',
                  padding: '6px 8px',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: '#1F2937',
                  marginBottom: '6px',
                  boxSizing: 'border-box',
                }}
                placeholder="施色域名称"
              />
              <input
                type="text"
                value={selectedRegion.colorName || ''}
                onChange={(event) => updateRegion(selectedRegion.id, { colorName: event.target.value })}
                style={{
                  width: '100%',
                  border: '1px solid #E5E7EB',
                  borderRadius: '4px',
                  padding: '6px 8px',
                  fontSize: '12px',
                  color: '#6B7280',
                  boxSizing: 'border-box',
                }}
                placeholder="颜色名称，如深海蓝、银灰色"
              />
            </div>
            <span style={{
              padding: '4px 8px',
              borderRadius: '4px',
              backgroundColor: '#F3F4F6',
              color: '#6B7280',
              fontFamily: 'monospace',
              fontSize: '12px',
            }}>
              {selectedRegion.color}
            </span>
          </div>
          <textarea
            value={selectedRegion.description || ''}
            onChange={(event) => updateRegion(selectedRegion.id, { description: event.target.value })}
            style={{
              width: '100%',
              minHeight: '64px',
              border: '1px solid #E5E7EB',
              borderRadius: '4px',
              padding: '8px',
              fontSize: '12px',
              color: '#4B5563',
              resize: 'vertical',
              fontFamily: 'inherit',
              boxSizing: 'border-box',
              display: 'block',
            }}
            placeholder="效果描述，如：用于强调车窗带的连续性与速度感"
          />
        </div>
      )}
    </div>
  );
}
