import { createVolcengineSignedRequest } from './volcengine-signer';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('createVolcengineSignedRequest', () => {
  const baseInput = {
    accessKeyId: 'AKTEST',
    secretAccessKey: 'SKTEST',
    body: '{}',
    now: new Date('2026-05-09T00:00:00.000Z'),
  };

  it('creates a signed Jimeng cv request with deterministic headers', () => {
    const request = createVolcengineSignedRequest({
      accessKeyId: 'AKTEST',
      secretAccessKey: 'SKTEST',
      action: 'CVSync2AsyncSubmitTask',
      version: '2022-08-31',
      body: JSON.stringify({ req_key: 'jimeng_t2i_v40', prompt: '龙纹' }),
      now: new Date('2026-05-09T00:00:00.000Z'),
    });

    expect(request.method).toBe('POST');
    expect(request.url).toBe(
      'https://visual.volcengineapi.com/?Action=CVSync2AsyncSubmitTask&Version=2022-08-31',
    );
    expect(request.headers['content-type']).toBe('application/json');
    expect(request.headers.host).toBe('visual.volcengineapi.com');
    expect(request.headers['x-date']).toBe('20260509T000000Z');
    expect(request.headers['x-content-sha256']).toBe(
      '5e331b42abf35a3cd4099948d25dbc03656751bd34ca8d7c3652ed1aec414c0b',
    );
    expect(request.headers.authorization).toBe(
      'HMAC-SHA256 Credential=AKTEST/20260509/cn-north-1/cv/request, SignedHeaders=content-type;host;x-content-sha256;x-date, Signature=43c312b2e446c2abc13c8329b0ad7028dda91c9d0d6be0098cf84d6972fbf182',
    );
  });

  it('encodes query parameter values that need escaping', () => {
    const request = createVolcengineSignedRequest({
      ...baseInput,
      action: 'CV Sync/Submit Task',
      version: '2022-08-31+draft&beta',
    });

    expect(request.url).toBe(
      'https://visual.volcengineapi.com/?Action=CV%20Sync%2FSubmit%20Task&Version=2022-08-31%2Bdraft%26beta',
    );
  });

  it('orders canonical query parameters by encoded bytes', () => {
    const request = createVolcengineSignedRequest({
      ...baseInput,
      action: 'action',
      version: 'version',
    });

    expect(request.url).toBe(
      'https://visual.volcengineapi.com/?Action=action&Version=version',
    );
  });

  it('does not use locale-dependent sorting for canonical query parameters', () => {
    const source = readFileSync(
      join(__dirname, 'volcengine-signer.ts'),
      'utf8',
    );

    expect(source).not.toContain('localeCompare');
  });

  it('formats x-date from the UTC instant rather than local timezone text', () => {
    const request = createVolcengineSignedRequest({
      ...baseInput,
      action: 'CVSync2AsyncSubmitTask',
      version: '2022-08-31',
      now: new Date('2026-05-09T08:30:45.123+08:00'),
    });

    expect(request.headers['x-date']).toBe('20260509T003045Z');
    expect(request.headers.authorization).toContain(
      'Credential=AKTEST/20260509/cn-north-1/cv/request',
    );
  });

  it('changes payload hash and signature when a non-ASCII body changes', () => {
    const firstRequest = createVolcengineSignedRequest({
      ...baseInput,
      action: 'CVSync2AsyncSubmitTask',
      version: '2022-08-31',
      body: JSON.stringify({ prompt: '龙纹' }),
    });
    const secondRequest = createVolcengineSignedRequest({
      ...baseInput,
      action: 'CVSync2AsyncSubmitTask',
      version: '2022-08-31',
      body: JSON.stringify({ prompt: '凤纹' }),
    });

    expect(firstRequest.headers['x-content-sha256']).not.toBe(
      secondRequest.headers['x-content-sha256'],
    );
    expect(firstRequest.headers.authorization).not.toBe(
      secondRequest.headers.authorization,
    );
  });
});
