import {
  BadGatewayException,
  BadRequestException,
  GatewayTimeoutException,
  HttpException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { TRANSPARENT_ASSET_PROMPT_BODY_LIMIT } from './motif-prompt';
import {
  PROMPT_ENHANCER_RULE_VERSION,
  PROMPT_ENHANCER_SYSTEM_RULES,
} from './prompt-enhancer.rules';

interface ReferenceMetadata {
  id: string;
  name: string;
  motifs?: string[];
  layouts?: string[];
  materials?: string[];
  carriers?: string[];
}
interface EnhancementInput {
  prompt: string;
  references: ReferenceMetadata[];
}
interface Direction {
  id: 'preserve' | 'explore';
  title: string;
  prompt: string;
  retained: string[];
  changes: string[];
  checks: { label: string; status: 'pass' | 'warning'; detail: string }[];
}
export interface PromptEnhancementResult {
  originalPrompt: string;
  ruleVersion: string;
  model: string;
  contextMode: 'metadata-only';
  maxPromptLength: number;
  directions: Direction[];
  warnings: string[];
}

@Injectable()
export class PromptEnhancerService {
  private activeRequests = 0;

  async enhance(value: unknown): Promise<PromptEnhancementResult> {
    const input = parseInput(value);
    const apiKey =
      process.env.PROMPT_ENHANCER_API_KEY?.trim() ||
      process.env.DEEPSEEK_API_KEY?.trim();
    if (!apiKey)
      throw new ServiceUnavailableException('提示词增强服务尚未配置');
    const model =
      process.env.PROMPT_ENHANCER_MODEL?.trim() ||
      process.env.DEEPSEEK_MODEL?.trim() ||
      'deepseek-chat';
    const baseUrl =
      process.env.PROMPT_ENHANCER_BASE_URL?.trim() ||
      process.env.DEEPSEEK_BASE_URL?.trim() ||
      'https://api.deepseek.com';
    if (this.activeRequests >= 2)
      throw new HttpException('提示词增强服务繁忙，请稍后重试', 429);
    this.activeRequests += 1;
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new GatewayTimeoutException('提示词增强请求超时，请重试'));
          abort.abort();
        }, 30_000);
      });
      const request = async () => {
        const response = await fetch(
          `${baseUrl.replace(/\/+$/, '')}/chat/completions`,
          {
            method: 'POST',
            signal: abort.signal,
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model,
              temperature: 0.4,
              max_tokens: 2400,
              response_format: { type: 'json_object' },
              messages: [
                { role: 'system', content: PROMPT_ENHANCER_SYSTEM_RULES },
                { role: 'user', content: JSON.stringify(input) },
              ],
            }),
          },
        );
        if (!response.ok) throw new Error('provider request failed');
        // Bound the response while streaming so malformed providers cannot grow memory without limit.
        const reader = response.body?.getReader();
        if (!reader) throw invalidOutput();
        const decoder = new TextDecoder();
        let raw = '';
        let bytes = 0;
        try {
          while (true) {
            const part = await reader.read();
            if (part.done) break;
            bytes += part.value.byteLength;
            if (bytes > 64_000) {
              void reader.cancel().catch(() => {});
              throw invalidOutput();
            }
            raw += decoder.decode(part.value, { stream: true });
          }
          raw += decoder.decode();
        } finally {
          reader.releaseLock();
        }
        try {
          const envelope: unknown = JSON.parse(raw);
          const choices = record(envelope)?.choices;
          if (!Array.isArray(choices)) throw invalidOutput();
          const content = record(record(choices[0])?.message)?.content;
          if (typeof content !== 'string' || content.length > 20_000)
            throw invalidOutput();
          return parseDirections(JSON.parse(content));
        } catch {
          throw invalidOutput();
        }
      };
      const directions = await Promise.race([request(), timeout]);
      return {
        originalPrompt: input.prompt,
        ruleVersion: PROMPT_ENHANCER_RULE_VERSION,
        model,
        contextMode: 'metadata-only',
        maxPromptLength: TRANSPARENT_ASSET_PROMPT_BODY_LIMIT,
        directions,
        warnings: [
          '仅使用文字与参考元数据，未读取图片；保留项和变化项为模型建议，请人工核对硬约束。',
          '尚未生成图片，检查不代表实际出图效果。',
          ...(input.references.length > 1
            ? [
                '已选择多个参考。如原文未指定各参考角色，请先确认各自用途；参考顺序不代表主次，不默认融合。',
              ]
            : []),
        ],
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new BadGatewayException('提示词增强服务暂时不可用，请重试');
    } finally {
      if (timer) clearTimeout(timer);
      this.activeRequests -= 1;
    }
  }
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
function text(value: unknown, max: number): value is string {
  return typeof value === 'string' && !!value.trim() && value.length <= max;
}
function list(value: unknown, max: number, min = 0): value is string[] {
  return (
    Array.isArray(value) &&
    value.length >= min &&
    value.length <= max &&
    value.every((item) => text(item, 160))
  );
}
function parseInput(value: unknown): EnhancementInput {
  const body = record(value);
  if (
    !body ||
    !text(body.prompt, 2000) ||
    Object.keys(body).some((key) => !['prompt', 'references'].includes(key))
  )
    throw new BadRequestException(
      'prompt 必须为 1 至 2000 字符的文字，仅接受参考元数据',
    );
  const refs = body.references === undefined ? [] : body.references;
  if (!Array.isArray(refs) || refs.length > 8)
    throw new BadRequestException('最多选择 8 个参考纹样');
  const ids = new Set<string>();
  const references = refs.map((value) => {
    const ref = record(value);
    if (
      !ref ||
      !text(ref.id, 100) ||
      !text(ref.name, 160) ||
      ids.has(ref.id) ||
      Object.keys(ref).some(
        (key) =>
          ![
            'id',
            'name',
            'motifs',
            'layouts',
            'materials',
            'carriers',
          ].includes(key),
      )
    )
      throw new BadRequestException('参考纹样仅接受唯一 id、名称与文字元数据');
    ids.add(ref.id);
    const result: ReferenceMetadata = { id: ref.id, name: ref.name };
    for (const key of ['motifs', 'layouts', 'materials', 'carriers'] as const) {
      if (ref[key] !== undefined) {
        if (!list(ref[key], 12))
          throw new BadRequestException(
            '参考元数据必须为最多 12 项、每项最多 160 字符的文字列表',
          );
        result[key] = ref[key];
      }
    }
    return result;
  });
  const input = { prompt: body.prompt, references };
  if (JSON.stringify(input).length > 24_000)
    throw new BadRequestException('参考元数据过长，请减少所选参考');
  return input;
}
function invalidOutput() {
  return new BadGatewayException('提示词增强服务返回无效内容，请重试');
}
function parseDirections(value: unknown): Direction[] {
  const directions = record(value)?.directions;
  if (!Array.isArray(directions) || directions.length !== 2)
    throw invalidOutput();
  const seen = new Set<string>();
  const prompts = new Set<string>();
  const result = directions.map((value) => {
    const d = record(value);
    if (
      !d ||
      (d.id !== 'preserve' && d.id !== 'explore') ||
      seen.has(d.id) ||
      !text(d.title, 40) ||
      !text(d.prompt, TRANSPARENT_ASSET_PROMPT_BODY_LIMIT) ||
      !list(d.retained, 6, 1) ||
      !list(d.changes, 6, 1) ||
      (d.uncertainties !== undefined && !list(d.uncertainties, 6))
    )
      throw invalidOutput();
    const prompt = d.prompt.trim();
    const normalized = prompt.replace(/\s/g, '');
    if (prompts.has(normalized)) throw invalidOutput();
    prompts.add(normalized);
    seen.add(d.id);
    const uncertainties = (d.uncertainties ?? []) as string[];
    return {
      id: d.id,
      title: d.title.trim(),
      prompt,
      retained: d.retained,
      changes: d.changes,
      checks: [
        ...uncertainties.map((detail) => ({
          label: '模型建议 · 本次待确认',
          status: 'warning' as const,
          detail,
        })),
        {
          label: '程序检查 · 长度与结构',
          status: 'pass' as const,
          detail: `正文 ${prompt.length}/${TRANSPARENT_ASSET_PROMPT_BODY_LIMIT} 字符；两个独立方向，必要字段完整。`,
        },
        {
          label: '模型建议 · 原文约束与改动',
          status: 'warning' as const,
          detail:
            '保留项和变化项由模型提出；请逐项核对原文，程序未验证语义一致性。',
        },
        {
          label: '上下文范围',
          status: 'warning' as const,
          detail: '仅有参考元数据，未读取参考图，也未验证出图效果。',
        },
      ],
    } satisfies Direction;
  });
  return result.sort((a, b) =>
    a.id === b.id ? 0 : a.id === 'preserve' ? -1 : 1,
  );
}
