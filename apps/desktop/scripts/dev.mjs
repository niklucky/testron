import { spawn } from 'node:child_process';

const children = [
  spawn('pnpm', ['--filter', '@testron/test-fixtures', 'start'], {
    stdio: 'inherit',
  }),
  spawn('pnpm', ['start:app'], { stdio: 'inherit' }),
];

const stop = () => {
  for (const child of children) child.kill('SIGTERM');
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
for (const child of children)
  child.on('exit', (code) => {
    if (code && code !== 0) process.exitCode = code;
    stop();
  });
