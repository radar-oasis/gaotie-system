import { apiUrl } from '../../utils/backendUrls';

export interface EnhancementReference {
  id: string;
  name: string;
  motifs?: string[];
  layouts?: string[];
  materials?: string[];
  carriers?: string[];
}
export interface EnhancementDirection {
  id: 'preserve' | 'explore';
  title: string;
  prompt: string;
  retained: string[];
  changes: string[];
  checks: { label: string; status: 'pass' | 'warning'; detail: string }[];
}
export interface PromptEnhancement {
  originalPrompt: string;
  ruleVersion: string;
  model: string;
  contextMode: 'metadata-only';
  maxPromptLength: number;
  directions: EnhancementDirection[];
  warnings: string[];
}
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(item => typeof item === 'string');
export function parseEnhancement(value: unknown, original: string): PromptEnhancement {
  if (!record(value) || value.originalPrompt !== original || value.contextMode !== 'metadata-only' ||
      typeof value.ruleVersion !== 'string' || typeof value.model !== 'string' ||
      !Number.isInteger(value.maxPromptLength) || (value.maxPromptLength as number) < 1 || (value.maxPromptLength as number) > 800 ||
      !strings(value.warnings) || !Array.isArray(value.directions) || value.directions.length !== 2) throw new Error('优化结果格式不完整，请重试。');
  const directions = value.directions;
  if (!directions.every(direction => record(direction) && ['preserve', 'explore'].includes(String(direction.id)) &&
      typeof direction.title === 'string' && typeof direction.prompt === 'string' && !!direction.prompt.trim() &&
      direction.prompt.length <= (value.maxPromptLength as number) && strings(direction.retained) && strings(direction.changes) &&
      Array.isArray(direction.checks) && direction.checks.every(check => record(check) && typeof check.label === 'string' &&
        typeof check.detail === 'string' && ['pass', 'warning'].includes(String(check.status)))) ||
      new Set(directions.map(direction => direction.id)).size !== 2) throw new Error('优化方向不完整或长度超限，请重试。');
  return value as unknown as PromptEnhancement;
}

export async function enhancePrompt(input: { prompt: string; references: EnhancementReference[] }, signal: AbortSignal): Promise<PromptEnhancement> {
  // Explicit allowlist: never transmit layer src/data URLs or unrelated canvas metadata.
  const references = input.references.map(({ id, name, motifs, layouts, materials, carriers }) => ({ id, name, motifs, layouts, materials, carriers }));
  const response = await fetch(apiUrl('/super-canvas/enhance-prompt'), {
    method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: input.prompt, references }), signal,
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = record(body) && typeof body.message === 'string' ? body.message : '提示词优化暂不可用，请稍后重试。';
    throw new Error(message);
  }
  return parseEnhancement(body, input.prompt);
}
