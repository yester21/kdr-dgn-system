// export.js — ZIP 패키지/개별 파일 내보내기

import { makeZip } from './zip.js';
import { buildExports } from './exporters.js';
import { download, jsonBlob, slugify } from './util.js';

function baseName(project) {
  return slugify(project.meta.name || 'design-system') || 'design-system';
}

export function exportZip(project) {
  const files = buildExports(project);
  const blob = makeZip(files);
  download(blob, `${baseName(project)}-design-system.zip`);
  return files;
}

export function exportProjectJson(project) {
  download(jsonBlob(project), `${baseName(project)}-project.json`);
}

// 개별 파일 다운로드 (디버그·부분 사용용)
export function exportSingleFile(project, path) {
  const files = buildExports(project);
  const f = files.find((x) => x.path === path);
  if (!f) return false;
  const isJson = path.endsWith('.json');
  download(
    isJson ? jsonBlob(JSON.parse(f.content)) : new Blob([f.content], { type: 'text/plain' }),
    path.split('/').pop()
  );
  return true;
}
