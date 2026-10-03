// scale.js — 색 스케일 파생(50~950 11단계) + 다크 팔레트 자동 도출
// OKLCH 기반: 채도 곡선 + 명도 균등 램프

import { hexToOklch, oklchToHex, rgbToHex, hexToRgb, rgbToHsl, hslToRgb, contrastRatio } from './util.js';

const ANCHORS = { 50: 0.977, 100: 0.951, 200: 0.902, 300: 0.837, 400: 0.746, 500: 0.637, 600: 0.545, 700: 0.462, 800: 0.397, 900: 0.345, 950: 0.252 };
const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];

function nearestStep(l) {
  let best = 500, bd = Infinity;
  for (const s of STEPS) {
    const d = Math.abs(ANCHORS[s] - l);
    if (d < bd) { bd = d; best = s; }
  }
  return best;
}

// 기본 색 하나 → 11단계 스케일 {50: '#..', ..., 950: '#..'}. 기본 색이 속한 단계는 원본 유지.
export function makeScale(hex) {
  const base = hexToOklch(hex);
  if (!base) return null;
  const steps = {};
  const baseStep = nearestStep(base.l);
  for (const s of STEPS) {
    const dist = Math.abs(s - baseStep) / 500;
    // 채도: 기본 단계에서 최대, 멀어질수록 감쇠
    let c = base.c * (0.55 + 0.45 * Math.cos(Math.min(dist, 1) * Math.PI / 2));
    if (s <= 100) c *= 0.75;
    if (s >= 900) c *= 0.8;
    steps[s] = oklchToHex({ l: ANCHORS[s], c, h: base.h });
  }
  steps[baseStep] = hex.toLowerCase();
  return steps;
}

// 명도 이동 변형 (호버용 등)
export function shiftLuminance(hex, dl, dc = 1) {
  const o = hexToOklch(hex);
  if (!o) return hex;
  return oklchToHex({ l: Math.max(0.05, Math.min(0.98, o.l + dl)), c: o.c * dc, h: o.h });
}

/* ================= 다크 팔레트 자동 도출 ================= */

// 그룹 id/cssVar 힌트로 역할 추정
const BG_HINTS = /(^|[^a-z])(bg|background|surface|canvas|paper|base)/;
const TEXT_HINTS = /(^|[^a-z])(text|fg|foreground|ink|heading|title|body|content|label)/;
const BORDER_HINTS = /(^|[^a-z])(border|line|divider|stroke|outline)/;
const PRIMARY_HINTS = /primary|brand|main|accent/;

export function deriveDarkToken(token, groupId) {
  const key = `${groupId}/${token.cssVar}`.toLowerCase();
  const hex = token.value;
  const rgb = hexToRgb(hex);
  if (!rgb) return '';
  const hsl = rgbToHsl(rgb);
  const fromGroup = groupId.toLowerCase();
  const isBg = BG_HINTS.test(key) || fromGroup.includes('surface') || fromGroup.includes('표면');
  const isText = TEXT_HINTS.test(key) || fromGroup.includes('text') || fromGroup.includes('텍스트');
  const isBorder = BORDER_HINTS.test(key) || fromGroup.includes('border') || fromGroup.includes('테두리');
  const isBrand = PRIMARY_HINTS.test(key) || fromGroup.includes('brand') || fromGroup.includes('브랜드') || fromGroup.includes('semantic') || fromGroup.includes('시맨틱');

  // 표면/배경 — 어두운 중립 (원본 색조 소량 유지)
  if (isBg && !isText) {
    const l = hsl.l > 92 ? 10 : hsl.l > 70 ? 14 : 13;
    return rgbToHex(hslToRgb(hsl.h, Math.min(hsl.s, 14), l));
  }
  // 텍스트 — 밝게 (어두운 원본일수록 더 올림)
  if (isText) {
    if (hsl.l < 40) return rgbToHex(hslToRgb(hsl.h, Math.min(hsl.s, 10), hsl.l < 15 ? 88 : 86));
    return rgbToHex(hslToRgb(hsl.h, Math.min(hsl.s, 12), 70));
  }
  // 테두리 — 어두운 회색
  if (isBorder) {
    return rgbToHex(hslToRgb(hsl.h, Math.min(hsl.s, 10), 22));
  }
  // 브랜드/시맨틱 — 가독 명도까지 올림 (상한 0.82)
  if (isBrand) {
    const o = hexToOklch(hex);
    if (!o) return '';
    return oklchToHex({ l: Math.min(Math.max(o.l, 0.68), 0.82), c: o.c * 0.92, h: o.h });
  }
  // 나머지: 중간 톤으로 스왑
  return rgbToHex(hslToRgb(hsl.h, Math.min(hsl.s, 10), hsl.l > 50 ? 30 : 70));
}

// 프로젝트 전체 다크값 재계산 (mode==='auto'일 때 비어 있는 토큰만 채움)
export function deriveDarkValues(project) {
  if (project.colors.mode !== 'auto') return project;
  for (const g of project.colors.groups) {
    for (const t of g.tokens) {
      if (!t.dark) t.dark = deriveDarkToken(t, g.id);
    }
  }
  return project;
}

// 모드와 무관하게 비어 있는 다크값을 1회 강제 충전 ('none' 제외).
// 사이트에 prefers-color-scheme 변수가 있어 mode='manual'이 된 경우에도
// 우리 토큰명과 매칭이 안 되면 다크값이 전부 비게 되는 문제의 보정.
export function ensureDarkValues(project) {
  if (!project.colors || project.colors.mode === 'none') return project;
  const saved = project.colors.mode;
  project.colors.mode = 'auto';
  deriveDarkValues(project);
  project.colors.mode = saved;
  return project;
}

// 텍스트 색이 배경 위에서 최소 대비 확보하도록 명도 조정 (실패 시 원본 반환)
export function ensureContrast(textHex, bgHex, { min = 4.5 } = {}) {
  if (contrastRatio(textHex, bgHex) >= min) return textHex;
  const o = hexToOklch(textHex);
  const bg = hexToOklch(bgHex);
  if (!o || !bg) return textHex;
  const tryL = bg.l > 0.5 ? [0.95, 0.9, 0.85, 0.8] : [0.2, 0.3, 0.4, 0.5, 0.6];
  let best = textHex, bestRatio = contrastRatio(textHex, bgHex);
  for (const l of tryL) {
    const cand = oklchToHex({ l, c: o.c * 0.9, h: o.h });
    const r = contrastRatio(cand, bgHex);
    if (r > bestRatio) { bestRatio = r; best = cand; }
    if (bestRatio >= min) break;
  }
  return best;
}
