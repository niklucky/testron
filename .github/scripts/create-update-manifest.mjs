import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const [version, repository, tag, directory, output, requiredValue = 'false'] =
  process.argv.slice(2);
if (!version || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version))
  throw new Error(`Invalid version: ${version ?? '(missing)'}`);
if (!repository || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository))
  throw new Error(`Invalid repository: ${repository ?? '(missing)'}`);
if (!tag || !/^v[0-9A-Za-z.+-]+$/.test(tag)) throw new Error(`Invalid tag: ${tag ?? '(missing)'}`);
if (!directory || !output) throw new Error('The artifact directory and output path are required.');
if (!['true', 'false'].includes(requiredValue))
  throw new Error('The required flag must be true or false.');

const targets = {
  'darwin-arm64': 'Testron-macos-arm64.zip',
  'darwin-x64': 'Testron-macos-x64.zip',
  'win32-x64': 'Testron-windows-x64.zip',
  'linux-x64': 'Testron-linux-x64.zip',
};

const artifacts = {};
for (const [target, filename] of Object.entries(targets)) {
  const filePath = path.join(directory, filename);
  const details = await stat(filePath);
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  artifacts[target] = {
    url: `https://github.com/${repository}/releases/download/${tag}/${filename}`,
    sha256: hash.digest('hex'),
    size: details.size,
    filename,
  };
}

const manifest = {
  schemaVersion: 1,
  version,
  required: requiredValue === 'true',
  publishedAt: new Date().toISOString(),
  artifacts,
};
await writeFile(output, `${JSON.stringify(manifest, null, 2)}\n`);
