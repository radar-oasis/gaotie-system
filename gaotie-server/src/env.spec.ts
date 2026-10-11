import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { loadEnvFiles } from './env';

describe('loadEnvFiles', () => {
  const originalEnv = { ...process.env };
  let envDir: string;

  beforeEach(async () => {
    process.env = { ...originalEnv };
    delete process.env.JIMENG_ACCESS_KEY_ID;
    delete process.env.JIMENG_SECRET_ACCESS_KEY;
    envDir = await mkdtemp(join(tmpdir(), 'gaotie-env-'));
  });

  afterEach(async () => {
    process.env = originalEnv;
    await rm(envDir, { force: true, recursive: true });
  });

  it('loads Jimeng credentials from env files', async () => {
    await writeFile(
      join(envDir, '.env.local'),
      [
        'JIMENG_ACCESS_KEY_ID=ak-from-file',
        'JIMENG_SECRET_ACCESS_KEY="sk from file"',
        '',
      ].join('\n'),
    );

    await loadEnvFiles([envDir]);

    expect(process.env.JIMENG_ACCESS_KEY_ID).toBe('ak-from-file');
    expect(process.env.JIMENG_SECRET_ACCESS_KEY).toBe('sk from file');
  });

  it('keeps existing environment variables over env file values', async () => {
    process.env.JIMENG_ACCESS_KEY_ID = 'ak-from-process';
    await writeFile(join(envDir, '.env'), 'JIMENG_ACCESS_KEY_ID=ak-from-file\n');

    await loadEnvFiles([envDir]);

    expect(process.env.JIMENG_ACCESS_KEY_ID).toBe('ak-from-process');
  });
});
