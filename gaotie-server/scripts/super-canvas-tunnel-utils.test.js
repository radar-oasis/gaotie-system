const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const {
  findLatestTunnelUrl,
  upsertEnvValue,
} = require('./super-canvas-tunnel-utils');

describe('findLatestTunnelUrl', () => {
  it('returns the newest trycloudflare URL from log text', () => {
    const logText = [
      'Visit it at https://first-demo.trycloudflare.com',
      'Visit it at https://newest-demo.trycloudflare.com',
    ].join('\n');

    assert.equal(
      findLatestTunnelUrl(logText),
      'https://newest-demo.trycloudflare.com',
    );
  });

  it('returns undefined when there is no tunnel URL', () => {
    assert.equal(findLatestTunnelUrl('Requesting new quick Tunnel'), undefined);
  });
});

describe('upsertEnvValue', () => {
  it('updates an existing value without changing other lines', () => {
    assert.equal(
      upsertEnvValue(
        [
          'JIMENG_ACCESS_KEY_ID=AKTEST',
          'SUPER_CANVAS_PUBLIC_BASE_URL=https://old.trycloudflare.com',
          '',
        ].join('\n'),
        'SUPER_CANVAS_PUBLIC_BASE_URL',
        'https://new.trycloudflare.com',
      ),
      [
        'JIMENG_ACCESS_KEY_ID=AKTEST',
        'SUPER_CANVAS_PUBLIC_BASE_URL=https://new.trycloudflare.com',
        '',
      ].join('\n'),
    );
  });

  it('appends a missing value', () => {
    assert.equal(
      upsertEnvValue(
        'JIMENG_ACCESS_KEY_ID=AKTEST\n',
        'SUPER_CANVAS_PUBLIC_BASE_URL',
        'https://new.trycloudflare.com',
      ),
      [
        'JIMENG_ACCESS_KEY_ID=AKTEST',
        'SUPER_CANVAS_PUBLIC_BASE_URL=https://new.trycloudflare.com',
        '',
      ].join('\n'),
    );
  });
});
