// rest.js — GreenShift REST 직접 적용
// 규격: GET/POST /wp-json/greenshift/v1/figma_settings (Basic auth = 애플리케이션 비밀번호)
// 주의: variables/figma_fonts 배열은 통째 교체되므로 GET 후 병합해 POST한다.

import { fetchText } from './proxy.js';
import { findToken } from './store.js';
import { exportGreenShift } from './exporters.js';

function authHeader(login, password) {
  return 'Basic ' + btoa(`${login}:${password.replace(/\s/g, '')}`);
}

function apiUrl(siteUrl) {
  return siteUrl.replace(/\/+$/, '') + '/wp-json/greenshift/v1/figma_settings';
}

// 구글폰트 CSS → figma_fonts 항목 (woff2 URL per weight)
async function buildFigmaFonts(project, report) {
  const entries = [];
  const styleNames = { 100: 'Thin', 200: 'Extra Light', 300: 'Light', 400: 'Regular', 500: 'Medium', 600: 'Semi Bold', 700: 'Bold', 800: 'Extra Bold', 900: 'Black' };
  for (const f of project.fonts) {
    if (f.source !== 'google' || !f.family) continue;
    const fam = f.family.replace(/ /g, '+');
    const weights = [...new Set([...(f.weights || []), 400, 700])].sort((a, b) => a - b);
    const cssUrl = f.cssUrl && f.cssUrl.includes('fonts.googleapis')
      ? f.cssUrl
      : `https://fonts.googleapis.com/css2?family=${fam}:wght@${weights.join(';')}&display=swap`;
    const css = await fetchText(cssUrl);
    if (!css) {
      report(`폰트 ${f.family}: CSS를 가져오지 못해 건너뜀`);
      continue;
    }
    const blocks = css.match(/@font-face\s*{[^}]*}/g) || [];
    const seen = new Set();
    for (const block of blocks) {
      const family = block.match(/font-family:\s*['"]?([^;'"]+)['"]?/)?.[1];
      const weight = block.match(/font-weight:\s*(\d+)/)?.[1] || '400';
      const italic = /font-style:\s*italic/.test(block);
      const url = block.match(/url\((https:[^)]+\.woff2)\)/)?.[1];
      if (!family || !url) continue;
      const style = (styleNames[weight] || 'Regular') + (italic ? ' Italic' : '');
      const key = `${family}::${style}`;
      if (seen.has(key)) continue;
      seen.add(key);
      entries.push({ fontFamily: family, fontStyle: style, fontFile: url });
    }
  }
  return entries;
}

export async function applyToGreenShift(project, siteUrl, login, password, report) {
  const endpoint = apiUrl(siteUrl);
  report('현재 설정 읽는 중…');
  let existing = {};
  try {
    const res = await fetch(endpoint, { headers: { Authorization: authHeader(login, password) } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    existing = data?.settings || data || {};
  } catch (e) {
    report(`설정 읽기 실패 (${e.message}) — 사이트 URL·앱 비밀번호·GreenShift 설치를 확인하세요. CORS로 막히면 수동 임포트(greenshift/figma-settings.json)를 사용하세요.`, 'error');
    return false;
  }

  // 우리 variables 생성 후 기존과 병합 (같은 이름이면 교체)
  const ours = JSON.parse(exportGreenShift(project)[0].content).settings;
  const existingVars = Array.isArray(existing.variables) ? existing.variables : [];
  const byName = new Map();
  for (const v of existingVars) byName.set(v.variable, v);
  for (const v of ours.variables) byName.set(v.variable, v);
  const mergedVars = [...byName.values()];

  // 폰트 병합 (family::style 키 중복 제거, 기존 우선 유지 + 신규 추가)
  const ourFonts = await buildFigmaFonts(project, (m) => report(m));
  const existingFonts = Array.isArray(existing.figma_fonts) ? existing.figma_fonts : [];
  const fontKey = (f) => `${f.fontFamily}::${f.fontStyle}`;
  const fontMap = new Map();
  for (const f of existingFonts) fontMap.set(fontKey(f), f);
  let addedFonts = 0;
  for (const f of ourFonts) {
    if (!fontMap.has(fontKey(f))) { fontMap.set(fontKey(f), f); addedFonts++; }
  }

  const payload = { variables: mergedVars };
  if (fontMap.size) payload.figma_fonts = [...fontMap.values()];

  report('적용 중…');
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: authHeader(login, password) },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status} ${body.slice(0, 140)}`);
    }
  const existingVarNames = new Set(existingVars.map((v) => v.variable));
  const newCount = ours.variables.filter((v) => !existingVarNames.has(v.variable)).length;
  report(`적용 완료 — 변수 ${mergedVars.length}건(신규 ${newCount}), 폰트 ${addedFonts}건 추가`, 'ok');
    return true;
  } catch (e) {
    report(`적용 실패 (${e.message}) — 수동 임포트(greenshift/figma-settings.json)를 사용하세요.`, 'error');
    return false;
  }
}
