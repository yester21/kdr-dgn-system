// extract.js — 사이트 HTML(+외부 CSS)에서 디자인 시스템 추출
// 파서: 감춘 iframe의 브라우저 네이티브 CSSOM (자체 CSS 파서 아님)

import { parseColor, rgbToHex, rgbToOklch, hexToRgb, oklchToHex, pxToNumber } from './util.js';
import { fetchText, absolutize } from './proxy.js';
import { shiftLuminance } from './scale.js';

const COLOR_PROPS_TEXT = new Set(['color']);
const COLOR_PROPS_BG = new Set(['background', 'background-color']);
const COLOR_PROPS_BORDER = new Set(['border', 'border-color', 'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color']);
const OTHER_COLOR_PROPS = new Set(['outline-color', 'text-decoration-color', 'fill', 'stroke', 'caret-color', 'border-top', 'border-right', 'border-bottom', 'border-left']);

const SYSTEM_FONT_HINTS = /^(system-ui|-apple-system|blinkmacsystemfont|sans-serif|serif|monospace|ui-sans-serif|ui-monospace|cursive|fantasy|arial|helvetica|helvetica neue|tahoma|verdana|menlo|consolas|dotum|gulim|malgun gothic|apple sd gothic neo|segoe ui|apple color emoji|noto sans kr|noto serif kr|nanumgothic|nanummyeongjo)$/i;

// 프리뷰에서 CDN 로드 가능한 폰트 (family 소문자 → cssUrl)
const CDN_FONTS = {
  'pretendard': 'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css',
  'pretendard variable': 'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css',
};

function firstColorToken(value) {
  const m = String(value).match(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/);
  return m ? m[0] : String(value);
}

function firstFamily(stack) {
  const first = String(stack).split(',')[0].trim().replace(/^['"]|['"]$/g, '');
  return first || null;
}

function hueDist(a, b) {
  const d = Math.abs(a - b) % 360;
  return Math.min(d, 360 - d);
}

function toPx(v) {
  // "1.5rem"→24, "18px"→18, "1.5"→null(단위 없음=배수 아닌 숫자는 무시)
  if (v == null) return null;
  const m = String(v).trim().match(/^(-?[\d.]+)(px|rem|em)$/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (Number.isNaN(n)) return null;
  return m[2] === 'px' ? Math.round(n) : Math.round(n * 16);
}

/* ============ 1단계: HTML → CSS 텍스트 수집 ============ */

export async function collectCss(html, baseUrl, { onProgress, maxCssFiles = 12 } = {}) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const inlineStyles = [...doc.querySelectorAll('style')].map((s) => s.textContent || '');
  const cssUrls = [];
  const googleFontCss = [];

  for (const link of doc.querySelectorAll('link[href]')) {
    const rel = (link.getAttribute('rel') || '').toLowerCase();
    const href = link.getAttribute('href') || '';
    if (rel !== 'stylesheet' && !href.includes('fonts.googleapis.com')) continue;
    const abs = absolutize(href, baseUrl);
    if (!abs) continue;
    if (abs.includes('fonts.googleapis.com/css')) {
      googleFontCss.push(abs);
    } else if (cssUrls.length < maxCssFiles) {
      cssUrls.push(abs);
    }
  }

  // <style> 안 @import도 수집 (1단계)
  for (const text of inlineStyles) {
    for (const m of text.matchAll(/@import\s+(?:url\()?['"]?([^'")\s]+)/g)) {
      const abs = absolutize(m[1], baseUrl);
      if (abs && !abs.includes('fonts.googleapis.com') && cssUrls.length < maxCssFiles) cssUrls.push(abs);
    }
  }

  if (onProgress) onProgress(`스타일시트 ${cssUrls.length}개 가져오는 중…`);
  const fetched = await Promise.allSettled(cssUrls.map((u) => fetchText(u)));
  const external = fetched.filter((r) => r.status === 'fulfilled' && r.value).map((r) => r.value);

  const inlineAttrs = [...doc.querySelectorAll('[style]')].map((el) => el.getAttribute('style') || '');

  return { cssText: [...inlineStyles, ...external].join('\n'), googleFontCss, inlineAttrs, doc };
}

/* ============ 2단계: CSSOM 분석 ============ */

// 주의: 규칙 객체는 분석용 iframe(별도 렐름)에서 나오므로 instanceof는 부모 렐름 클래스와
// 매칭되지 않는다. CSSRule 타입 상수(숫자)와 constructor.name 문자열로 판정한다(렐름 독립).
const RULE_TYPE = { STYLE: 1, MEDIA: 4, SUPPORTS: 12, LAYER_BLOCK: 16 };

function walkRules(rules, cb, media = '') {
  for (const rule of rules) {
    if (!rule) continue;
    const cname = rule.constructor?.name;
    if (rule.type === RULE_TYPE.MEDIA || cname === 'CSSMediaRule') {
      walkRules(rule.cssRules, cb, rule.conditionText || rule.media?.mediaText || '');
    } else if (rule.type === RULE_TYPE.SUPPORTS || rule.type === RULE_TYPE.LAYER_BLOCK
      || cname === 'CSSSupportsRule' || cname === 'CSSLayerBlockRule') {
      walkRules(rule.cssRules, cb, media);
    } else if (rule.style) {
      cb(rule, media);
    }
  }
}

function eachDeclaration(style, fn) {
  for (let i = 0; i < style.length; i++) {
    const name = style[i];
    if (!name.startsWith('--')) fn(name, style.getPropertyValue(name).trim());
  }
}

function analyzeCss(cssText) {
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;width:0;height:0;border:0;visibility:hidden';
  document.body.appendChild(frame);
  const fdoc = frame.contentDocument;
  const styleEl = fdoc.createElement('style');
  styleEl.textContent = cssText;
  fdoc.head.appendChild(styleEl);

  const result = {
    rootVars: {},
    darkVars: {},
    colorStats: new Map(),    // hex → {count,text,bg,border,shadow,isVar}
    fontFamilyFreq: new Map(),// first family → {count, stack}
    tagTypo: {},              // h1..h6/p/body/html → {size,weight,lineHeight,letterSpacing,family}
    tagTypoResp: {},          // h1..h6/p/body → { "<maxWidth>": {size, lineHeight} } (미디어쿼리 안)
    mediaWidthStats: new Map(), // max-width px → 등장 횟수 (사이트 브레이크포인트 추정)
    radiusStats: new Map(),
    shadowStats: new Map(),
    spacingStats: new Map(),
    layoutStats: {
      containerWidth: new Map(), // max-width/width px 960~1600 → 빈도 (컨테이너 폭)
      sectionPadY: new Map(),    // padding-y px 40~200 → 빈도 (섹션 세로 여백)
      gap: new Map(),            // gap px 8~48 → 빈도 (위젯 간격)
    },
  };
  const bump = (hex, ctx) => {
    let s = result.colorStats.get(hex);
    if (!s) { s = { count: 0, text: 0, bg: 0, border: 0, shadow: 0, isVar: false }; result.colorStats.set(hex, s); }
    s.count++; s[ctx]++;
  };

  try {
    walkRules(styleEl.sheet.cssRules, (rule, media) => {
      const sel = rule.selectorText || '';
      const isDarkMedia = /prefers-color-scheme:\s*dark/i.test(media);
      const isDarkSel = /\[data-theme["\]=\s~|^]*dark|\[data-mode["\]=\s~|^]*dark|\.dark\b|\.theme-dark|\.darkmode/i.test(sel);
      const isRootSel = /:root|\bhtml\b|\bbody\b/.test(sel);

      // 미디어쿼리 max-width 통계 (사이트 브레이크포인트 추정)
      let mediaMax = null;
      if (media && !isDarkMedia) {
        const m = media.match(/max-width:\s*(\d+(?:\.\d+)?)px/i);
        if (m) {
          mediaMax = Math.round(parseFloat(m[1]));
          result.mediaWidthStats.set(mediaMax, (result.mediaWidthStats.get(mediaMax) || 0) + 1);
        }
      }

      if (isRootSel || isDarkSel) {
        const target = (isDarkMedia || isDarkSel) && !isRootSel ? result.darkVars : isRootSel && !isDarkMedia ? result.rootVars : result.darkVars;
        eachDeclaration(rule.style, (name, value) => {
          if (!target[name]) target[name] = value;
        });
      }

      eachDeclaration(rule.style, (name, v) => {
        if (!v) return;

        // 색상
        if (COLOR_PROPS_TEXT.has(name) || COLOR_PROPS_BG.has(name) || COLOR_PROPS_BORDER.has(name) || OTHER_COLOR_PROPS.has(name)) {
          if (/gradient|url\(/i.test(v)) return;
          const c = parseColor(firstColorToken(v));
          if (c) {
            const ctx = COLOR_PROPS_TEXT.has(name) ? 'text' : COLOR_PROPS_BG.has(name) ? 'bg' : 'border';
            bump(rgbToHex(c), ctx);
          }
        }
        // 섀도우
        if (name === 'box-shadow' && v !== 'none') {
          const c = parseColor(firstColorToken(v));
          if (c) bump(rgbToHex(c), 'shadow');
          const norm = v.replace(/\s+/g, ' ').trim();
          if (norm) result.shadowStats.set(norm, (result.shadowStats.get(norm) || 0) + 1);
        }
        // 폰트 패밀리
        if (name === 'font-family') {
          const first = firstFamily(v);
          if (first && !/^(inherit|initial|unset|revert|default)$/i.test(first)) {
            let f = result.fontFamilyFreq.get(first);
            if (!f) { f = { count: 0, stack: v }; result.fontFamilyFreq.set(first, f); }
            f.count++;
          }
        }
        // 타이포 계층 — h1~h6/p/body/html 선택자의 규칙
        if (/^(font-size|font-weight|line-height|letter-spacing|font-family)$/.test(name)) {
          for (const m of sel.matchAll(/\b(h[1-6]|p|body|html)\b/gi)) {
            const t = m[1].toLowerCase();
            const slot = result.tagTypo[t] = result.tagTypo[t] || {};
            if (mediaMax) {
              // 반응형: 이 브레이크포인트에서 덮어쓰는 값 기록
              if (t === 'html') continue;
              const rslot = result.tagTypoResp[t] = result.tagTypoResp[t] || {};
              const rr = rslot[mediaMax] = rslot[mediaMax] || {};
              if (name === 'font-size' && !rr.size) rr.size = v;
              else if (name === 'line-height' && !rr.lineHeight) rr.lineHeight = v;
              continue;
            }
            if (name === 'font-size') {
              if (!slot.size) slot.size = v;
              // 제목 태그는 후보 전부 수집 — 테마 기본 h1{16px}보다 컴포넌트 h1{38.7px}가 진짜일 때 대비
              slot.allSizes = slot.allSizes || [];
              slot.allSizes.push(v);
            }
            else if (name === 'font-weight' && !slot.weight) slot.weight = v;
            else if (name === 'line-height' && !slot.lineHeight) slot.lineHeight = v;
            else if (name === 'letter-spacing' && !slot.letterSpacing) slot.letterSpacing = v;
            else if (name === 'font-family' && !slot.family) slot.family = v;
          }
        }
        // 라디우스
        if (name === 'border-radius' && v !== '0') {
          if (/%|999/.test(v)) {
            result.radiusStats.set('999px', (result.radiusStats.get('999px') || 0) + 2);
          } else {
            const firstV = v.split(/\s+/)[0];
            const n = pxToNumber(firstV);
            if (n > 0) result.radiusStats.set(firstV, (result.radiusStats.get(firstV) || 0) + 1);
          }
        }
        // 스페이싱 후보
        if (/^(margin|padding|gap|row-gap|column-gap)(-(top|right|bottom|left))?$/.test(name) && !/auto|var\(|calc|%/.test(v)) {
          for (const part of v.split(/\s+/)) {
            const n = pxToNumber(part);
            if (n && n >= 2 && n <= 128 && n % 2 === 0) {
              result.spacingStats.set(n, (result.spacingStats.get(n) || 0) + 1);
            }
          }
        }
        // 레이아웃 토큰 후보 — 컨테이너 폭 / 섹션 세로 여백 / 위젯 간격
        if (/^(max-width|width)$/.test(name) && !/var\(|calc|%|auto|fit|content/.test(v)) {
          const n = pxToNumber(v);
          if (n >= 960 && n <= 1600) {
            result.layoutStats.containerWidth.set(n, (result.layoutStats.containerWidth.get(n) || 0) + 1);
          }
        }
        if (/^(padding|padding-block|padding-top|padding-bottom)$/.test(name) && !/var\(|calc|%/.test(v)) {
          const parts = v.split(/\s+/);
          const ys = name === 'padding' ? [parts[0], parts[2] || parts[0]] : [parts[0]];
          for (const part of ys) {
            const n = pxToNumber(part);
            if (n >= 40 && n <= 200 && n % 4 === 0) {
              result.layoutStats.sectionPadY.set(n, (result.layoutStats.sectionPadY.get(n) || 0) + 1);
            }
          }
        }
        if (/^(gap|row-gap|column-gap)$/.test(name) && !/var\(|calc|%/.test(v)) {
          for (const part of v.split(/\s+/)) {
            const n = pxToNumber(part);
            if (n >= 8 && n <= 48 && n % 2 === 0) {
              result.layoutStats.gap.set(n, (result.layoutStats.gap.get(n) || 0) + 1);
            }
          }
        }
      });
    });
  } finally {
    frame.remove();
  }
  return result;
}

/* ============ 3단계: 팔레트 조립 ============ */

function buildPalette(colorStats) {
  const chromatic = [];
  const neutrals = [];

  for (const [hex, s] of colorStats) {
    const rgb = hexToRgb(hex);
    if (!rgb) continue;
    const o = rgbToOklch(rgb);
    if (o.c < 0.035 || o.l > 0.975 || o.l < 0.03) {
      neutrals.push({ hex, l: o.l, score: s.count });
    } else {
      // 프라이머리 후보는 중명도(≈0.62)를 선호 — 저명도 네이비 배경이 이기는 것 방지
      const lightnessBoost = Math.max(0.35, 1 - Math.abs(o.l - 0.62) * 1.2);
      chromatic.push({ hex, o, score: s.count * (0.45 + o.c) * lightnessBoost + (s.isVar ? 3 : 0) });
    }
  }

  // 색조 버킷(15°) → 대표색 후보 랭킹
  const buckets = new Map();
  for (const cand of chromatic) {
    const b = Math.round(cand.o.h / 15) % 24;
    const prev = buckets.get(b);
    if (!prev || cand.score > prev.score) buckets.set(b, cand);
  }
  const ranked = [...buckets.values()].sort((a, b) => b.score - a.score);

  const primary = ranked[0]?.hex || '#4c8dff';
  const po = ranked[0]?.o || rgbToOklch(hexToRgb(primary));
  const soft = oklchToHex({ l: 0.955, c: Math.min(po.c * 0.32, 0.05), h: po.h });

  const brand = [
    { id: 'primary', name: '프라이머리', cssVar: '--primary', value: primary },
    { id: 'primary-hover', name: '프라이머리 호버', cssVar: '--primary-hover', value: shiftLuminance(primary, 0.045) },
    { id: 'primary-active', name: '프라이머리 누름', cssVar: '--primary-active', value: shiftLuminance(primary, -0.05) },
    { id: 'primary-soft', name: '프라이머리 연함', cssVar: '--primary-soft', value: soft },
  ];
  let accentIdx = 1;
  for (const cand of ranked.slice(1)) {
    if (accentIdx > 2) break;
    if (hueDist(cand.o.h, po.h) < 40) continue;
    brand.push({ id: `accent-${accentIdx}`, name: `액센트 ${accentIdx}`, cssVar: `--accent-${accentIdx}`, value: cand.hex });
    accentIdx++;
  }

  // 중립 → 텍스트/표면/테두리
  const darks = neutrals.filter((n) => n.l < 0.4).sort((a, b) => a.l - b.l);
  const lights = neutrals.filter((n) => n.l >= 0.4).sort((a, b) => b.l - a.l);
  const pick = (arr, i, fallback) => arr[i]?.hex || fallback;

  const text = [
    { id: 'text-strong', name: '텍스트 강함', cssVar: '--text-strong', value: pick(darks, 0, '#111418') },
    { id: 'text-body', name: '텍스트 본문', cssVar: '--text-body', value: pick(darks, 1, '#333a45') },
    { id: 'text-sub', name: '텍스트 보조', cssVar: '--text-sub', value: pick(darks, 2, '#66707f') },
    { id: 'text-disabled', name: '텍스트 비활성', cssVar: '--text-disabled', value: pick(darks, 3, '#9aa3b2') },
  ];

  const bgCandidates = [...colorStats.entries()]
    .filter(([hex, s]) => s.bg > 0 && hexToRgb(hex) && rgbToOklch(hexToRgb(hex)).l > 0.5)
    .sort((a, b) => b[1].bg - a[1].bg)
    .map(([hex]) => hex);
  const surface = [
    { id: 'bg-default', name: '배경 기본', cssVar: '--bg-default', value: bgCandidates[0] || '#ffffff' },
    { id: 'bg-subtle', name: '배경 연함', cssVar: '--bg-subtle', value: bgCandidates[1] || pick(lights, 1, '#f7f8fa') },
    { id: 'bg-muted', name: '배경 중간', cssVar: '--bg-muted', value: bgCandidates[2] || pick(lights, 2, '#eef0f3') },
  ];

  const borderCandidates = [...colorStats.entries()]
    .filter(([hex, s]) => s.border > 0)
    .sort((a, b) => b[1].border - a[1].border)
    .map(([hex]) => hex);
  const border = [
    { id: 'border-light', name: '테두리 연함', cssVar: '--border-light', value: borderCandidates[0] || '#e3e6ea' },
    { id: 'border-medium', name: '테두리 진함', cssVar: '--border-medium', value: borderCandidates[1] || '#cfd4da' },
  ];

  const infoAlready = brand.some((t) => t.value === (ranked[1]?.hex || ''));
  const semantic = [
    { id: 'danger', name: '위험', cssVar: '--danger', value: '#f04452' },
    { id: 'success', name: '성공', cssVar: '--success', value: '#1d8a3e' },
    { id: 'warn', name: '주의', cssVar: '--warn', value: '#b25000' },
    { id: 'info', name: '정보', cssVar: '--info', value: !infoAlready && ranked[1] ? ranked[1].hex : '#1264d8' },
  ];

  return {
    groups: [
      { id: 'brand', name: '브랜드', tokens: brand },
      { id: 'text', name: '텍스트', tokens: text },
      { id: 'surface', name: '표면', tokens: surface },
      { id: 'border', name: '테두리', tokens: border },
      { id: 'semantic', name: '시맨틱', tokens: semantic },
    ],
  };
}

/* ============ 4단계: 타이포·치수 조립 ============ */

// 사이트의 max-width 통계 → 태블릿/폰 브레이크포인트 추정
function pickBreakpoints(analysis) {
  const stats = analysis.mediaWidthStats;
  const widths = [...stats.keys()].filter((w) => w >= 360 && w <= 1280).sort((a, b) => b - a);
  if (!widths.length) return { tablet: null, phone: null };
  const tablet = widths[0];
  const below = widths.filter((w) => w < tablet - 40);
  let phone = null;
  if (below.length) {
    phone = below.sort((a, b) => (stats.get(b) - stats.get(a)) || (b - a))[0];
  }
  return { tablet, phone };
}

// 제목 크기 선택: 후보 전체에서 가장 큰 값(본문 대비 0.9~3.5배 이내).
// 테마 기본 h1{18px}보다 컴포넌트 제목 .fcal-h1{38.7px}가 실제 크기일 때가 많기 때문.
function headingSizeOf(tag, key, fallback) {
  const slot = tag[key];
  if (!slot) return fallback;
  const bodyApprox = toPx(tag.body?.size || tag.p?.size || slot.size) || 16;
  const cands = (slot.allSizes || []).map(toPx).filter((n) => n && n >= bodyApprox * 0.9 && n <= bodyApprox * 3.5);
  if (cands.length) return Math.max(...cands);
  return toPx(slot.size) || fallback;
}

function buildTypography(analysis) {
  const tag = analysis.tagTypo;
  const resp = analysis.tagTypoResp;
  const bps = pickBreakpoints(analysis);
  const bodyTag = tag.body || tag.html || tag.p || {};
  const bodySize = toPx(bodyTag.size) || 16;

  const fams = [...analysis.fontFamilyFreq.entries()].sort((a, b) => b[1].count - a[1].count);
  const bodyStack = fams[0]?.[1].stack || '';
  const headingStack = tag.h1?.family || tag.h2?.family || bodyStack;

  // 반응형 값 조회: 태그의 bp 오버라이드 (가까운 bp 값도 허용 ±80px)
  const respFor = (tagKey, bp) => {
    if (!tagKey || !bp || !resp[tagKey]) return null;
    const exact = resp[tagKey][bp];
    if (exact?.size) return exact;
    const near = Object.entries(resp[tagKey]).find(([w, v]) => Math.abs(w - bp) <= 80 && v.size);
    return near ? near[1] : null;
  };
  const respObj = (tagKey) => {
    const out = {};
    const t = respFor(tagKey, bps.tablet);
    const p = respFor(tagKey, bps.phone);
    if (t?.size) out.tablet = { size: t.size, lineHeight: t.lineHeight || '' };
    if (p?.size) out.phone = { size: p.size, lineHeight: p.lineHeight || '' };
    return Object.keys(out).length ? out : null;
  };

  const hierarchy = [];
  const push = (id, label, size, weight, lh, ls, family, tagKey) => {
    hierarchy.push({
      id, label,
      size: `${Math.round(size * 10) / 10}px`,
      weight: String(weight),
      lineHeight: String(lh),
      letterSpacing: String(ls),
      family,
      ...(tagKey ? respObj(tagKey) : {}),
    });
  };

  const h1Size = headingSizeOf(tag, 'h1', bodySize * 2.441);
  push('display', '디스플레이', Math.round(h1Size * 1.32), toPx(tag.h1?.weight) || 700, tag.h1?.lineHeight?.match(/^[\d.]+$/) ? tag.h1.lineHeight : '1.15', tag.h1?.letterSpacing || '-0.025em', 'heading', 'h1');

  const hDefs = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
  const hLabels = ['제목 1', '제목 2', '제목 3', '제목 4', '제목 5', '제목 6'];
  const defaults = [2.441, 1.953, 1.563, 1.25, 1.1, 0.9375];
  hDefs.forEach((h, i) => {
    const size = headingSizeOf(tag, h, bodySize * defaults[i]);
    push(h, hLabels[i], size, toPx(tag[h]?.weight) || (i < 3 ? 700 : 600), tag[h]?.lineHeight || (1.35 - i * 0.02).toFixed(2), tag[h]?.letterSpacing || '-0.01em', 'heading', h);
  });
  const bodyTagKey = tag.p && resp.p ? 'p' : 'body';
  push('body', '본문', bodySize, toPx(bodyTag.weight) || 400, bodyTag.lineHeight || '1.6', bodyTag.letterSpacing || '0', 'body', bodyTagKey);
  push('small', '작은 텍스트', bodySize * 0.875, toPx(bodyTag.weight) || 400, '1.55', '0', 'body', bodyTagKey);
  push('caption', '캡션', bodySize * 0.8125, 500, '1.5', '0', 'body', bodyTagKey);

  const typo = {
    families: {
      heading: { name: firstFamily(headingStack) || '', stack: headingStack },
      body: { name: firstFamily(bodyStack) || '', stack: bodyStack },
      mono: { name: '', stack: '' },
    },
    body: {
      size: `${bodySize}px`,
      weight: String(toPx(bodyTag.weight) || 400),
      lineHeight: String(bodyTag.lineHeight || '1.6'),
      letterSpacing: String(bodyTag.letterSpacing || '0'),
    },
    heading: {
      weight: String(toPx(tag.h1?.weight) || 700),
      lineHeight: String(tag.h1?.lineHeight || '1.25'),
      letterSpacing: String(tag.h1?.letterSpacing || '-0.01em'),
    },
    hierarchy,
  };
  // 감지된 브레이크포인트 메타 (미리보기·가이드 표시용)
  if (bps.tablet || bps.phone) {
    typo.breakpoints = { tablet: bps.tablet, phone: bps.phone };
  }
  return typo;
}

function buildDims(analysis) {
  const spacingCounts = [...analysis.spacingStats.entries()].sort((a, b) => b[1] - a[1]);
  const spacing = [];
  const seen = new Set();
  const preferred = [4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96];
  for (const n of preferred) {
    const used = spacingCounts.some(([v]) => Math.abs(v - n) <= 1);
    if (!used && spacing.length >= 6) continue;
    if (seen.has(n)) continue;
    seen.add(n);
    spacing.push({ id: `space-${spacing.length + 1}`, value: `${n}px` });
    if (spacing.length >= 8) break;
  }
  if (!spacing.length) {
    for (const n of [4, 8, 12, 16, 24, 32, 48, 64]) spacing.push({ id: `space-${spacing.length + 1}`, value: `${n}px` });
  }

  const radiusSorted = [...analysis.radiusStats.entries()].sort((a, b) => b[1] - a[1]);
  const radiusVals = [...new Set(radiusSorted.map(([v]) => v))].slice(0, 5);
  const radiusNames = ['radius-xs', 'radius-sm', 'radius-md', 'radius-lg', 'radius-xl'];
  const radius = radiusVals.map((v, i) => ({ id: radiusNames[i], value: v }));
  if (!radius.some((r) => parseInt(r.value, 10) >= 200)) radius.push({ id: 'radius-full', value: '999px' });

  const shadowSorted = [...analysis.shadowStats.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  const shadowNames = ['shadow-sm', 'shadow-md', 'shadow-lg'];
  const shadows = shadowSorted.map(([v], i) => ({ id: shadowNames[i], value: v }));
  if (!shadows.length) shadows.push({ id: 'shadow-md', value: '0 4px 12px rgba(0, 0, 0, 0.08)' });

  return { spacing, radius, shadows };
}

/* ============ 레이아웃 토큰 조립 (컨테이너 폭·섹션 여백·위젯 간격) ============ */

function buildLayout(analysis) {
  const s = analysis.layoutStats;
  const bestOf = (map, fallback) => {
    const entries = [...map.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
    return entries.length ? `${entries[0][0]}px` : fallback;
  };
  // gap 빈도 상위 값을 크기순으로: 큰 쪽 = 위젯 간격(카드 사이), 작은 쪽 = 스택 간격(위젯 내부)
  const gaps = [...s.gap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([v]) => v).sort((a, b) => b - a);
  // 섹션 세로 여백: 상위 2개를 크기순으로
  const pads = [...s.sectionPadY.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([v]) => v).sort((a, b) => b - a);
  return [
    { id: 'container-width', value: bestOf(s.containerWidth, '1200px') },
    { id: 'section-pad-y', value: pads.length ? `${pads[0]}px` : '80px' },
    { id: 'section-pad-y-sm', value: pads.length > 1 ? `${pads[1]}px` : '48px' },
    { id: 'widget-gap', value: gaps.length ? `${gaps[0]}px` : '24px' },
    { id: 'stack-gap', value: gaps.length > 1 ? `${gaps[gaps.length - 1]}px` : '12px' },
  ];
}

/* ============ 진입점 ============ */

export async function extractDesignSystem(html, baseUrl, opts = {}) {
  const { cssText, googleFontCss, inlineAttrs, doc } = await collectCss(html, baseUrl, opts);

  // 인라인 style 속성을 가짜 규칙으로 합성해 분석에 포함
  const inlinePseudo = inlineAttrs.map((s) => `[data-inline] { ${s} }`).join('\n');
  if (opts.onProgress) opts.onProgress('CSS 분석 중…');
  const analysis = analyzeCss(`${cssText}\n${inlinePseudo}`);

  // :root 변수 중 색상 → 통계 가산 (선언 토큰은 신뢰도↑, 이름 힌트로 컨텍스트 보정)
  for (const [name, value] of Object.entries(analysis.rootVars)) {
    if (/gradient|url\(/i.test(value)) continue;
    const c = parseColor(firstColorToken(value));
    if (!c) continue;
    const hex = rgbToHex(c);
    let s = analysis.colorStats.get(hex);
    if (!s) { s = { count: 0, text: 0, bg: 0, border: 0, shadow: 0, isVar: true }; analysis.colorStats.set(hex, s); }
    s.count += 4; s.isVar = true;
    if (/bg|background|surface/i.test(name)) s.bg += 2;
    if (/text|fg|ink|heading|title/i.test(name)) s.text += 2;
    if (/border|line|divider/i.test(name)) s.border += 2;
  }

  const colors = buildPalette(analysis.colorStats);
  const typography = buildTypography(analysis);
  const { spacing, radius, shadows } = buildDims(analysis);
  const layout = buildLayout(analysis);

  // 폰트 소스 판정 + project.fonts 구성
  const googleFamilies = new Set();
  for (const cssUrl of googleFontCss) {
    try {
      const u = new URL(cssUrl);
      for (const part of (u.searchParams.get('family') || '').split('|')) {
        const name = part.split(':')[0].replace(/\+/g, ' ').trim();
        if (name) googleFamilies.add(name.toLowerCase());
      }
    } catch (e) { /* 무시 */ }
  }
  const fonts = [];
  const addFont = (fam) => {
    const name = fam?.name;
    if (!name || SYSTEM_FONT_HINTS.test(name)) return;
    if (fonts.some((f) => f.family.toLowerCase() === name.toLowerCase())) return;
    const lower = name.toLowerCase();
    if (CDN_FONTS[lower]) {
      fonts.push({ family: name, weights: [400, 500, 700], source: 'google', cssUrl: CDN_FONTS[lower] });
    } else if (googleFamilies.has(lower)) {
      const cssUrl = googleFontCss.find((u) => u.toLowerCase().includes(lower.replace(/ /g, '+'))) || '';
      fonts.push({ family: name, weights: [400, 700], source: 'google', cssUrl });
    } else {
      fonts.push({ family: name, weights: [400, 700], source: 'system', cssUrl: '' });
    }
  };
  addFont(typography.families.heading);
  addFont(typography.families.body);

  // 다크 변수 → 매칭 토큰 적용
  let mode = 'auto';
  const darkVarEntries = Object.entries(analysis.darkVars);
  if (darkVarEntries.length) {
    mode = 'manual';
    for (const g of colors.groups) {
      for (const t of g.tokens) {
        const dv = analysis.darkVars[t.cssVar] || analysis.darkVars[t.cssVar.replace(/^--/, '')];
        if (dv && !/gradient|url\(/i.test(dv)) {
          const c = parseColor(firstColorToken(dv));
          if (c) t.dark = rgbToHex(c);
        }
      }
    }
  }

  const siteName = doc.querySelector('meta[property="og:site_name"]')?.content
    || doc.querySelector('title')?.textContent?.trim()
    || (baseUrl ? new URL(baseUrl).hostname : '');

  return {
    version: 1,
    meta: {
      name: (siteName || '추출 프로젝트').slice(0, 60),
      sourceUrl: baseUrl || '',
      extractedAt: new Date().toISOString(),
      generator: 'design-studio',
    },
    colors: { mode, groups: colors.groups },
    typography,
    spacing, radius, shadows, layout, fonts,
    preview: { theme: 'light', viewport: 'desktop', components: { buttons: true, inputs: true, cards: true, badges: true, alerts: true, tabs: true, accordion: true, carousel: true, forms: true, nav: true, data: true, misc: true, cards2: true, content: true, overlay: true, pricing: true, flow: true, misc2: true, header: true } },
    export: {
      prefix: 'ds',
      builders: { bricks: true, elementor: true, greenshift: true, divi: true, builderius: true, generic: true },
    },
    _stats: {
      cssVars: Object.keys(analysis.rootVars).length,
      darkVars: darkVarEntries.length,
      colorsConsidered: analysis.colorStats.size,
      fontFamilies: analysis.fontFamilyFreq.size,
    },
  };
}
