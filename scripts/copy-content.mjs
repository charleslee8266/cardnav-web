/**
 * 文件说明: 将运行时需要读取的 Markdown 内容复制到 Astro server dist 目录。
 */
import { cp, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = path.join(projectRoot, 'content');
const targetDir = path.join(projectRoot, 'dist', 'server', 'content');

async function pathExists(target) {
  try {
    await stat(target);
    return true;
  } catch (err) {
    if (err && err.code === 'ENOENT') return false;
    throw err;
  }
}

if (await pathExists(sourceDir)) {
  await mkdir(path.dirname(targetDir), { recursive: true });
  await cp(sourceDir, targetDir, { recursive: true });
  console.info(`Copied content to ${path.relative(projectRoot, targetDir)}.`);
}
