import { requireLocalImageAccess } from './local-image-access';
import { AuthService } from './auth.service';
import { Request } from 'express';

describe('local image access', () => {
  const old = process.env.LOCAL_CODEX_IMAGE_ENABLED;
  afterEach(() => {
    if (old === undefined) delete process.env.LOCAL_CODEX_IMAGE_ENABLED;
    else process.env.LOCAL_CODEX_IMAGE_ENABLED = old;
  });
  const auth = {
    getSessionTokenFromCookieHeader: () => 'token',
    getUserBySessionToken: jest.fn(async () => ({ id: 'u' })),
  } as unknown as AuthService;
  const request = (
    ip = '127.0.0.1',
    host = '127.0.0.1:3001',
    origin = 'http://127.0.0.1:5173',
  ) =>
    ({
      socket: { remoteAddress: ip },
      headers: { host, origin, cookie: 'session=token' },
    }) as Request;
  it('requires authenticated loopback socket, local host and trusted origin', async () => {
    process.env.LOCAL_CODEX_IMAGE_ENABLED = 'true';
    await expect(
      requireLocalImageAccess(auth, request()),
    ).resolves.toBeUndefined();
    await expect(
      requireLocalImageAccess(auth, request('10.1.1.1')),
    ).rejects.toThrow();
    await expect(
      requireLocalImageAccess(auth, request('127.0.0.1', 'attacker.example')),
    ).rejects.toThrow();
    await expect(
      requireLocalImageAccess(
        auth,
        request('127.0.0.1', '127.0.0.1:3001', 'https://attacker.example'),
      ),
    ).rejects.toThrow();
    await expect(
      requireLocalImageAccess(undefined, request()),
    ).rejects.toThrow();
  });
  it('does not change legacy access when local adapter is disabled', async () => {
    delete process.env.LOCAL_CODEX_IMAGE_ENABLED;
    await expect(
      requireLocalImageAccess(undefined, undefined),
    ).resolves.toBeUndefined();
  });
});
