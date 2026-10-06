// util.js — 공용 유틸: uid, slugify, 다운로드, 색 변환(hex/rgb/hsl/oklch), WCAG 대비
// 이 앱은 독립형 — 외부 의존 0.

let uidCounter = 0;

export function uid(prefix = '') {
  uidCounter += 1;
  return `${prefix}${Date.now().toString(36)}${uidCounter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function slugify(text) {
  return String(text ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9가-힣\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'token';
}

export function hex6() {
  // Bricks 등에서 쓰는 6자리 소문자 hex id (영숫자)
  let s = '';
  for (let i = 0; i < 6; i++) s += Math.floor(Math.random() * 16).toString(16);
  return s;
}

export function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function readTextFile(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(new Error('파일을 읽을 수 없습니다'));
    fr.readAsText(file);
  });
}

export function jsonBlob(data) {
  return new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
}

/* ================= 색상 ================= */

// CSS 색상 문자열 → {r,g,b} (0-255). 실패 시 null.
// 프로브 요소를 이용해 named color / rgba() / hsl() 등 모든 CSS 색 표기 정규화.
const probeEl = typeof document !== 'undefined' ? document.createElement('span') : null;

export function parseColor(value) {
  if (!value || typeof value !== 'string') return null;
  const v = value.trim();
  if (!v || v === 'inherit' || v === 'currentcolor' || v === 'transparent' || v.includes('var(')) return null;
  if (!probeEl) return null;
  probeEl.style.color = '';
  probeEl.style.color = v;
  if (!probeEl.style.color) return null;
  const m = probeEl.style.color.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?\s*\)/i);
  if (!m) return null;
  if (m[4] !== undefined && parseFloat(m[4]) === 0) return null; // 완전 투명은 제외
  return { r: Math.round(+m[1]), g: Math.round(+m[2]), b: Math.round(+m[3]) };
}

export function rgbaString(c, a = 1) {
  return `rgba(${c.r}, ${c.g}, ${c.b}, ${a})`;
}

export function rgbToHex({ r, g, b }) {
  const h = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

export function hexToRgb(hex) {
  const m = String(hex).trim().replace(/^#/, '');
  const full = m.length === 3 ? m.split('').map((ch) => ch + ch).join('') : m;
  if (!/^[0-9a-f]{6}$/i.test(full)) return null;
  return { r: parseInt(full.slice(0, 2), 16), g: parseInt(full.slice(2, 4), 16), b: parseInt(full.slice(4, 6), 16) };
}

export function normalizeToHex(value) {
  const c = parseColor(value);
  return c ? rgbToHex(c) : null;
}

export function rgbToHsl({ r, g, b }) {
  const rr = r / 255, gg = g / 255, bb = b / 255;
  const max = Math.max(rr, gg, bb), min = Math.min(rr, gg, bb);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === rr) h = ((gg - bb) / d + (gg < bb ? 6 : 0));
    else if (max === gg) h = (bb - rr) / d + 2;
    else h = (rr - gg) / d + 4;
    h *= 60;
  }
  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
}

export function hslToRgb(h, s, l) {
  const S = s / 100, L = l / 100;
  const k = (n) => (n + h / 30) % 12;
  const a = S * Math.min(L, 1 - L);
  const f = (n) => L - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return { r: Math.round(f(0) * 255), g: Math.round(f(8) * 255), b: Math.round(f(4) * 255) };
}

/* --- OKLab/OKLCH (클러스터링·스케일 생성용) --- */

function srgbToLinear(ch) {
  const c = ch / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
function linearToSrgb(c) {
  const v = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return Math.max(0, Math.min(255, Math.round(v * 255)));
}

export function rgbToOklch({ r, g, b }) {
  const lr = srgbToLinear(r), lg = srgbToLinear(g), lb = srgbToLinear(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  const L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
  const C = Math.sqrt(A * A + B * B);
  let H = (Math.atan2(B, A) * 180) / Math.PI;
  if (H < 0) H += 360;
  return { l: L, c: C, h: H };
}

export function oklchToRgb({ l, c, h }) {
  const hr = (h * Math.PI) / 180;
  const A = Math.cos(hr) * c, B = Math.sin(hr) * c;
  const l_ = l + 0.3963377774 * A + 0.2158037573 * B;
  const m_ = l - 0.1055613458 * A - 0.0638541728 * B;
  const s_ = l - 0.0894841775 * A - 1.2914855480 * B;
  const L3 = l_ * l_ * l_, M3 = m_ * m_ * m_, S3 = s_ * s_ * s_;
  const lr = 4.0767416621 * L3 - 3.3077115913 * M3 + 0.2309699292 * S3;
  const lg = -1.2684380046 * L3 + 2.6097574011 * M3 - 0.3413193965 * S3;
  const lb = -0.0041960863 * L3 - 0.7034186147 * M3 + 1.7076147010 * S3;
  return { r: linearToSrgb(lr), g: linearToSrgb(lg), b: linearToSrgb(lb) };
}

export function hexToOklch(hex) {
  const rgb = hexToRgb(hex);
  return rgb ? rgbToOklch(rgb) : null;
}

export function oklchToHex(o) {
  return rgbToHex(oklchToRgb(o));
}

/* --- WCAG 대비 --- */

function relLum({ r, g, b }) {
  const f = (c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export function contrastRatio(hexA, hexB) {
  const a = hexToRgb(hexA), b = hexToRgb(hexB);
  if (!a || !b) return 1;
  const la = relLum(a), lb = relLum(b);
  const hi = Math.max(la, lb), lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

export function contrastGrade(ratio) {
  if (ratio >= 7) return 'AAA';
  if (ratio >= 4.5) return 'AA';
  if (ratio >= 3) return 'AA-large';
  return 'fail';
}

/* --- 유틸 --- */

export function debounce(fn, ms = 120) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

export function pxToNumber(v) {
  // "16px" → 16, "1.5rem" → 24 (16px 기준), 숫자 실패 시 null
  const m = String(v ?? '').trim().match(/^(-?[\d.]+)(px|rem|em)?$/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (Number.isNaN(n)) return null;
  if (m[2] === 'rem' || m[2] === 'em') return Math.round(n * 16);
  return Math.round(n);
}

/* --- 인라인 스타일/CSS 값 안전성 검증 (CSS 인젝션 방지) --- */

const SAFE_CSS_VALUE_RE = /^[a-zA-Z0-9 \t#%(),./:+*_&"'-]*$/;

// 사용자/사이트에서 온 임의 문자열을 style="..." 안에 넣어도 되는지 검사.
// 따옴표 균형까지 확인해 ";url(...)" 등 탈출 시도를 차단한다.
export function isSafeCssValue(v) {
  const s = String(v ?? '');
  if (!s || s.length > 200) return false;
  if (!SAFE_CSS_VALUE_RE.test(s)) return false;
  for (const q of ['"', "'"]) {
    const count = (s.match(new RegExp(q, 'g')) || []).length;
    if (count % 2 !== 0) return false;
  }
  return true;
}

// 안전하면 그대로, 아니면 fallback 반환 (렌더·내보내기 공용 게이트)
export function safeCssValue(v, fallback = '') {
  return isSafeCssValue(v) ? String(v) : fallback;
}
