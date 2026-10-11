import { useState, type DragEvent, type ChangeEvent } from 'react';
import { UploadIcon } from 'tdesign-icons-react';
import { useColorConfig, type ExtractedPaletteGroup } from '../../context/ColorConfigContext';
import { apiUrl } from '../../utils/backendUrls';

interface PaletteGroupProps {
  group: ExtractedPaletteGroup;
  selectedColor: string | null;
  onColorSelect: (color: string) => void;
}

function PaletteGroup({ group, selectedColor, onColorSelect }: PaletteGroupProps) {
  const getGroupTitle = (type: ExtractedPaletteGroup['type']): string => {
    const titles: Record<ExtractedPaletteGroup['type'], string> = {
      analogous: '邻近色方案',
      contrast: '对比色方案',
      complementary: '互补色方案',
      monochrome: '单色渐变方案',
      semantic: '主色/辅助色/强调色方案',
    };
    return titles[type] || group.title;
  };

  return (
    <div style={{ marginBottom: '12px' }}>
      <div style={{
        fontSize: '11px',
        fontWeight: 500,
        color: '#6B7280',
        marginBottom: '6px',
      }}>
        {getGroupTitle(group.type)}
      </div>
      <div style={{
        display: 'flex',
        gap: '4px',
        overflowX: 'auto',
        paddingBottom: '4px',
      }}>
        {group.colors.map((color, index) => {
          const isSelected = selectedColor === color;
          return (
            <div
              key={`${color}-${index}`}
              onClick={() => onColorSelect(color)}
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '4px',
                backgroundColor: color,
                border: isSelected ? '2px solid #1D4ED8' : '1px solid #D1D5DB',
                cursor: 'pointer',
                flexShrink: 0,
                position: 'relative',
                transition: 'all 0.15s',
                transform: isSelected ? 'scale(1.1)' : 'scale(1)',
              }}
              title={color}
            >
              {isSelected && (
                <div style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: 'rgba(255,255,255,0.9)',
                  borderRadius: '3px',
                }}>
                  <span style={{
                    fontSize: '14px',
                    color: '#1D4ED8',
                  }}>
                    ✓
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function ImagePaletteExtractor() {
  const {
    extractedPalette,
    setExtractedPalette,
    paletteGroups,
    setPaletteGroups,
    uploadedImage,
    setUploadedImage,
    selectedPaletteColor,
    setSelectedPaletteColor,
    updateRegion,
    selectedRegionId,
  } = useColorConfig();

  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileSelect = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('请上传图片文件');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError('图片大小不能超过10MB');
      return;
    }

    setIsUploading(true);
    setError(null);

    const formData = new FormData();
    formData.append('image', file);

    try {
      const response = await fetch(apiUrl('/color-config/extract-palette'), {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `上传失败: ${response.status}`);
      }

      const data = await response.json();

      const reader = new FileReader();
      reader.onload = (e) => {
        setUploadedImage(e.target?.result as string);
      };
      reader.readAsDataURL(file);

      if (data.basePalette) {
        setExtractedPalette(data.basePalette);
      }
      if (data.groups) {
        setPaletteGroups(data.groups);
      }
    } catch (err) {
      console.error('提取色板失败:', err);
      setError(err instanceof Error ? err.message : '提取色板失败，请重试');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) {
      void handleFileSelect(file);
    }
  };

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      void handleFileSelect(file);
    }
  };

  const handleColorSelect = (color: string) => {
    setSelectedPaletteColor(color);
    if (selectedRegionId) {
      updateRegion(selectedRegionId, { color, source: 'palette' });
    }
  };

  const handleClearImage = () => {
    setUploadedImage(null);
    setExtractedPalette([]);
    setPaletteGroups([]);
    setSelectedPaletteColor(null);
    setError(null);
  };

  return (
    <div style={{
      padding: '16px',
      borderBottom: '1px solid #E5E7EB',
    }}>
      <h4 style={{
        margin: '0 0 12px 0',
        fontSize: '13px',
        fontWeight: 600,
        color: '#1F2937'
      }}>
        图片色板提取
      </h4>

      {!uploadedImage ? (
        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          style={{
            border: '2px dashed #D1D5DB',
            borderRadius: '8px',
            padding: '24px 16px',
            textAlign: 'center',
            backgroundColor: '#FAFAFA',
            cursor: 'pointer',
            transition: 'all 0.2s',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <UploadIcon style={{ fontSize: '32px', color: '#9CA3AF', marginBottom: '8px' }} />
          <p style={{
            margin: '0 0 8px 0',
            fontSize: '12px',
            color: '#6B7280'
          }}>
            拖拽图片到这里，或点击上传
          </p>
          <p style={{
            margin: 0,
            fontSize: '11px',
            color: '#9CA3AF'
          }}>
            支持 JPG、PNG，最大 10MB
          </p>
          <input
            type="file"
            accept="image/*"
            onChange={handleInputChange}
            style={{
              position: 'absolute',
              inset: 0,
              opacity: 0,
              cursor: 'pointer',
            }}
          />
        </div>
      ) : (
        <div>
          <div style={{
            position: 'relative',
            width: '100%',
            aspectRatio: '4 / 3',
            borderRadius: '8px',
            overflow: 'hidden',
            marginBottom: '12px',
            backgroundColor: '#F3F4F6',
          }}>
            <img
              src={uploadedImage}
              alt="上传图片"
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
              }}
            />
            <button
              onClick={handleClearImage}
              style={{
                position: 'absolute',
                top: '8px',
                right: '8px',
                padding: '4px 8px',
                backgroundColor: 'rgba(0,0,0,0.6)',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '4px',
                fontSize: '11px',
                cursor: 'pointer',
              }}
            >
              清除
            </button>
          </div>

          {extractedPalette.length > 0 && (
            <div style={{ marginBottom: '12px' }}>
              <div style={{
                fontSize: '11px',
                fontWeight: 500,
                color: '#6B7280',
                marginBottom: '6px',
              }}>
                基础色板
              </div>
              <div style={{
                display: 'flex',
                gap: '4px',
                flexWrap: 'wrap',
              }}>
                {extractedPalette.map((color, index) => (
                  <div
                    key={`base-${index}`}
                    onClick={() => handleColorSelect(color)}
                    style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: '4px',
                      backgroundColor: color,
                      border: selectedPaletteColor === color ? '2px solid #1D4ED8' : '1px solid #D1D5DB',
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                    title={color}
                  />
                ))}
              </div>
            </div>
          )}

          {paletteGroups.length > 0 && (
            <div>
              {paletteGroups.map((group, index) => (
                <PaletteGroup
                  key={`group-${index}`}
                  group={group}
                  selectedColor={selectedPaletteColor}
                  onColorSelect={handleColorSelect}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {error && (
        <div style={{
          marginTop: '8px',
          padding: '8px 12px',
          backgroundColor: '#FEF2F2',
          borderRadius: '4px',
          fontSize: '12px',
          color: '#DC2626',
        }}>
          {error}
        </div>
      )}

      {isUploading && (
        <div style={{
          marginTop: '8px',
          textAlign: 'center',
          fontSize: '12px',
          color: '#6B7280',
        }}>
          正在提取色板...
        </div>
      )}
    </div>
  );
}
