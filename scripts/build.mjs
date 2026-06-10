/**
 * 文件说明: 构建公开站点产物，编译样式和 TypeScript，并复制运行所需静态文件、模板和公开文档。
 */
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
await mkdir(new URL('../public/assets/vendor/highlight', import.meta.url), { recursive: true });
await cp(
  new URL('../node_modules/@highlightjs/cdn-assets/highlight.min.js', import.meta.url),
  new URL('../public/assets/vendor/highlight/highlight.min.js', import.meta.url),
);
await cp(
  new URL('../node_modules/@highlightjs/cdn-assets/styles/github.min.css', import.meta.url),
  new URL('../public/assets/vendor/highlight/github.min.css', import.meta.url),
);
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
await cp(new URL('../docs', import.meta.url), new URL('../dist/docs', import.meta.url), { recursive: true });
console.info('Built CardNav dist.');
