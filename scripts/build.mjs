import { spawn } from 'node:child_process';
import { cp, mkdir, rm } from 'node:fs/promises';

const rootDir = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: rootDir,
      stdio: 'inherit',
    });
    child.on('exit', code => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(' ')} failed code=${code ?? 1}`));
    });
    child.on('error', reject);
  });
}

await rm(new URL('../dist', import.meta.url), { recursive: true, force: true });
await mkdir(new URL('../public/assets', import.meta.url), { recursive: true });
await run('npx', [
  'tailwindcss',
  '-i',
  'src/public.css',
  '-o',
  'public/assets/public.css',
  '--minify',
]);
await run('tsc', ['-p', 'tsconfig.json']);
await mkdir(new URL('../dist/views/layouts', import.meta.url), { recursive: true });
await cp(new URL('../views', import.meta.url), new URL('../dist/views', import.meta.url), { recursive: true });
await cp(new URL('../public', import.meta.url), new URL('../dist/public', import.meta.url), { recursive: true });
console.info('Built CardNav dist.');
