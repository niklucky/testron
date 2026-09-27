import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, realpath, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { sourcePathSchema } from '@testron/protocol';

export class CliError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}
export const hash = (text: string) => createHash('sha256').update(text).digest('hex');
export const readOptional = async (file: string) => {
  try {
    return await readFile(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
};
export const atomicWrite = async (file: string, value: string) => {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  let executable = 0;
  try {
    executable = (await lstat(file)).mode & 0o100;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  await writeFile(temporary, value, { mode: 0o600 | executable });
  await rename(temporary, file);
};
export const jsonWrite = (file: string, value: unknown) =>
  atomicWrite(file, JSON.stringify(value, null, 2) + '\n');
export async function sourcePath(root: string, relative: string, writing = false): Promise<string> {
  const parsed = sourcePathSchema.safeParse(relative);
  if (!parsed.success) throw new CliError('UNSAFE_PATH', `Invalid source path: ${relative}`);
  const absolute = path.resolve(root, relative);
  const realRoot = await realpath(root);
  if (!absolute.startsWith(path.resolve(root) + path.sep))
    throw new CliError('UNSAFE_PATH', relative);
  let current = root;
  for (const segment of relative.split('/')) {
    current = path.join(current, segment);
    try {
      const stat = await lstat(current);
      if (stat.isSymbolicLink())
        throw new CliError('UNSAFE_PATH', `Symlink source paths are not supported: ${relative}`);
      const real = await realpath(current);
      if (!real.startsWith(realRoot + path.sep)) throw new CliError('UNSAFE_PATH', relative);
    } catch (error) {
      if (writing && (error as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw error;
    }
  }
  return absolute;
}
