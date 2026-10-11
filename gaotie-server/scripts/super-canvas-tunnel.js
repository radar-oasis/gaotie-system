#!/usr/bin/env node

const { existsSync, mkdirSync, readFileSync, writeFileSync } = require('node:fs');
const { dirname, join, resolve } = require('node:path');
const { execFileSync, spawn, spawnSync } = require('node:child_process');
const { findLatestTunnelUrl, upsertEnvValue } = require('./super-canvas-tunnel-utils');

const serverDir = resolve(__dirname, '..');
const repoRoot = resolve(serverDir, '..');
const logsDir = join(repoRoot, '.logs');
const envPath = join(serverDir, '.env.local');
const cloudflaredLogPath = join(logsDir, 'cloudflared-launchd.log');
const cloudflaredErrorPath = join(logsDir, 'cloudflared-launchd.err');
const cloudflaredPlistPath = join(logsDir, 'gaotie-cloudflared.plist');
const launchdLabel = 'gaotie-cloudflared';
const localBackendUrl = process.env.SUPER_CANVAS_TUNNEL_TARGET ?? 'http://localhost:3000';
const publicBaseEnvKey = 'SUPER_CANVAS_PUBLIC_BASE_URL';

async function main() {
  mkdirSync(logsDir, { recursive: true });
  ensureCloudflaredExists();
  writeFileSync(cloudflaredLogPath, '');
  writeFileSync(cloudflaredErrorPath, '');

  if (process.platform === 'darwin') {
    startWithLaunchd();
  } else {
    startDetached();
  }

  const tunnelUrl = await waitForTunnelUrl();
  updateEnvFile(tunnelUrl);
  updateServerLaunchdPlistIfPresent(tunnelUrl);

  console.log(`SUPER_CANVAS_PUBLIC_BASE_URL=${tunnelUrl}`);
  console.log(`Updated ${envPath}`);
}

function ensureCloudflaredExists() {
  const result = spawnSync(resolveCloudflaredCommand(), ['--version'], {
    encoding: 'utf8',
  });

  if (result.error || result.status !== 0) {
    throw new Error(
      'cloudflared is required. Install it first, then rerun npm run tunnel:sync.',
    );
  }
}

function resolveCloudflaredCommand() {
  if (process.env.CLOUDFLARED_BIN) {
    return process.env.CLOUDFLARED_BIN;
  }

  if (existsSync('/opt/homebrew/bin/cloudflared')) {
    return '/opt/homebrew/bin/cloudflared';
  }

  return 'cloudflared';
}

function startWithLaunchd() {
  writeFileSync(cloudflaredPlistPath, createCloudflaredPlist());

  try {
    execFileSync('launchctl', [
      'bootout',
      `gui/${process.getuid()}`,
      cloudflaredPlistPath,
    ]);
  } catch {
    // The service may not be loaded yet.
  }

  execFileSync('launchctl', [
    'bootstrap',
    `gui/${process.getuid()}`,
    cloudflaredPlistPath,
  ]);
  execFileSync('launchctl', ['kickstart', '-k', `gui/${process.getuid()}/${launchdLabel}`]);
}

function startDetached() {
  const output = require('node:fs').openSync(cloudflaredLogPath, 'a');
  const error = require('node:fs').openSync(cloudflaredErrorPath, 'a');
  const child = spawn(resolveCloudflaredCommand(), ['tunnel', '--url', localBackendUrl], {
    detached: true,
    stdio: ['ignore', output, error],
  });
  child.unref();
}

function createCloudflaredPlist() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${launchdLabel}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${escapeXml(resolveCloudflaredCommand())}</string>
    <string>tunnel</string>
    <string>--url</string>
    <string>${escapeXml(localBackendUrl)}</string>
  </array>
  <key>StandardOutPath</key>
  <string>${escapeXml(cloudflaredLogPath)}</string>
  <key>StandardErrorPath</key>
  <string>${escapeXml(cloudflaredErrorPath)}</string>
  <key>RunAtLoad</key>
  <true/>
</dict>
</plist>
`;
}

async function waitForTunnelUrl() {
  const deadline = Date.now() + 60_000;

  while (Date.now() < deadline) {
    const logText = readIfExists(cloudflaredLogPath) + '\n' + readIfExists(cloudflaredErrorPath);
    const tunnelUrl = findLatestTunnelUrl(logText);

    if (tunnelUrl) {
      return tunnelUrl;
    }

    await new Promise((resolveTimeout) => setTimeout(resolveTimeout, 1_000));
  }

  throw new Error(
    `Timed out waiting for cloudflared tunnel URL. Check ${cloudflaredErrorPath}`,
  );
}

function updateEnvFile(tunnelUrl) {
  const currentEnv = readIfExists(envPath);
  writeFileSync(envPath, upsertEnvValue(currentEnv, publicBaseEnvKey, tunnelUrl), {
    mode: 0o600,
  });
}

function updateServerLaunchdPlistIfPresent(tunnelUrl) {
  const serverPlistPath = join(logsDir, 'gaotie-server-codex.plist');

  if (!existsSync(serverPlistPath)) {
    return;
  }

  const plist = readFileSync(serverPlistPath, 'utf8');
  const updated = plist.replace(
    /(<key>SUPER_CANVAS_PUBLIC_BASE_URL<\/key>\s*<string>)([^<]*)(<\/string>)/,
    `$1${tunnelUrl}$3`,
  );

  if (updated !== plist) {
    writeFileSync(serverPlistPath, updated);
  }
}

function readIfExists(filePath) {
  try {
    return readFileSync(filePath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      return '';
    }

    throw error;
  }
}

function escapeXml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
