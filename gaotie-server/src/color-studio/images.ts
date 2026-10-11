import { BadRequestException } from '@nestjs/common';
import { lookup } from 'node:dns/promises';
import { request } from 'node:https';
import ipaddr from 'ipaddr.js';
export const MAX_BYTES = 10 * 1024 * 1024;
export function isPublicIp(ip: string): boolean {
  try {
    const a = ipaddr.process(ip);
    return a.range() === 'unicast';
  } catch {
    return false;
  }
}
export function validateRemoteUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new BadRequestException('图片地址无效');
  }
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (
    value.length > 2048 ||
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    (url.port && url.port !== '443') ||
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.') ||
    (!host.includes('.') && !host.includes(':')) ||
    (ipaddr.isValid(host) && !isPublicIp(host))
  )
    throw new BadRequestException('仅支持公网 HTTPS 图片地址');
  return url;
}
type Address = { address: string; family: number };
export function pinnedLookup(address: Address): any {
  return (_h, opts, cb) =>
    opts?.all ? cb(null, [address]) : cb(null, address.address, address.family);
}
type TransportResult = { status: number; mime: string; bytes: Buffer };
async function transport(url: URL, address: Address): Promise<TransportResult> {
  return new Promise((resolve, reject) => {
    const req = request(
      url,
      {
        agent: false,
        lookup: pinnedLookup(address),
        headers: {
          'User-Agent': 'GaotieColorStudio/1.0',
          Accept: 'image/png,image/jpeg,image/webp',
        },
      },
      (res) => {
        const mime = String(res.headers['content-type'] || '')
          .split(';')[0]
          .toLowerCase();
        if (
          res.statusCode !== 200 ||
          !['image/png', 'image/jpeg', 'image/webp'].includes(mime) ||
          Number(res.headers['content-length']) > MAX_BYTES
        ) {
          res.destroy();
          req.destroy();
          reject(
            new BadRequestException('图片响应无效、发生重定向或超过 10 MB'),
          );
          return;
        }
        let size = 0;
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_BYTES) {
            res.destroy();
            req.destroy();
            reject(new BadRequestException('图片超过 10 MB'));
          } else chunks.push(chunk);
        });
        res.on('end', () =>
          resolve({
            status: res.statusCode!,
            mime,
            bytes: Buffer.concat(chunks),
          }),
        );
        res.on('error', () => reject(new BadRequestException('图片下载失败')));
      },
    );
    const timer = setTimeout(() => req.destroy(new Error('timeout')), 15000);
    req.on('close', () => clearTimeout(timer));
    req.on('error', () =>
      reject(new BadRequestException('图片下载失败或超时')),
    );
    req.end();
  });
}
export async function downloadImage(
  value: string,
  deps: {
    resolve?: (host: string) => Promise<Address[]>;
    transport?: typeof transport;
  } = {},
): Promise<Buffer> {
  const url = validateRemoteUrl(value);
  const host = url.hostname.replace(/^\[|\]$/g, '');
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const addresses = await Promise.race([
      (deps.resolve ?? ((h) => lookup(h, { all: true })))(host),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new BadRequestException('图片域名解析超时')),
          5000,
        );
      }),
    ]);
    if (!addresses.length || addresses.some((a) => !isPublicIp(a.address)))
      throw new BadRequestException('图片域名指向非公网地址');
    // The validated address is pinned into the socket lookup; no second DNS lookup or redirects.
    const result = await (deps.transport ?? transport)(url, addresses[0]);
    if (
      result.status !== 200 ||
      !['image/png', 'image/jpeg', 'image/webp'].includes(result.mime) ||
      !result.bytes.length ||
      result.bytes.length > MAX_BYTES
    )
      throw new BadRequestException('图片响应无效或超过 10 MB');
    return result.bytes;
  } catch (e) {
    if (e instanceof BadRequestException) throw e;
    throw new BadRequestException('图片地址无法访问');
  } finally {
    if (timer) clearTimeout(timer);
  }
}
