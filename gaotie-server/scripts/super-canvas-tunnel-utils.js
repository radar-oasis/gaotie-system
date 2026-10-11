const TUNNEL_URL_PATTERN = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/g;

function findLatestTunnelUrl(logText) {
  const matches = logText.match(TUNNEL_URL_PATTERN);
  return matches?.at(-1);
}

function upsertEnvValue(envText, key, value) {
  const line = `${key}=${value}`;
  const lines = envText.split(/\r?\n/);
  const index = lines.findIndex((currentLine) =>
    currentLine.trimStart().startsWith(`${key}=`),
  );

  if (index >= 0) {
    lines[index] = line;
  } else {
    if (lines.length > 0 && lines.at(-1) !== '') {
      lines.push(line);
    } else {
      lines.splice(Math.max(lines.length - 1, 0), 0, line);
    }
  }

  return `${lines.join('\n').replace(/\n*$/, '')}\n`;
}

module.exports = {
  findLatestTunnelUrl,
  upsertEnvValue,
};
