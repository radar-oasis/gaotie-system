import { createHash, createHmac } from 'crypto';

const VOLCENGINE_HOST = 'visual.volcengineapi.com';
const VOLCENGINE_REGION = 'cn-north-1';
const VOLCENGINE_SERVICE = 'cv';
const ALGORITHM = 'HMAC-SHA256';
const SIGNED_HEADERS = 'content-type;host;x-content-sha256;x-date';

export interface CreateVolcengineSignedRequestInput {
  accessKeyId: string;
  secretAccessKey: string;
  action: string;
  version: string;
  body: string;
  now?: Date;
}

export interface VolcengineSignedRequest {
  method: 'POST';
  url: string;
  headers: {
    'content-type': 'application/json';
    host: typeof VOLCENGINE_HOST;
    'x-date': string;
    'x-content-sha256': string;
    authorization: string;
  };
  body: string;
}

export function createVolcengineSignedRequest(
  input: CreateVolcengineSignedRequestInput,
): VolcengineSignedRequest {
  const now = input.now ?? new Date();
  const xDate = formatXDate(now);
  const shortDate = xDate.slice(0, 8);
  const credentialScope = [
    shortDate,
    VOLCENGINE_REGION,
    VOLCENGINE_SERVICE,
    'request',
  ].join('/');
  const canonicalQueryString = canonicalizeQuery({
    Action: input.action,
    Version: input.version,
  });
  const payloadHash = sha256Hex(input.body);
  const canonicalRequest = [
    'POST',
    '/',
    canonicalQueryString,
    [
      'content-type:application/json',
      `host:${VOLCENGINE_HOST}`,
      `x-content-sha256:${payloadHash}`,
      `x-date:${xDate}`,
    ].join('\n'),
    '',
    SIGNED_HEADERS,
    payloadHash,
  ].join('\n');
  const stringToSign = [
    ALGORITHM,
    xDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n');
  const signature = hmacHex(
    signingKey(input.secretAccessKey, shortDate),
    stringToSign,
  );

  return {
    method: 'POST',
    url: `https://${VOLCENGINE_HOST}/?${canonicalQueryString}`,
    headers: {
      'content-type': 'application/json',
      host: VOLCENGINE_HOST,
      'x-date': xDate,
      'x-content-sha256': payloadHash,
      authorization: `${ALGORITHM} Credential=${input.accessKeyId}/${credentialScope}, SignedHeaders=${SIGNED_HEADERS}, Signature=${signature}`,
    },
    body: input.body,
  };
}

function canonicalizeQuery(params: Record<string, string>) {
  return Object.entries(params)
    .map(([key, value]) => [uriEncode(key), uriEncode(value)] as const)
    .sort(([leftKey, leftValue], [rightKey, rightValue]) => {
      if (leftKey !== rightKey) {
        return compareAscii(leftKey, rightKey);
      }

      return compareAscii(leftValue, rightValue);
    })
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
}

function compareAscii(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function formatXDate(date: Date) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, '');
}

function sha256Hex(value: string) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function signingKey(secretAccessKey: string, shortDate: string) {
  const dateKey = hmacBuffer(secretAccessKey, shortDate);
  const regionKey = hmacBuffer(dateKey, VOLCENGINE_REGION);
  const serviceKey = hmacBuffer(regionKey, VOLCENGINE_SERVICE);

  return hmacBuffer(serviceKey, 'request');
}

function hmacBuffer(key: string | Buffer, value: string) {
  return createHmac('sha256', key).update(value, 'utf8').digest();
}

function hmacHex(key: string | Buffer, value: string) {
  return createHmac('sha256', key).update(value, 'utf8').digest('hex');
}

function uriEncode(value: string) {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}
