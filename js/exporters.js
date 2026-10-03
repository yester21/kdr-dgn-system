// exporters.js — 프로젝트 → 빌더별 임포트 파일 변환
// 형식 근거:
//  - Bricks: fin-calc 실전 투입 샘플(fc-bricks_theme_styles / color_palette / global_variables)과 동일 구조
//  - Elementor: 키트 site-settings(system_colors/custom_colors/system_typography/custom_typography)
//  - GreenShift: greenlight-vibe 스킬 global-settings.md 실측 figma_settings 구조
//  - Divi / Builderius: 공개 문서 기반 초기 형식(검증 대기 — IMPORT-GUIDE에 명시)

import { hex6 } from './util.js';
import { findToken } from './store.js';

/* ---------- 공용 헬퍼 ---------- */

function colorTokens(project) {
  const out = [];
  for (const g of project.colors.groups) {
    for (const t of g.tokens) out.push({ ...t, group: g.id });
  }
  return out;
}

function tokenVar(t) {
  // --primary 형태 보장
  return t.cssVar.startsWith('--') ? t.cssVar : `--${t.cssVar}`;
}

function tokenName(t) {
  return t.cssVar.replace(/^--/, '');
}

function hierarchyBy(project, ids) {
  return project.typography.hierarchy.filter((h) => ids.includes(h.id));
}

function hierItem(project, id) {
  return project.typography.hierarchy.find((h) => h.id === id);
}

// Bricks 브레이크포인트 접미어: 태블릿(≤991)=_tablet, 폰은 감지 px에 따라 _landscape(≤767)/_portrait(≤478)
function bricksPhoneSuffix(project) {
  const phoneBp = project.typography.breakpoints?.phone;
  return phoneBp && phoneBp <= 500 ? '_portrait' : '_landscape';
}

// 레이아웃 토큰 값 조회
function layoutVal(project, id, fallback) {
  return project.layout?.find((l) => l.id === id)?.value || fallback;
}

function fontStack(project, which) {
  const f = project.typography.families[which === 'heading' ? 'heading' : 'body'];
  return f.stack || f.name || '';
}

function primaryOf(project) {
  return colorTokens(project).find((t) => t.id === 'primary' || t.cssVar === '--primary')?.value || '#4c8dff';
}

/* ================================================================
   Bricks — 3종 파일 (fin-calc 실샘플과 동일 구조)
   ================================================================ */

export function exportBricks(project) {
  const tokens = colorTokens(project);
  const body = project.typography.body;
  const phoneSfx = bricksPhoneSuffix(project);

  // 반응형 본문/제목 값 (계층의 body/h1 항목에서)
  const bodyHier = hierItem(project, 'body');
  const h1Hier = hierItem(project, 'h1');
  const respBody = {};
  if (bodyHier?.tablet?.size) respBody[`font-size_tablet`] = bodyHier.tablet.size;
  if (bodyHier?.phone?.size) respBody[`font-size${phoneSfx}`] = bodyHier.phone.size;
  const respHeading = {};
  if (h1Hier?.tablet?.size) respHeading[`font-size_tablet`] = h1Hier.tablet.size;
  if (h1Hier?.phone?.size) respHeading[`font-size${phoneSfx}`] = h1Hier.phone.size;

  // 1) 테마 스타일
  const styleId = hex6();
  const themeStyles = {
    [styleId]: {
      label: `${project.meta.name || 'Design Studio'} Base`,
      settings: {
        general: {
          siteBackground: { color: { raw: 'var(--bg-default)' } },
          contentBackground: { color: { raw: 'var(--bg-subtle)' } },
          containerMaxWidth: layoutVal(project, 'container-width', '1200px'),
        },
        typography: {
          typographyHtml: '100%',
          typographyBody: {
            'font-family': fontStack(project, 'body'),
            'font-size': body.size,
            'font-weight': body.weight,
            'line-height': body.lineHeight,
            color: { raw: 'var(--text-body)' },
            ...respBody,
          },
          typographyHeadings: {
            'font-family': fontStack(project, 'heading'),
            'font-weight': project.typography.heading.weight,
            'color': { raw: 'var(--text-strong)' },
            ...(Object.keys(respHeading).length ? { 'font-size': h1Hier.size, ...respHeading } : {}),
          },
        },
        colors: {
          colorPrimary: { raw: 'var(--primary)' },
          colorSecondary: { raw: hasVar(tokens, '--accent-1') ? 'var(--accent-1)' : 'var(--text-strong)' },
          colorMuted: { raw: 'var(--text-sub)' },
          colorBorder: { raw: 'var(--border-light)' },
          colorDanger: { raw: hasVar(tokens, '--danger') ? 'var(--danger)' : '#f04452' },
        },
        conditions: { conditions: [{ main: 'any' }] },
      },
    },
  };

  // 2) 컬러 팔레트 — 모든 색 토큰 (raw=var 참조, fc 패턴)
  const palette = [{
    id: hex6(),
    name: project.meta.name || 'Design System',
    colors: tokens.map((t) => {
      const entry = { id: hex6(), light: t.value, raw: tokenVar(t) };
      if (t.dark) entry.dark = t.dark;
      return entry;
    }),
  }];

  // 3) 글로벌 변수 — 색(변수 정의 보장) + 타이포 + 간격 + 라디우스
  const variables = [];
  for (const t of tokens) {
    variables.push({ id: tokenName(t), name: tokenName(t), value: t.value, category: 'colors' });
  }
  const pushVar = (id, value, category) => {
    if (value == null || value === '') return;
    variables.push({ id, name: id, value: String(value), category });
  };
  pushVar('font-family-body', fontStack(project, 'body'), 'typography');
  pushVar('font-family-heading', fontStack(project, 'heading'), 'typography');
  for (const h of project.typography.hierarchy) {
    pushVar(`fs-${h.id}`, h.size, 'typography');
    if (h.tablet?.size) pushVar(`fs-${h.id}-tablet`, h.tablet.size, 'typography');
    if (h.phone?.size) pushVar(`fs-${h.id}-phone`, h.phone.size, 'typography');
  }
  pushVar('lh-body', body.lineHeight, 'typography');
  pushVar('fw-heading', project.typography.heading.weight, 'typography');
  for (const d of project.spacing) pushVar(d.id, d.value, 'spacing');
  for (const d of project.radius) pushVar(d.id, d.value, 'radius');
  for (const l of project.layout || []) pushVar(l.id, l.value, 'layout');

  return [
    { path: 'bricks/theme-styles.json', content: JSON.stringify(themeStyles, null, 2) },
    { path: 'bricks/color-palette.json', content: JSON.stringify(palette, null, 2) },
    { path: 'bricks/global-variables.json', content: JSON.stringify(variables, null, 2) },
  ];
}

function hasVar(tokens, cssVar) {
  return tokens.some((t) => t.cssVar === cssVar);
}

/* ================================================================
   Elementor — 키트 site-settings JSON
   ================================================================ */

export function exportElementor(project) {
  const tokens = colorTokens(project);
  const get = (cssVar, fallback) => findToken(project, cssVar)?.value || fallback;
  const hexId = () => {
    let s = '';
    for (let i = 0; i < 7; i++) s += Math.floor(Math.random() * 16).toString(16);
    return s;
  };

  const systemColors = [
    { _id: 'primary', title: 'Primary', color: get('--primary', primaryOf(project)) },
    { _id: 'secondary', title: 'Secondary', color: get('--accent-1', get('--text-strong', '#333a45')) },
    { _id: 'text', title: 'Text', color: get('--text-body', '#333a45') },
    { _id: 'accent', title: 'Accent', color: get('--primary-hover', get('--primary', '#4c8dff')) },
  ];
  const customColors = tokens
    .filter((t) => !['--primary', '--accent-1', '--text-body', '--primary-hover'].includes(t.cssVar))
    .map((t) => ({ _id: hexId(), title: t.name, color: t.value }));

  const famHeading = project.typography.families.heading.name || '';
  const famBody = project.typography.families.body.name || '';
  const typoBase = (family, weight) => ({
    typography_typography: 'custom',
    typography_font_family: family,
    typography_font_weight: String(weight),
  });

  const systemTypography = [
    { _id: 'primary', title: 'Primary', ...typoBase(famHeading || famBody, project.typography.heading.weight) },
    { _id: 'secondary', title: 'Secondary', ...typoBase(famHeading || famBody, project.typography.heading.weight) },
    {
      _id: 'text', title: 'Text', ...typoBase(famBody || famHeading, project.typography.body.weight),
      typography_line_height: { unit: 'em', size: String(project.typography.body.lineHeight).replace(/px$/, '') },
    },
    { _id: 'accent', title: 'Accent', ...typoBase(famBody || famHeading, '500') },
  ];

  // 반응형: system text(본문)에 태블릿/모바일 크기
  const bodyHier = hierItem(project, 'body');
  if (bodyHier?.tablet?.size) {
    systemTypography[2].typography_font_size_tablet = { unit: 'px', size: parseFloat(bodyHier.tablet.size) || 16 };
  }
  if (bodyHier?.phone?.size) {
    systemTypography[2].typography_font_size_mobile = { unit: 'px', size: parseFloat(bodyHier.phone.size) || 16 };
  }

  const customTypography = project.typography.hierarchy.map((h) => {
    const entry = {
      _id: hexId(),
      title: h.label,
      typography_typography: 'custom',
      typography_font_family: h.family === 'body' ? (famBody || famHeading) : (famHeading || famBody),
      typography_font_weight: String(h.weight),
      typography_font_size: { unit: 'px', size: parseFloat(h.size) || 16 },
      typography_line_height: { unit: 'em', size: String(h.lineHeight).replace(/px$/, '') },
      ...(h.letterSpacing && h.letterSpacing !== '0'
        ? { typography_letter_spacing: { unit: 'em', size: String(h.letterSpacing).replace(/px$/, '') } }
        : {}),
    };
    if (h.tablet?.size) entry.typography_font_size_tablet = { unit: 'px', size: parseFloat(h.tablet.size) || 16 };
    if (h.phone?.size) entry.typography_font_size_mobile = { unit: 'px', size: parseFloat(h.phone.size) || 16 };
    return entry;
  });

  const kit = {
    content: [],
    'site-settings': {
      system_colors: systemColors, custom_colors: customColors,
      system_typography: systemTypography, custom_typography: customTypography,
      container_width: { unit: 'px', size: parseFloat(layoutVal(project, 'container-width', '1140')) || 1140, column_size: '100' },
    },
    version: '0.4',
    title: `${project.meta.name || 'Design Studio'} Design System`,
    type: 'kit',
  };
  return [{ path: 'elementor/site-settings.json', content: JSON.stringify(kit, null, 2) }];
}

/* ================================================================
   GreenShift — figma_settings 형식 (global-settings.md 실측)
   ================================================================ */

export function exportGreenShift(project) {
  const variables = [
    ...colorTokens(project).map((t) => ({
      variable: tokenVar(t),
      variable_value: t.value,
      label: tokenName(t),
      value: `var(${tokenVar(t)})`,
      group: 'imported',
    })),
    ...(project.layout || []).map((l) => ({
      variable: `--${l.id.startsWith('--') ? l.id.slice(2) : l.id}`,
      variable_value: l.value,
      label: String(l.id).replace(/^--/, ''),
      value: `var(--${String(l.id).replace(/^--/, '')})`,
      group: 'layout',
    })),
  ];

  const figmaFonts = project.fonts
    .filter((f) => f.source === 'google' && f.family)
    .map((f) => {
      // fontFile은 폰트 파일(woff2/woff/ttf/otf) 직접 URL이어야 서버가 다운로드한다.
      // cssUrl이 CSS를 가리키면 비워둔다(REST 직접 적용 시 woff2로 재해석해 채움).
      const direct = /\.woff2?($|\?)|\.ttf($|\?)|\.otf($|\?)/i.test(f.cssUrl || '') ? f.cssUrl : '';
      return {
        fontFamily: f.family,
        fontStyle: 'Regular',
        fontFile: direct,
        _weights: f.weights || [], // 내부용 — REST 적용 시 woff2 재해석
      };
    });

  const payload = { settings: { variables, ...(figmaFonts.length ? { figma_fonts: figmaFonts } : {}) } };
  return [{ path: 'greenshift/figma-settings.json', content: JSON.stringify(payload, null, 2) }];
}

/* ================================================================
   Divi — 커스터마이저 포터빌리티 JSON (초기 형식·검증 대기)
   ================================================================ */

export function exportDivi(project) {
  const tokens = colorTokens(project);
  const get = (cssVar, fallback) => findToken(project, cssVar)?.value || fallback;
  const body = project.typography.body;
  const famBody = project.typography.families.body.name || '';
  const famHeading = project.typography.families.heading.name || '';

  // Divi 포터빌리티(커스터마이저) 내보내기 준수 구조 — 옵션 백 + 글로벌 컬러
  const bodyHier = hierItem(project, 'body');
  const h1Hier = hierItem(project, 'h1');
  const diviBody = {
    accent_color: get('--primary', primaryOf(project)),
    link_color: get('--primary', primaryOf(project)),
    font_color: get('--text-body', '#333a45'),
    header_color: get('--text-strong', '#111418'),
    footer_bg: get('--bg-muted', '#eeeff3'),
    body_font_size: String(parseInt(body.size, 10) || 16),
    body_font_height: String(parseFloat(body.lineHeight) || 1.6),
    body_font_style: famBody,
    heading_font_style: famHeading,
    all_buttons_font_size: '16',
    all_buttons_border_radius: String(project.radius.find((r) => r.id === 'radius-md')?.value || '8'),
  };
  // 반응형 (Divi 커스터마이저 tablet/phone 접미어 — 초기 형식)
  if (bodyHier?.tablet?.size) diviBody.body_font_size_tablet = String(parseInt(bodyHier.tablet.size, 10) || 16);
  if (bodyHier?.phone?.size) diviBody.body_font_size_phone = String(parseInt(bodyHier.phone.size, 10) || 16);
  if (h1Hier?.tablet?.size) diviBody.heading_font_size_tablet = String(parseInt(h1Hier.tablet.size, 10) || 40);
  if (h1Hier?.phone?.size) diviBody.heading_font_size_phone = String(parseInt(h1Hier.phone.size, 10) || 30);

  const payload = {
    timestamp: Math.floor(Date.now() / 1000),
    author: 'Design Studio',
    presets: {},
    options: {
      et_divi: diviBody,
      et_global_data: {
        global_colors: Object.fromEntries(tokens.slice(0, 12).map((t, i) => [
          `gcid-${i + 1}`,
          { name: t.name, color: t.value },
        ])),
      },
    },
  };
  return [{ path: 'divi/divi-customizer.json', content: JSON.stringify(payload, null, 2) }];
}

/* ================================================================
   Builderius — 디자인 토큰 JSON (초기 형식·검증 대기)
   ================================================================ */

export function exportBuilderius(project) {
  const tokens = colorTokens(project);
  const payload = {
    $schema: 'https://design-tokens.org/ (Builderius 초기 형식 — 가져오기 지원 여부는 사이트에서 확인 필요)',
    $note: 'Builderius Site Settings → Design Tokens 가 지원하는 가져오기 형식이 공개 문서로 확정되지 않아 W3C 토큰 구조로 출력합니다. 적용이 안 되면 generic/tokens.css를 Custom CSS에 붙여넣으세요.',
    color: Object.fromEntries(tokens.map((t) => [tokenName(t), { $type: 'color', $value: t.value }])),
    fontFamily: {
      heading: { $type: 'fontFamily', $value: [project.typography.families.heading.name || 'sans-serif'] },
      body: { $type: 'fontFamily', $value: [project.typography.families.body.name || 'sans-serif'] },
    },
    dimension: {
      ...Object.fromEntries(project.spacing.map((d) => [d.id, { $type: 'dimension', $value: d.value }])),
      ...Object.fromEntries(project.radius.map((d) => [d.id, { $type: 'dimension', $value: d.value }])),
    },
    shadow: Object.fromEntries(project.shadows.map((d) => [d.id, { $type: 'shadow', $value: d.value }])),
  };
  return [{ path: 'builderius/design-tokens.json', content: JSON.stringify(payload, null, 2) }];
}

/* ================================================================
   공용 — tokens.css / tokens.json(W3C) / Tailwind
   ================================================================ */

export function exportGeneric(project) {
  const files = [];
  const tokens = colorTokens(project);

  // tokens.css
  const lines = ['/* Design Studio — 추출·조정된 디자인 토큰 */', ':root {'];
  for (const t of tokens) lines.push(`  ${tokenVar(t)}: ${t.value};`);
  const fam = project.typography.families;
  if (fam.body.stack) lines.push(`  --font-body: ${fam.body.stack};`);
  if (fam.heading.stack) lines.push(`  --font-heading: ${fam.heading.stack};`);
  for (const h of project.typography.hierarchy) {
    lines.push(`  --fs-${h.id}: ${h.size};`);
  }
  for (const d of [...project.spacing, ...project.radius]) lines.push(`  ${d.id.startsWith('--') ? d.id : `--${d.id}`}: ${d.value};`);
  for (const d of project.shadows) lines.push(`  ${d.id.startsWith('--') ? d.id : `--${d.id}`}: ${d.value};`);
  lines.push('  /* 레이아웃 */');
  for (const l of project.layout || []) lines.push(`  ${l.id.startsWith('--') ? l.id : `--${l.id}`}: ${l.value};`);
  lines.push('}');
  // 반응형: 감지된 브레이크포인트에서 폰트 크기 오버라이드
  const respItems = project.typography.hierarchy.filter((h) => h.tablet?.size || h.phone?.size);
  if (respItems.length) {
    const bps = project.typography.breakpoints || {};
    const tBp = bps.tablet || 991;
    const pBp = bps.phone || 640;
    lines.push('', `/* 반응형 타이포그래피 (추출 브레이크포인트) */`);
    const tItems = respItems.filter((h) => h.tablet?.size);
    if (tItems.length) {
      lines.push(`@media (max-width: ${tBp}px) {`, '  :root {');
      for (const h of tItems) lines.push(`    --fs-${h.id}: ${h.tablet.size};`);
      lines.push('  }', '}');
    }
    const pItems = respItems.filter((h) => h.phone?.size);
    if (pItems.length) {
      lines.push(`@media (max-width: ${pBp}px) {`, '  :root {');
      for (const h of pItems) lines.push(`    --fs-${h.id}: ${h.phone.size};`);
      lines.push('  }', '}');
    }
  }
  const darkTokens = tokens.filter((t) => t.dark);
  if (darkTokens.length) {
    lines.push('', '[data-theme="dark"] {');
    for (const t of darkTokens) lines.push(`  ${tokenVar(t)}: ${t.dark};`);
    lines.push('}');
  }
  files.push({ path: 'generic/tokens.css', content: lines.join('\n') + '\n' });

  // tokens.json (W3C Design Tokens)
  const w3c = {
    $description: `${project.meta.name} — Design Studio 추출`,
    color: Object.fromEntries(tokens.map((t) => [tokenName(t), { $type: 'color', $value: t.value, ...(t.dark ? { $extensions: { 'com.design-studio.dark': t.dark } } : {}) }])),
    fontFamily: {},
    dimension: {},
    shadow: {},
    typography: {},
  };
  if (fam.heading.name) w3c.fontFamily.heading = { $type: 'fontFamily', $value: [fam.heading.name] };
  if (fam.body.name) w3c.fontFamily.body = { $type: 'fontFamily', $value: [fam.body.name] };
  for (const d of [...project.spacing, ...project.radius, ...(project.layout || [])]) w3c.dimension[d.id.replace(/^--/, '')] = { $type: 'dimension', $value: d.value };
  for (const d of project.shadows) w3c.shadow[d.id.replace(/^--/, '')] = { $type: 'shadow', $value: d.value };
  for (const h of project.typography.hierarchy) {
    w3c.typography[h.id] = {
      $type: 'typography',
      $value: {
        fontSize: h.size,
        fontWeight: Number(h.weight) || 400,
        lineHeight: h.lineHeight,
        ...(h.letterSpacing && h.letterSpacing !== '0' ? { letterSpacing: h.letterSpacing } : {}),
      },
    };
  }
  files.push({ path: 'generic/tokens.json', content: JSON.stringify(w3c, null, 2) });

  // Tailwind 스니펫
  const scale = (id) => tokens.find((t) => t.id === `primary-${id}`)?.value;
  const tw = `/** ${project.meta.name} — Tailwind 설정 스니펫 (tailwind.config.js) */
module.exports = {
  theme: {
    extend: {
      colors: {
        primary: {
${['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950']
  .filter((s) => scale(s))
  .map((s) => `          '${s}': '${scale(s)}',`)
  .join('\n')}
          DEFAULT: '${tokens.find((t) => t.cssVar === '--primary')?.value || primaryOf(project)}',
        },
${tokens.filter((t) => !t.cssVar.startsWith('--primary')).map((t) => `        '${tokenName(t)}': '${t.value}',`).join('\n')}
      },
      fontFamily: {
${fam.heading.name ? `        heading: ['${fam.heading.name.replace(/'/g, '')}', 'sans-serif'],` : ''}
${fam.body.name ? `        body: ['${fam.body.name.replace(/'/g, '')}', 'sans-serif'],` : ''}
      },
      borderRadius: {
${project.radius.map((d) => `        '${d.id.replace(/^radius-/, '')}': '${d.value}',`).join('\n')}
      },
      boxShadow: {
${project.shadows.map((d) => `        '${d.id.replace(/^shadow-/, '')}': '${d.value}',`).join('\n')}
      },
    },
  },
};
`;
  files.push({ path: 'generic/tailwind-snippet.js', content: tw });
  return files;
}

/* ================================================================
   IMPORT-GUIDE.md
   ================================================================ */

export function buildImportGuide(project, enabled) {
  const name = project.meta.name || 'Design Studio';
  return `# ${name} — 디자인 시스템 임포트 안내

추출 출처: ${project.meta.sourceUrl || '(수동 구성)'} · 생성: ${new Date().toISOString().slice(0, 10)}

## Bricks (검증 형식 — 실전 투입 샘플과 동일 구조)

1. **컬러 팔레트**: Bricks → Settings → Theme Styles → Colors → 팔레트 '+' → Import → \`bricks/color-palette.json\`
2. **테마 스타일**: 빌더 열기 → Style Manager(왼쪽 패널) → Theme Styles → import 아이콘 → \`bricks/theme-styles.json\`
3. **글로벌 변수**: Settings → Theme Styles → Variables → import → \`bricks/global-variables.json\`
4. 폰트: 사용한 웹폰트를 Bricks Font Manager 또는 자식 테마 enqueue로 등록하세요.
- 팔레트 항목은 \`var(--primary)\` 형태로 참조하고, 변수 파일이 실제 값을 정의합니다.
- **반응형 폰트**: 태블릿 값은 \`_tablet\`(≤991), 모바일 값은 감지 브레이크포인트에 따라 \`_landscape\`(≤767) 또는 \`_portrait\`(≤478) 접미어로 들어갑니다(계층 크기는 \`fs-h1-tablet\` 등 변수로도 제공). 반응형 값이 포함된 테마 스타일 임포트는 실사이트 검증 대기입니다.
${enabled.bricks ? '' : '\n(현재 내보내기에서 제외됨)'}

## Elementor

1. WordPress 관리자 → Elementor → Site Settings 열기
2. 좌측 상단 ☰(햄버거) → **Import** → \`elementor/site-settings.json\`
3. 글로벌 컬러/타이포가 즉시 적용됩니다(기존 키트 설정을 덮어씀 — 필요 시 먼저 백업 Export).
- 반응형 폰트 크기는 각 타이포그래피 항목에 \`typography_font_size_tablet\` / \`_mobile\` 값으로 포함됩니다.
- 다크모드는 Elementor 키트가 네이티브 지원하지 않으므로 \`generic/tokens.css\`의 \`[data-theme="dark"]\` 블록을 Custom Code에 추가하세요.
${enabled.elementor ? '' : '\n(현재 내보내기에서 제외됨)'}

## GreenShift (파일 임포트 기능이 없어 두 경로 제공)

- **자동(권장)**: Design Studio 앱의 'GreenShift 직접 적용'에 사이트 URL·앱 비밀번호를 넣고 적용 — 기존 설정을 GET으로 읽어 병합합니다.
- **수동**: \`greenshift/figma-settings.json\`의 \`settings.variables\`를 GreenShift → Global Styles → Variables에 값 입력 방식으로 등록. 폰트는 \`figma_fonts\` 항목 참고.
- **반응형 제한**: GreenShift 글로벌 변수는 단일 값이라 반응형 폰트 크기를 담지 못합니다. 블록 단위에서는 styleAttributes가 반응형 배열(desktop/tablet/mobile_landscape/mobile_portrait)을 지원하므로 \`generic/tokens.css\`의 미디어쿼리를 Custom CSS에 함께 넣는 방식을 권장합니다.
${enabled.greenshift ? '' : '\n(현재 내보내기에서 제외됨)'}

## Divi — ⚠ 초기 형식 (검증 대기)

1. Divi → Theme Customizer → 상단 포터빌리티(⇅) 아이콘 → Import → \`divi/divi-customizer.json\`
2. 이 파일은 Divi 포터빌리티 구조를 따르려 작성했으나 **실제 Divi 사이트 검증 전**입니다. 임포트가 거부되면:
   - Divi 4.10+ Global Colors(divi_global_data.global_colors 값을 수동 등록)
   - 또는 \`generic/tokens.css\`를 Divi → Theme Options → Custom CSS에 붙여넣기
${enabled.divi ? '' : '\n(현재 내보내기에서 제외됨)'}

## Builderius — ⚠ 초기 형식 (검증 대기)

1. \`builderius/design-tokens.json\`을 Site Settings → Design Tokens 가져오기에 시도
2. 공식 문서가 가져오기 형식을 확정 발표하지 않아 W3C 토큰 구조로 출력했습니다. 적용이 안 되면 \`generic/tokens.css\`를 글로벌 CSS에 붙여넣으세요.
${enabled.builderius ? '' : '\n(현재 내보내기에서 제외됨)'}

## 공용 토큰

- \`generic/tokens.css\` — CSS 변수 + 반응형 미디어쿼리(추출 브레이크포인트의 폰트 크기) + 다크모드 블록. 어떤 테마/빌더에도 붙여넣을 수 있는 기준 파일
- \`generic/tokens.json\` — W3C Design Tokens 표준
- \`generic/tailwind-snippet.js\` — Tailwind 설정용 스니펫

## 검증 상태 요약

| 빌더 | 상태 |
|---|---|
| Bricks | ✅ 실전 투입 형식과 동일 (테마스타일·팔레트·변수) |
| Elementor | ✅ 키트 site-settings 표준 키 (임포트 래퍼 문서 기반) |
| GreenShift | ✅ REST 실측 규격 (파일+직접적용) |
| Divi | ⚠ 초기 형식 — 실제 임포트 검증 필요 |
| Builderius | ⚠ 초기 형식 — 실제 임포트 검증 필요 |
`;
}

/* ================================================================
   묶음 진입점
   ================================================================ */

export function buildExports(project) {
  const enabled = project.export.builders;
  const files = [];
  if (enabled.bricks) files.push(...exportBricks(project));
  if (enabled.elementor) files.push(...exportElementor(project));
  if (enabled.greenshift) files.push(...exportGreenShift(project));
  if (enabled.divi) files.push(...exportDivi(project));
  if (enabled.builderius) files.push(...exportBuilderius(project));
  if (enabled.generic) files.push(...exportGeneric(project));
  files.push({ path: 'project.json', content: JSON.stringify(project, null, 2) });
  files.push({ path: 'IMPORT-GUIDE.md', content: buildImportGuide(project, enabled) });
  return files;
}
