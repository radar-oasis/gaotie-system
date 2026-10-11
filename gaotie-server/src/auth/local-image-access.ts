import { ForbiddenException } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { requireUserFromRequest } from './auth.controller';

export async function requireLocalImageAccess(
  auth?: AuthService,
  request?: Request,
): Promise<void> {
  if (process.env.LOCAL_CODEX_IMAGE_ENABLED !== 'true') return;
  const loopback = ['127.0.0.1', '::1', '::ffff:127.0.0.1'];
  if (
    !auth ||
    !request ||
    !loopback.includes(request.socket?.remoteAddress ?? '')
  )
    throw new ForbiddenException('Codex 生图仅允许本机已登录用户使用');
  const localHost = (host: string) =>
    ['localhost', '127.0.0.1', '[::1]'].includes(host);
  try {
    if (!localHost(new URL(`http://${request.headers.host}`).hostname))
      throw new Error();
    const origin = request.headers.origin;
    if (origin) {
      const parsed = new URL(origin);
      if (
        !localHost(parsed.hostname) ||
        parsed.protocol !== 'http:' ||
        !['5173', process.env.PORT || '3000'].includes(parsed.port)
      )
        throw new Error();
    }
  } catch {
    throw new ForbiddenException('Codex 生图仅允许从本地系统页面调用');
  }
  await requireUserFromRequest(auth, request);
}
