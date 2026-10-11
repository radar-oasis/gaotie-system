import { readFile } from 'fs/promises';
import { join } from 'path';

const ENV_FILE_NAMES = ['.env', '.env.local'];

export async function loadEnvFiles(directories: string[]): Promise<void> {
  for (const directory of directories) {
    for (const fileName of ENV_FILE_NAMES) {
      await loadEnvFile(join(directory, fileName));
    }
  }
}

export async function loadDefaultEnvFiles(): Promise<void> {
  const cwd = process.cwd();
  await loadEnvFiles([cwd, join(cwd, 'gaotie-server')]);
}

async function loadEnvFile(filePath: string): Promise<void> {
  let content: string;

  try {
    content = await readFile(filePath, 'utf8');
  } catch (error) {
    if (isMissingFileError(error)) {
      return;
    }

    throw error;
  }

  for (const line of content.split(/\r?\n/)) {
    const entry = parseEnvLine(line);

    if (!entry || process.env[entry.key] !== undefined) {
      continue;
    }

    process.env[entry.key] = entry.value;
  }
}

function parseEnvLine(line: string): { key: string; value: string } | undefined {
  const trimmed = line.trim();

  if (!trimmed || trimmed.startsWith('#')) {
    return undefined;
  }

  const separatorIndex = trimmed.indexOf('=');

  if (separatorIndex <= 0) {
    return undefined;
  }

  const key = trimmed.slice(0, separatorIndex).trim();

  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
    return undefined;
  }

  return {
    key,
    value: unquoteEnvValue(trimmed.slice(separatorIndex + 1).trim()),
  };
}

function unquoteEnvValue(value: string): string {
  if (value.length < 2) {
    return value;
  }

  const quote = value[0];
  const last = value[value.length - 1];

  if ((quote === '"' || quote === "'") && quote === last) {
    return value.slice(1, -1);
  }

  return value;
}

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ENOENT'
  );
}
