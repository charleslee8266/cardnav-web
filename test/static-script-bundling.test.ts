/**
 * 文件说明: 验证通过 ?url 暴露给浏览器的本地脚本保持自包含，避免构建产物残留源码 import。
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

const projectRoot = path.resolve('.');
const sourceRoot = path.join(projectRoot, 'src');
const localScriptUrlImportPattern = /import\s+([A-Za-z_$][\w$]*)\s+from\s+['"]([^'"]*\/scripts\/[^'"]+\.js)\?url['"]/g;
const localSourceImportPattern = /(?:^|\n)\s*import(?:\s+[^('"`][\s\S]*?\s+from\s*)?['"](\.{1,2}\/[^'"]+)['"]|import\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g;

function listFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const filePath = path.join(dir, entry.name);
    if (entry.isDirectory()) return listFiles(filePath);
    return entry.isFile() ? [filePath] : [];
  });
}

function localScriptUrlImports() {
  return listFiles(sourceRoot)
    .filter(filePath => filePath.endsWith('.astro'))
    .flatMap(filePath => {
      const source = fs.readFileSync(filePath, 'utf8');
      return [...source.matchAll(localScriptUrlImportPattern)].map(match => ({
        astroFilePath: filePath,
        variableName: match[1],
        scriptPath: path.resolve(path.dirname(filePath), match[2]),
      }));
    });
}

test('local scripts loaded through ?url do not import project source modules', () => {
  const failures = localScriptUrlImports().flatMap(({ astroFilePath, variableName, scriptPath }) => {
    const scriptSource = fs.readFileSync(scriptPath, 'utf8');
    return [...scriptSource.matchAll(localSourceImportPattern)].map(match => {
      const importedPath = match[1] || match[2] || '';
      return `${path.relative(projectRoot, astroFilePath)} imports ${variableName} from ${path.relative(projectRoot, scriptPath)}, but that raw script imports ${importedPath}`;
    });
  });

  assert.deepEqual(failures, []);
});
