import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { DeleteIcon, AddIcon } from 'tdesign-icons-react';
import { useColorConfig, type ColorRegion } from '../../context/ColorConfigContext';

interface ColorRegionRowProps {
  region: ColorRegion;
  isSelected: boolean;
  onSelect: () => void;
  onUpdate: (updates: Partial<ColorRegion>) => void;
  onRemove: () => void;
  canDelete: boolean;
}

function ColorRegionRow({
  region,
  isSelected,
  onSelect,
  onUpdate,
  onRemove,
  canDelete,
}: ColorRegionRowProps) {
  const [showColorPicker, setShowColorPicker] = useState(false);

  const handleColorBlockClick = (e: MouseEvent) => {
    e.stopPropagation();
    setShowColorPicker(!showColorPicker);
    onSelect();
  };

  const handleColorChange = (color: string) => {
    onUpdate({ color, source: 'manual' });
  };

  const handleNameChange = (name: string) => {
    onUpdate({ name });
  };

  const handleColorNameChange = (colorName: string) => {
    onUpdate({ colorName });
  };

  const handleDescriptionChange = (description: string) => {
    onUpdate({ description });
  };

  return (
    <div
      onClick={onSelect}
      style={{
        padding: '12px',
        borderRadius: '8px',
        border: isSelected ? '2px solid #1D4ED8' : '1px solid #E5E7EB',
        backgroundColor: isSelected ? '#EFF6FF' : '#FFFFFF',
        cursor: 'pointer',
        transition: 'all 0.2s',
        marginBottom: '8px',
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}
    >
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        marginBottom: '10px',
        minWidth: 0,
      }}>
        <div
          onClick={handleColorBlockClick}
          style={{
            width: '48px',
            height: '48px',
            borderRadius: '8px',
            backgroundColor: region.color,
            border: '1px solid #D1D5DB',
            cursor: 'pointer',
            position: 'relative',
            flexShrink: 0,
          }}
          title={`HEX: ${region.color}`}
        >
          {showColorPicker && (
            <input
              type="color"
              value={region.color}
              onChange={(e) => handleColorChange(e.target.value)}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                opacity: 0,
                cursor: 'pointer',
              }}
            />
          )}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <input
            type="text"
            value={region.name}
            onChange={(e) => handleNameChange(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              border: '1px solid #E5E7EB',
              borderRadius: '4px',
              padding: '6px 8px',
              fontSize: '13px',
              fontWeight: 500,
              color: '#1F2937',
              marginBottom: '4px',
              boxSizing: 'border-box',
            }}
            placeholder="施色域名称"
          />
          <input
            type="text"
            value={region.colorName || ''}
            onChange={(e) => handleColorNameChange(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              border: '1px solid #E5E7EB',
              borderRadius: '4px',
              padding: '4px 8px',
              fontSize: '12px',
              color: '#6B7280',
              boxSizing: 'border-box',
            }}
            placeholder="颜色名称，如深海蓝、银灰色"
          />
        </div>

        <div style={{
          fontFamily: 'monospace',
          fontSize: '12px',
          color: '#6B7280',
          backgroundColor: '#F3F4F6',
          padding: '4px 8px',
          borderRadius: '4px',
          flexShrink: 0,
        }}>
          {region.color}
        </div>

        {canDelete && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            style={{
              padding: '6px',
              border: 'none',
              backgroundColor: 'transparent',
              color: '#EF4444',
              cursor: 'pointer',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            title="删除"
          >
            <DeleteIcon />
          </button>
        )}
      </div>

      <textarea
        value={region.description || ''}
        onChange={(e) => handleDescriptionChange(e.target.value)}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          border: '1px solid #E5E7EB',
          borderRadius: '4px',
          padding: '8px',
          fontSize: '12px',
          color: '#4B5563',
          resize: 'vertical',
          minHeight: '60px',
          fontFamily: 'inherit',
          boxSizing: 'border-box',
          display: 'block',
        }}
        placeholder="效果描述，如：用于强调车窗带的连续性与速度感"
      />
    </div>
  );
}

export default function ColorRegionEditor() {
  const {
    colorRegions,
    updateRegion,
    addRegion,
    removeRegion,
    selectedRegionId,
    setSelectedRegionId,
  } = useColorConfig();
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    if (!selectedRegionId) return;
    rowRefs.current[selectedRegionId]?.scrollIntoView({
      block: 'nearest',
      behavior: 'smooth',
    });
  }, [selectedRegionId]);

  const handleAddRegion = () => {
    const newRegion: ColorRegion = {
      id: `region_custom_${Date.now()}`,
      name: '自定义区域',
      color: '#FFFFFF',
      source: 'manual',
    };
    addRegion(newRegion);
    setSelectedRegionId(newRegion.id);
  };

  const handleSelectRegion = (regionId: string) => {
    setSelectedRegionId(regionId);
  };

  const handleUpdateRegion = (regionId: string, updates: Partial<ColorRegion>) => {
    updateRegion(regionId, updates);
  };

  const handleRemoveRegion = (regionId: string) => {
    removeRegion(regionId);
  };

  const canDeleteRegion = (region: ColorRegion): boolean => {
    return region.id.startsWith('region_custom_');
  };

  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      backgroundColor: '#FFFFFF',
      overflow: 'hidden',
    }}>
      <div style={{
        padding: '16px 20px',
        borderBottom: '1px solid #E5E7EB',
        backgroundColor: '#FAFAFA',
      }}>
        <h3 style={{
          margin: 0,
          fontSize: '14px',
          fontWeight: 600,
          color: '#1F2937'
        }}>施色域配置</h3>
        <p style={{
          margin: '4px 0 0 0',
          fontSize: '12px',
          color: '#6B7280'
        }}>
          选择或点击色块修改颜色，支持从右侧色板提取颜色
        </p>
      </div>

      <div style={{
        flex: 1,
        overflow: 'auto',
        padding: '16px 20px',
      }}>
        {colorRegions.map((region) => (
          <div
            key={region.id}
            ref={(element) => {
              rowRefs.current[region.id] = element;
            }}
          >
            <ColorRegionRow
              region={region}
              isSelected={selectedRegionId === region.id}
              onSelect={() => handleSelectRegion(region.id)}
              onUpdate={(updates) => handleUpdateRegion(region.id, updates)}
              onRemove={() => handleRemoveRegion(region.id)}
              canDelete={canDeleteRegion(region)}
            />
          </div>
        ))}

        <button
          onClick={handleAddRegion}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            width: '100%',
            padding: '12px',
            marginTop: '8px',
            border: '1px dashed #D1D5DB',
            borderRadius: '8px',
            backgroundColor: '#FAFAFA',
            color: '#6B7280',
            fontSize: '13px',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
        >
          <AddIcon />
          新增自定义施色域
        </button>
      </div>
    </div>
  );
}
