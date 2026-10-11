import { useState, useMemo, useCallback, type MouseEvent } from 'react';
import { useColorConfig } from '../../context/ColorConfigContext';
import { colorFromWheelPoint, wheelPointerPosition } from './colorWheelUtils';

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null;
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(x => {
    const hex = Math.max(0, Math.min(255, x)).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('');
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }

  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

const RECENT_COLORS_KEY = 'colorConfig_recentColors';
const MAX_RECENT_COLORS = 8;

function loadRecentColorsFromStorage(): string[] {
  try {
    const saved = localStorage.getItem(RECENT_COLORS_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        return parsed.slice(0, MAX_RECENT_COLORS);
      }
    }
  } catch {
    // ignore parse errors
  }
  return [];
}

export default function ColorPickerPanel() {
  const {
    selectedRegionId,
    colorRegions,
    updateRegion,
    selectedPaletteColor,
  } = useColorConfig();

  const selectedRegion = colorRegions.find(r => r.id === selectedRegionId);

  const [recentColors, setRecentColors] = useState<string[]>(loadRecentColorsFromStorage);
  const colorWheelSize = 140;

  const derivedValues = useMemo(() => {
    const color = selectedRegion?.color || '#FFFFFF';
    const rgb = hexToRgb(color);
    const hsl = rgb ? rgbToHsl(rgb.r, rgb.g, rgb.b) : { h: 0, s: 0, l: 100 };
    return {
      hex: color,
      rgb: rgb || { r: 255, g: 255, b: 255 },
      hsl,
    };
  }, [selectedRegion?.color]);

  const addToRecentColors = useCallback((color: string) => {
    setRecentColors(prev => {
      const filtered = prev.filter(c => c !== color);
      const updated = [color, ...filtered].slice(0, MAX_RECENT_COLORS);
      localStorage.setItem(RECENT_COLORS_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  const handleHexChange = useCallback((hex: string) => {
    if (/^#[0-9A-Fa-f]{6}$/.test(hex)) {
      if (selectedRegionId) {
        updateRegion(selectedRegionId, { color: hex, source: 'manual' });
        addToRecentColors(hex);
      }
    }
  }, [selectedRegionId, updateRegion, addToRecentColors]);

  const handleRgbChange = useCallback((component: 'r' | 'g' | 'b', value: string) => {
    const numValue = Math.max(0, Math.min(255, parseInt(value) || 0));
    const currentRgb = derivedValues.rgb;
    const newRgb = { ...currentRgb, [component]: numValue };
    const hex = rgbToHex(newRgb.r, newRgb.g, newRgb.b);
    if (selectedRegionId) {
      updateRegion(selectedRegionId, { color: hex, source: 'manual' });
      addToRecentColors(hex);
    }
  }, [derivedValues.rgb, selectedRegionId, updateRegion, addToRecentColors]);

  const handleNativeColorChange = useCallback((color: string) => {
    handleHexChange(color);
  }, [handleHexChange]);

  const handleWheelPick = useCallback((event: MouseEvent<HTMLDivElement>) => {
    if (!selectedRegionId) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const color = colorFromWheelPoint(x, y, rect.width);
    updateRegion(selectedRegionId, { color, source: 'manual' });
    addToRecentColors(color);
  }, [selectedRegionId, updateRegion, addToRecentColors]);

  const handleApplyPaletteColor = useCallback(() => {
    if (selectedPaletteColor && selectedRegionId) {
      updateRegion(selectedRegionId, { color: selectedPaletteColor, source: 'palette' });
    }
  }, [selectedPaletteColor, selectedRegionId, updateRegion]);

  if (!selectedRegion) {
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
          调色盘
        </h4>
        <p style={{
          margin: 0,
          fontSize: '12px',
          color: '#6B7280',
          textAlign: 'center',
          padding: '20px 0',
        }}>
          请先选择一个施色域
        </p>
      </div>
    );
  }

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
        调色盘
      </h4>

      {selectedPaletteColor && (
        <div style={{
          marginBottom: '12px',
          padding: '8px',
          backgroundColor: '#EFF6FF',
          borderRadius: '6px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div
              style={{
                width: '24px',
                height: '24px',
                borderRadius: '4px',
                backgroundColor: selectedPaletteColor,
                border: '1px solid #D1D5DB',
              }}
            />
            <span style={{ fontSize: '12px', color: '#1F2937' }}>
              已选色板: {selectedPaletteColor}
            </span>
          </div>
          <button
            onClick={handleApplyPaletteColor}
            style={{
              padding: '4px 10px',
              backgroundColor: '#1D4ED8',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '4px',
              fontSize: '11px',
              cursor: 'pointer',
            }}
          >
            应用
          </button>
        </div>
      )}

      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
      }}>
        <div style={{
          position: 'relative',
          width: `${colorWheelSize}px`,
          height: `${colorWheelSize}px`,
          alignSelf: 'center',
          borderRadius: '50%',
          overflow: 'hidden',
          border: '1px solid #D1D5DB',
          background:
            'radial-gradient(circle, #FFFFFF 0%, rgba(255,255,255,0) 68%), conic-gradient(from 90deg, #FF0000, #FFFF00, #00FF00, #00FFFF, #0000FF, #FF00FF, #FF0000)',
          cursor: 'crosshair',
          boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.6)',
        }}
          onClick={handleWheelPick}
          title="点击色轮选取颜色"
        >
          {(() => {
            const position = wheelPointerPosition(derivedValues.hsl, colorWheelSize);
            return (
              <div
                style={{
                  position: 'absolute',
                  left: `${position.left}px`,
                  top: `${position.top}px`,
                  width: '14px',
                  height: '14px',
                  borderRadius: '50%',
                  border: '2px solid #FFFFFF',
                  boxShadow: '0 0 0 1px rgba(17,24,39,0.55), 0 2px 6px rgba(0,0,0,0.25)',
                  backgroundColor: derivedValues.hex,
                  transform: 'translate(-50%, -50%)',
                  pointerEvents: 'none',
                }}
              />
            );
          })()}
          <div style={{
            position: 'absolute',
            inset: '48px',
            borderRadius: '50%',
            backgroundColor: derivedValues.hex,
            border: '2px solid rgba(255,255,255,0.8)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
            pointerEvents: 'none',
          }} />
        </div>

        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}>
          <input
            type="color"
            value={derivedValues.hex}
            onChange={(e) => handleNativeColorChange(e.target.value)}
            style={{
              width: '40px',
              height: '32px',
              border: '1px solid #E5E7EB',
              borderRadius: '6px',
              padding: 0,
              backgroundColor: '#FFFFFF',
              cursor: 'pointer',
              flexShrink: 0,
            }}
            title="打开系统取色器"
          />
          <div style={{
            flex: 1,
            minWidth: 0,
            padding: '7px 8px',
            borderRadius: '6px',
            backgroundColor: '#F3F4F6',
            color: '#4B5563',
            fontSize: '12px',
            fontFamily: 'monospace',
            boxSizing: 'border-box',
          }}>
            {derivedValues.hex}
          </div>
        </div>

        <div>
          <label style={{
            display: 'block',
            fontSize: '11px',
            color: '#6B7280',
            marginBottom: '4px',
          }}>
            HEX
          </label>
          <input
            type="text"
            value={derivedValues.hex}
            onChange={(e) => handleHexChange(e.target.value)}
            style={{
              width: '100%',
              padding: '8px',
              border: '1px solid #E5E7EB',
              borderRadius: '4px',
              fontSize: '13px',
              fontFamily: 'monospace',
              boxSizing: 'border-box',
            }}
            placeholder="#FFFFFF"
          />
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          {(['r', 'g', 'b'] as const).map((component) => (
            <div key={component} style={{ flex: 1 }}>
              <label style={{
                display: 'block',
                fontSize: '11px',
                color: '#6B7280',
                marginBottom: '4px',
                textTransform: 'uppercase',
              }}>
                {component}
              </label>
              <input
                type="number"
                min="0"
                max="255"
                value={derivedValues.rgb[component]}
                onChange={(e) => handleRgbChange(component, e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid #E5E7EB',
                  borderRadius: '4px',
                  fontSize: '13px',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          {(['h', 's', 'l'] as const).map((component) => (
            <div key={component} style={{ flex: 1 }}>
              <label style={{
                display: 'block',
                fontSize: '11px',
                color: '#6B7280',
                marginBottom: '4px',
                textTransform: 'uppercase',
              }}>
                {component === 'h' ? '色相' : component === 's' ? '饱和度' : '明度'}
                {component !== 'h' && '%'}
              </label>
              <input
                type="number"
                min={component === 'h' ? 0 : 0}
                max={component === 'h' ? 360 : 100}
                value={derivedValues.hsl[component]}
                readOnly
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid #E5E7EB',
                  borderRadius: '4px',
                  fontSize: '13px',
                  backgroundColor: '#F9FAFB',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          ))}
        </div>

        {recentColors.length > 0 && (
          <div>
            <label style={{
              display: 'block',
              fontSize: '11px',
              color: '#6B7280',
              marginBottom: '4px',
            }}>
              最近使用
            </label>
            <div style={{
              display: 'flex',
              gap: '4px',
              flexWrap: 'wrap',
            }}>
              {recentColors.map((color, index) => (
                <div
                  key={`recent-${index}`}
                  onClick={() => handleHexChange(color)}
                  style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '4px',
                    backgroundColor: color,
                    border: '1px solid #D1D5DB',
                    cursor: 'pointer',
                  }}
                  title={color}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
