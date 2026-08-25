import { readFile, writeFile } from 'node:fs/promises';

const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version)) {
  throw new Error(`Invalid desktop version: ${version ?? '(missing)'}`);
}

const packagePath = new URL('../../apps/desktop/package.json', import.meta.url);
const packageJson = JSON.parse(await readFile(packagePath, 'utf8'));
packageJson.version = version;
await writeFile(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);
