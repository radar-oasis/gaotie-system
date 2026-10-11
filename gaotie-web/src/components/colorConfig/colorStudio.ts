import type { ColorScheme } from '../../context/ColorConfigContext';

export interface StudioImage { id: string; title: string; imageUrl: string; sourceUrl: string }
export interface StudioColor { hex: string; role: string; proportion: number }
export interface StudioPalette { id: string; name: string; colors: StudioColor[]; rationale: string; source: 'image' | 'suggestion'; createdAt: string }
export interface StudioBoard { id: string; name: string; images: StudioImage[]; createdAt: string }
export interface StudioMessage { id: string; role: 'user' | 'assistant'; text: string }
export interface ColorStudioState {
  pendingOperation?: string; operationNotice?: string;
  messages: StudioMessage[]; images: StudioImage[]; boards: StudioBoard[];
  palettes: StudioPalette[]; activePaletteId: string | null; autoSearchKey: string;
  lastCandidates: string[]; draftPalette: StudioPalette | null;
}
export const emptyStudio = (): ColorStudioState => ({ pendingOperation: '', operationNotice: '', messages: [], images: [], boards: [], palettes: [], activePaletteId: null, autoSearchKey: '', lastCandidates: [], draftPalette: null });
const hex = (x: unknown): x is string => typeof x === 'string' && /^#[0-9a-f]{6}$/i.test(x);
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown): v is string => typeof v === 'string';
export function safeStudioImageUrl(v: unknown): v is string {
  if (!str(v)) return false;
  if (/^\/color-studio\/uploads\/[a-z0-9-]+\.png$/i.test(v)) return true;
  try { const u = new URL(v); return u.protocol === 'https:' && !u.username && !u.password; } catch { return false; }
}
const validImage = (v: unknown): v is StudioImage => record(v) && str(v.id) && str(v.title) && safeStudioImageUrl(v.imageUrl) && str(v.sourceUrl) && (!v.sourceUrl || /^https?:\/\//.test(v.sourceUrl));
const validColor = (v: unknown): v is StudioColor => record(v) && hex(v.hex) && str(v.role) && typeof v.proportion === 'number' && v.proportion >= 0 && v.proportion <= 100;
const validPalette = (v: unknown): v is StudioPalette => record(v) && str(v.id) && str(v.name) && str(v.createdAt) && str(v.rationale) && (v.source === 'image' || v.source === 'suggestion') && Array.isArray(v.colors) && v.colors.length > 0 && v.colors.length <= 12 && v.colors.every(validColor) && Math.abs(v.colors.reduce((n,c)=>n+c.proportion,0)-100) < 0.01;
export function normalizeStudio(value: unknown): ColorStudioState {
  const s = record(value) ? value : {};
  const list = (v: unknown): unknown[] => Array.isArray(v) ? v : [];
  const palettes = list(s.palettes).filter(validPalette);
  return {
    pendingOperation: str(s.pendingOperation) ? s.pendingOperation : '',
    operationNotice: str(s.operationNotice) ? s.operationNotice : '',
    messages: list(s.messages).filter((m): m is StudioMessage => record(m) && str(m.id) && (m.role === 'user' || m.role === 'assistant') && str(m.text)),
    images: list(s.images).filter(validImage),
    boards: list(s.boards).filter((b): b is StudioBoard => record(b) && str(b.id) && str(b.name) && str(b.createdAt) && Array.isArray(b.images) && b.images.every(validImage)),
    palettes, activePaletteId: s.activePaletteId === '__legacy__' ? '__legacy__' : palettes.some(p=>p.id === s.activePaletteId) ? s.activePaletteId as string : null,
    autoSearchKey: str(s.autoSearchKey) ? s.autoSearchKey : '', lastCandidates: list(s.lastCandidates).filter(hex),
    draftPalette: validPalette(s.draftPalette) ? s.draftPalette : null,
  };
}
export const buildStudioContext = (tags: {label:string;topic?:string}[], motifs: string[], demands: string[]): string[] => [...new Set([
  ...tags.map(t=>`${t.topic || '主题'}：${t.label}`), ...motifs.map(m=>`意象：${m}`), ...demands.slice(-4).map(t=>`用户需求：${t.slice(0,600)}`),
])].slice(0,30);
export const paletteToScheme = (p: StudioPalette): ColorScheme => ({id:p.id,name:p.name,layoutSchemeId:'',regions:[],palette:p.colors.map(c=>c.hex),createdAt:p.createdAt,mode:'reference',colorRoles:p.colors,rationale:p.rationale});
