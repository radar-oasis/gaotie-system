import type { ChatInput } from './contract';

export function studioOutputSchema(input: ChatInput) {
  const string = (maxLength: number) => ({
    type: 'string',
    minLength: 1,
    maxLength,
  });
  const object = (properties: Record<string, unknown>) => ({
    type: 'object',
    additionalProperties: false,
    required: Object.keys(properties),
    properties,
  });
  const palette = object({
    name: string(100),
    rationale: string(8000),
    colors: {
      type: 'array',
      minItems: 1,
      maxItems: 8,
      items: object({
        hex: {
          type: 'string',
          ...(input.candidateColors?.length
            ? { enum: input.candidateColors.map((c) => c.toUpperCase()) }
            : { pattern: '^#[0-9A-Fa-f]{6}$' }),
        },
        role: string(100),
        proportion: { type: 'number', exclusiveMinimum: 0, maximum: 100 },
      }),
    },
  });
  return object({
    reply: string(16000),
    images: {
      type: 'array',
      maxItems: input.mode === 'palette' ? 0 : 6,
      items: object({
        id: string(100),
        title: string(300),
        imageUrl: string(2048),
        sourceUrl: string(2048),
      }),
    },
    palette:
      input.mode === 'palette'
        ? palette
        : { anyOf: [palette, { type: 'null' }] },
  });
}
