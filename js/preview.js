// preview.js — 디자인 시스템 미리보기: 토큰 주입 + 에셋 갤러리 렌더
// 캔버스의 모든 요소는 --p-* 토큰만 사용 (프리뷰 = 출력물 원칙)

import { escapeHtml, contrastRatio, hexToOklch, oklchToHex, safeCssValue } from './util.js';
import { findToken } from './store.js';

const SAMPLE_HEADING = '제목처럼 쓰이는 문장의 샘플';
const SAMPLE_BODY = '본문처럼 읽히는 문장입니다. 행간과 자간, 글자의 굵기가 실제 문서에서 어떻게 보이는지 확인할 수 있습니다.';

// 인라인 스타일 값 게이트: 안전 검증 후 HTML 이스케이프 (미승인 값은 fallback)
const cssVal = (v, fb = '') => escapeHtml(safeCssValue(v, fb));

/* ---------- 토큰 → 캔버스 CSS 변수 ---------- */

function tokenValue(project, cssVar, theme) {
  const t = findToken(project, cssVar);
  if (!t) return null;
  return theme === 'dark' && t.dark ? t.dark : t.value;
}

function contrastOn(hex) {
  return contrastRatio(hex, '#ffffff') >= 3 ? '#ffffff' : '#111418';
}

function softTint(hex) {
  const o = hexToOklch(hex);
  if (!o) return hex;
  return oklchToHex({ l: 0.952, c: Math.min(o.c * 0.3, 0.045), h: o.h });
}

export function applyTokens(canvas, project, theme) {
  const S = canvas.style;
  const val = (name, fallback = null) => tokenValue(project, name, theme) || fallback;

  // 모든 색 토큰 → --p-<name> / --p-<name>-dark
  for (const g of project.colors.groups) {
    for (const t of g.tokens) {
      const name = t.cssVar.replace(/^--/, '');
      S.setProperty(`--p-${name}`, theme === 'dark' && t.dark ? t.dark : t.value);
      S.setProperty(`--p-${name}-dark`, t.dark || t.value);
    }
  }

  // 컴포넌트용 별칭
  const primary = val('--primary', '#4c8dff');
  const danger = val('--danger', '#f04452');
  const success = val('--success', '#1d8a3e');
  const warn = val('--warn', '#b25000');
  const info = val('--info', primary);

  S.setProperty('--p-bg', val('--bg-default', theme === 'dark' ? '#10141a' : '#ffffff'));
  S.setProperty('--p-text-body', val('--text-body', theme === 'dark' ? '#d6dde6' : '#333a45'));
  S.setProperty('--p-text-muted', val('--text-sub', '#66707f'));
  S.setProperty('--p-border', val('--border-light', theme === 'dark' ? 'rgba(255,255,255,.1)' : 'rgba(0,0,0,.08)'));
  S.setProperty('--p-surface', val('--bg-subtle', theme === 'dark' ? 'rgba(255,255,255,.04)' : 'rgba(0,0,0,.02)'));
  S.setProperty('--p-primary', primary);
  S.setProperty('--p-primary-soft', val('--primary-soft', softTint(primary)));
  S.setProperty('--p-primary-contrast', contrastOn(primary));
  S.setProperty('--p-secondary', val('--text-strong', theme === 'dark' ? '#2a3444' : '#1f2937'));
  S.setProperty('--p-secondary-contrast', theme === 'dark' ? '#ffffff' : '#ffffff');
  S.setProperty('--p-danger', danger);
  S.setProperty('--p-danger-soft', softTint(danger));
  S.setProperty('--p-success', success);
  S.setProperty('--p-success-soft', softTint(success));
  S.setProperty('--p-warn', warn);
  S.setProperty('--p-warn-soft', softTint(warn));
  S.setProperty('--p-info', info);

  // 치수 토큰
  const radiusById = (id, fb) => project.radius.find((r) => r.id === id)?.value || project.radius[Math.floor(project.radius.length / 2)]?.value || fb;
  S.setProperty('--p-radius-md', radiusById('radius-md', '10px'));
  S.setProperty('--p-radius-lg', radiusById('radius-lg', '14px'));

  // 레이아웃 토큰 (컨테이너 폭·섹션 여백·위젯/스택 간격)
  const layoutVal = (id, fallback) => project.layout?.find((l) => l.id === id)?.value || fallback;
  S.setProperty('--p-container-width', layoutVal('container-width', '1200px'));
  S.setProperty('--p-section-pad-y', layoutVal('section-pad-y', '80px'));
  S.setProperty('--p-section-pad-y-sm', layoutVal('section-pad-y-sm', '48px'));
  S.setProperty('--p-widget-gap', layoutVal('widget-gap', '16px'));
  S.setProperty('--p-stack-gap', layoutVal('stack-gap', '10px'));
  S.setProperty('--p-shadow-sm', project.shadows.find((x) => x.id === 'shadow-sm')?.value || '');

  // 폰트
  const sysStack = `-apple-system, BlinkMacSystemFont, system-ui, 'Malgun Gothic', sans-serif`;
  S.setProperty('--p-font-heading', project.typography.families.heading.stack || project.typography.families.body.stack || sysStack);
  S.setProperty('--p-font-body', project.typography.families.body.stack || sysStack);
}

/* ---------- 폰트 CDN 로드 ---------- */

export function ensureFontsLoaded(project) {
  const head = document.head;
  const wanted = new Set();
  for (const f of project.fonts) {
    if (f.source !== 'google') continue;
    const name = f.family.trim();
    if (!name) continue;
    let href = f.cssUrl;
    if (!href) {
      const fam = name.replace(/ /g, '+');
      const w = [...new Set([...(f.weights || []), 400, 700])].sort((a, b) => a - b).filter((x) => x >= 100 && x <= 900);
      href = `https://fonts.googleapis.com/css2?family=${fam}:wght@${w.join(';')}&display=swap`;
    }
    wanted.add(href);
  }
  // 기존 링크 정리
  for (const link of [...head.querySelectorAll('link[data-dsg-font]')]) {
    if (!wanted.has(link.href)) link.remove();
  }
  const existing = new Set([...head.querySelectorAll('link[data-dsg-font]')].map((l) => l.href));
  for (const href of wanted) {
    if (existing.has(href)) continue;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.dataset.dsgFont = '1';
    head.appendChild(link);
  }
}

/* ---------- 렌더 ---------- */

export function renderPreview(canvas, project, { onCopyColor } = {}) {
  ensureFontsLoaded(project);
  const viewport = project.preview.viewport || 'desktop';
  const frag = document.createDocumentFragment();

  // 뷰포트 시뮬레이션 클래스
  canvas.classList.toggle('pv-vp-tablet', viewport === 'tablet');
  canvas.classList.toggle('pv-vp-phone', viewport === 'phone');

  frag.append(sectionColors(project, onCopyColor));
  frag.append(sectionTypography(project, viewport));
  frag.append(sectionFonts(project));
  frag.append(sectionSpacing(project));
  frag.append(sectionComponents(project));

  canvas.replaceChildren(frag);
}

function tierValue(item, viewport, key) {
  const tier = viewport === 'tablet' ? item.tablet : viewport === 'phone' ? item.phone : null;
  return (tier && tier[key]) || item[key];
}

function section(project, id, title, meta) {
  const sec = document.createElement('section');
  sec.className = 'pv-section';
  sec.id = `sec-${id}`;
  sec.innerHTML = `<div class="pv-section-head">
    <div class="pv-section-title">${escapeHtml(title)}</div>
    ${meta ? `<div class="pv-section-meta">${escapeHtml(meta)}</div>` : ''}
  </div>`;
  return sec;
}

/* --- 컬러 --- */
function sectionColors(project, onCopyColor) {
  const sec = section(project, 'colors', 'Colors', `다크모드: ${project.colors.mode === 'manual' ? '사이트 값 사용' : project.colors.mode === 'none' ? '없음' : '자동 도출'}`);
  for (const g of project.colors.groups) {
    if (!g.tokens.length) continue;
    const label = document.createElement('div');
    label.className = 'pv-group-label';
    label.textContent = g.name;
    sec.append(label);

    const grid = document.createElement('div');
    grid.className = 'sw-grid';
    for (const t of g.tokens) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'sw';
      btn.title = '클릭하면 hex 코드가 복사됩니다';
      btn.innerHTML = `
        <div class="sw-chip" style="background:${cssVal(t.value, '#888888')}"></div>
        <div class="sw-info">
          <div class="sw-name">${escapeHtml(t.name)}</div>
          <div class="sw-hex">${escapeHtml(t.value.toUpperCase())}${t.dark ? ` · 🌙 ${escapeHtml(t.dark.toUpperCase())}` : ''}</div>
          <div class="sw-var">${escapeHtml(t.cssVar)}</div>
        </div>`;
      btn.addEventListener('click', () => {
        navigator.clipboard?.writeText(t.value).then(() => onCopyColor?.(t));
      });
      grid.append(btn);
    }
    sec.append(grid);
  }
  return sec;
}

/* --- 타이포그래피 --- */
function sectionTypography(project, viewport) {
  const h = project.typography;
  const fam = h.families.heading.name || h.families.body.name || '시스템';
  const bps = h.breakpoints || {};
  const bpNote = bps.tablet || bps.phone
    ? ` · 반응형 감지 T≤${bps.tablet || '?'} / M≤${bps.phone || '?'}px`
    : '';
  const vpNote = viewport === 'tablet' ? ' · 태블릿 뷰' : viewport === 'phone' ? ' · 모바일 뷰' : '';
  const sec = section(project, 'typography', 'Typography', `${escapeHtml(fam)} · 본문 ${escapeHtml(h.body.size)}${bpNote}${vpNote}`);
  for (const item of h.hierarchy) {
    const size = tierValue(item, viewport, 'size');
    const lineHeight = tierValue(item, viewport, 'lineHeight');
    const respChips = [
      item.tablet?.size ? `<span class="type-resp-chip" title="태블릿${bps.tablet ? ` (≤${bps.tablet}px)` : ''}">T ${escapeHtml(item.tablet.size)}</span>` : '',
      item.phone?.size ? `<span class="type-resp-chip" title="모바일${bps.phone ? ` (≤${bps.phone}px)` : ''}">M ${escapeHtml(item.phone.size)}</span>` : '',
    ].join('');
    const row = document.createElement('div');
    row.className = 'type-row';
    row.innerHTML = `
      <div class="type-meta">
        <div><b>${escapeHtml(item.label)}</b></div>
        <div>${escapeHtml(size)} / ${escapeHtml(item.weight)}</div>
        <div>LH ${escapeHtml(lineHeight)} · LS ${escapeHtml(item.letterSpacing)}</div>
        ${respChips ? `<div class="type-resp">${respChips}</div>` : ''}
      </div>
      <div class="type-sample" style="
        font-size:${cssVal(size, '16px')};
        font-weight:${cssVal(item.weight, '400')};
        line-height:${cssVal(lineHeight, '1.5')};
        letter-spacing:${cssVal(item.letterSpacing, '0')};
        ${item.family === 'heading' ? '' : 'font-family:var(--p-font-body);'}
        ${/^(display|h[1-3])$/.test(item.id) ? `color:var(--p-text-strong, inherit)` : ''}
      ">${item.id === 'body' || item.id === 'small' ? SAMPLE_BODY : SAMPLE_HEADING}</div>`;
    sec.append(row);
  }
  return sec;
}

/* --- 폰트 --- */
function sectionFonts(project) {
  const sec = section(project, 'fonts', 'Fonts', `${project.fonts.length}개 패밀리`);
  if (!project.fonts.length) {
    sec.insertAdjacentHTML('beforeend', `<div class="adj-note" style="color:inherit;opacity:.6">감지된 웹폰트가 없습니다 — 시스템 폰트로 렌더 중입니다.</div>`);
    return sec;
  }
  const grid = document.createElement('div');
  grid.className = 'font-cards';
  for (const f of project.fonts) {
    const stack = `"${f.family.replace(/["'\\;,()]/g, '')}", -apple-system, system-ui, sans-serif`;
    const stackCss = cssVal(stack, 'system-ui');
    grid.insertAdjacentHTML('beforeend', `
      <div class="font-card">
        <div class="font-card-aa" style="font-family:${stackCss}">Aa 가</div>
        <div class="font-card-name">${escapeHtml(f.family)}</div>
        <div class="font-card-meta">${f.source === 'google' ? '웹폰트 CDN' : '시스템 폰트'}</div>
        <div class="font-weights" style="font-family:${stackCss}">
          ${(f.weights || []).map((w) => `<span style="font-weight:${Number(w) || 400}" title="${Number(w) || 400}">${escapeHtml(String(w))}</span>`).join('')}
        </div>
      </div>`);
  }
  sec.append(grid);
  return sec;
}

/* --- 스페이싱·라디우스·섀도우·레이아웃 --- */
function sectionSpacing(project) {
  const sec = section(project, 'spacing', 'Spacing · Radius · Shadow · Layout',
    `${project.spacing.length} / ${project.radius.length} / ${project.shadows.length} / ${project.layout?.length || 0}`);

  sec.insertAdjacentHTML('beforeend', `<div class="pv-group-label">Spacing</div>`);
  const dimList = document.createElement('div');
  dimList.className = 'dim-list';
  const maxVal = Math.max(...project.spacing.map((d) => parseFloat(d.value) || 0), 1);
  for (const d of project.spacing) {
    const w = parseFloat(d.value) || 0;
    dimList.insertAdjacentHTML('beforeend', `
      <div class="dim-row">
        <span class="dim-id">${escapeHtml(d.id)}</span>
        <span class="dim-bar" style="width:${Math.max(4, (w / maxVal) * 100)}%"></span>
        <span class="dim-val">${escapeHtml(d.value)}</span>
      </div>`);
  }
  sec.append(dimList);

  // 레이아웃 스펙imen — 컨테이너 폭 / 섹션 여백 / 위젯·스택 간격
  const L = (id, fb) => project.layout?.find((l) => l.id === id)?.value || fb;
  const cw = L('container-width', '1200px');
  const padY = L('section-pad-y', '80px');
  const padYSm = L('section-pad-y-sm', '48px');
  const wGap = L('widget-gap', '24px');
  const sGap = L('stack-gap', '12px');
  const padScale = Math.min(1, 96 / Math.max(parseFloat(padY) || 80, 1)); // 시각화용 축소 비율

  sec.insertAdjacentHTML('beforeend', `<div class="pv-group-label">Layout — 레이아웃 토큰 (레퍼런스 사이트에서 추출)</div>`);
  const lv = document.createElement('div');
  lv.className = 'layout-viz';
  lv.innerHTML = `
    <div class="dim-row" style="margin-bottom:12px">
      <span class="dim-id">container-width</span>
      <span style="flex:1">
        <span class="layout-canvas-frame" style="display:block">
          <span class="layout-container-bar" style="width:min(88%, calc((${cssVal(cw, '1200px')} / 1600px) * 100%))"></span>
          <span class="layout-container-label">${escapeHtml(cw)}</span>
        </span>
      </span>
      <span class="dim-val">${escapeHtml(cw)}</span>
    </div>
    <div class="dim-row" style="margin-bottom:12px;align-items:flex-start">
      <span class="dim-id">section-pad-y</span>
      <span style="flex:1">
        <span class="layout-pad-box" style="display:block">
          <span class="layout-pad-fill" style="display:block;height:${Math.round((parseFloat(padY) || 80) * padScale)}px"></span>
          <span class="layout-pad-content">섹션 콘텐츠 — 위아래 ${escapeHtml(padY)}</span>
          <span class="layout-pad-fill" style="display:block;height:${Math.round((parseFloat(padY) || 80) * padScale)}px"></span>
        </span>
        <span class="layout-viz-meta">--section-pad-y: ${escapeHtml(padY)} · --section-pad-y-sm: ${escapeHtml(padYSm)}</span>
      </span>
      <span class="dim-val">${escapeHtml(padY)}</span>
    </div>
    <div class="dim-row" style="align-items:flex-start">
      <span class="dim-id">widget-gap</span>
      <span style="flex:1">
        <span class="layout-gap-demo" style="display:flex">
          <span class="layout-gap-cell" style="display:flex;flex:1">위젯 A</span>
          <span style="width:${cssVal(wGap, '24px')};display:flex;align-items:center;justify-content:center"><span style="font-size:10px;font-family:var(--dsg-mono);color:var(--p-primary,#4c8dff);font-weight:700">${escapeHtml(wGap)}</span></span>
          <span class="layout-gap-cell" style="display:flex;flex:1">위젯 B</span>
        </span>
        <span class="layout-viz-meta">--widget-gap: ${escapeHtml(wGap)} (위젯 사이) · --stack-gap: ${escapeHtml(sGap)} (위젯 내부 요소 사이)</span>
      </span>
      <span class="dim-val">${escapeHtml(wGap)}</span>
    </div>`;
  sec.append(lv);

  sec.insertAdjacentHTML('beforeend', `<div class="pv-group-label">Radius</div>`);
  const rGrid = document.createElement('div');
  rGrid.className = 'radius-grid';
  for (const d of project.radius) {
    rGrid.insertAdjacentHTML('beforeend', `
      <div class="radius-box" style="border-radius:${cssVal(d.value, '0')}">${escapeHtml(d.id)}</div>`);
  }
  sec.append(rGrid);

  sec.insertAdjacentHTML('beforeend', `<div class="pv-group-label">Shadow</div>`);
  const sGrid = document.createElement('div');
  sGrid.className = 'shadow-grid';
  for (const d of project.shadows) {
    sGrid.insertAdjacentHTML('beforeend', `
      <div class="shadow-card" style="box-shadow:${cssVal(d.value, 'none')}">${escapeHtml(d.id)}</div>`);
  }
  sec.append(sGrid);
  return sec;
}

/* --- 컴포넌트 --- */
function sectionComponents(project) {
  const c = project.preview.components;
  const count = Object.values(c).filter(Boolean).length;
  const sec = section(project, 'components', 'Components', `${count}개 그룹`);
  const none = !Object.values(c).some(Boolean);
  if (none) {
    sec.insertAdjacentHTML('beforeend', `<div class="adj-note" style="color:inherit;opacity:.6">좌측 패널에서 표시할 컴포넌트를 선택하세요.</div>`);
    return sec;
  }

  if (c.buttons) {
    const g = compGroup('Buttons');
    g.insertAdjacentHTML('beforeend', `
      <div class="comp-row">
        <button class="pv-btn pv-btn-primary">주요 행동</button>
        <button class="pv-btn pv-btn-secondary">보조 행동</button>
        <button class="pv-btn pv-btn-outline">외곽선</button>
        <button class="pv-btn pv-btn-ghost">고스트</button>
        <button class="pv-btn pv-btn-primary" disabled>비활성</button>
      </div>
      <div class="comp-row" style="margin-top:10px">
        <button class="pv-btn pv-btn-primary pv-btn-sm">작게</button>
        <button class="pv-btn pv-btn-primary">보통</button>
        <button class="pv-btn pv-btn-primary pv-btn-lg">크게</button>
      </div>`);
    sec.append(g);
  }

  if (c.inputs) {
    const g = compGroup('Inputs');
    g.insertAdjacentHTML('beforeend', `
      <div class="comp-row" style="align-items:flex-start">
        <label class="pv-field">
          <span>이메일</span>
          <input class="pv-input" type="email" placeholder="name@example.com">
        </label>
        <label class="pv-field is-error">
          <span>비밀번호</span>
          <input class="pv-input" type="text" value="짧은비밀번호">
          <span class="pv-field-error">8자 이상 입력하세요</span>
        </label>
        <label class="pv-field">
          <span>포커스 상태</span>
          <input class="pv-input" type="text" placeholder="클릭해 보세요">
        </label>
      </div>`);
    sec.append(g);
  }

  if (c.cards) {
    const g = compGroup('Cards');
    g.insertAdjacentHTML('beforeend', `
      <div class="comp-row">
        <div class="pv-card">
          <h4>카드 제목</h4>
          <p>추출된 디자인 시스템의 표면색·테두리·라디우스·타이포가 그대로 적용됩니다.</p>
          <button class="pv-btn pv-btn-primary pv-btn-sm">자세히 보기</button>
        </div>
        <div class="pv-card">
          <h4>다른 카드</h4>
          <p>본문 문단의 행간과 글자 크기도 토큰을 따릅니다.</p>
          <button class="pv-btn pv-btn-outline pv-btn-sm">외곽선 버튼</button>
        </div>
      </div>`);
    sec.append(g);
  }

  if (c.badges) {
    const g = compGroup('Badges');
    g.insertAdjacentHTML('beforeend', `
      <div class="comp-row">
        <span class="pv-badge pv-badge-primary">Primary</span>
        <span class="pv-badge pv-badge-neutral">Neutral</span>
        <span class="pv-badge pv-badge-success">Success</span>
        <span class="pv-badge pv-badge-warn">Warning</span>
        <span class="pv-badge pv-badge-danger">Danger</span>
      </div>`);
    sec.append(g);
  }

  if (c.alerts) {
    const g = compGroup('Alerts');
    g.insertAdjacentHTML('beforeend', `
      <div class="comp-row" style="flex-direction:column;align-items:flex-start;gap:10px">
        <div class="pv-alert pv-alert-success"><span>✓</span><div><b>저장되었습니다</b>변경사항이 안전하게 보관되었습니다.</div></div>
        <div class="pv-alert pv-alert-warn"><span>!</span><div><b>주의가 필요합니다</b>일부 항목을 확인해 주세요.</div></div>
        <div class="pv-alert pv-alert-danger"><span>✕</span><div><b>오류가 발생했습니다</b>다시 시도해 주세요.</div></div>
        <div class="pv-alert pv-alert-info"><span>i</span><div><b>안내</b>새로운 기능이 추가되었습니다.</div></div>
      </div>`);
    sec.append(g);
  }

  if (c.tabs) {
    const g = compGroup('Tabs');
    g.insertAdjacentHTML('beforeend', `
      <div class="pv-tabs" data-tabs>
        <div class="pv-tab-list">
          <button type="button" class="pv-tab is-active">기본 정보</button>
          <button type="button" class="pv-tab">상세 내용</button>
          <button type="button" class="pv-tab">리뷰</button>
        </div>
        <div class="pv-tab-panel is-active">탭 패널입니다. 활성 탭의 컬러·폰트·테두리가 추출 토큰으로 적용됩니다. 클릭해 보세요.</div>
        <div class="pv-tab-panel">두 번째 패널 — 본문 스타일(크기·행간)도 타이포 토큰을 따릅니다.</div>
        <div class="pv-tab-panel">세 번째 패널 — 라이트/다크 토글과 조합해 확인할 수 있습니다.</div>
      </div>`);
    sec.append(g);
  }

  if (c.accordion) {
    const g = compGroup('Accordion');
    g.insertAdjacentHTML('beforeend', `
      <div class="pv-accordion">
        <div class="pv-acc-item is-open">
          <button type="button" class="pv-acc-head"><span>자주 묻는 질문입니다</span><span class="pv-acc-arrow">▼</span></button>
          <div class="pv-acc-body">아코디언 본문입니다. 테두리·라디우스·간격(--stack-gap)이 토큰으로 적용됩니다. 클릭하면 접힙니다.</div>
        </div>
        <div class="pv-acc-item">
          <button type="button" class="pv-acc-head"><span>결제는 어떻게 하나요?</span><span class="pv-acc-arrow">▼</span></button>
          <div class="pv-acc-body">두 번째 항목 본문 — 기본은 접혀 있습니다.</div>
        </div>
        <div class="pv-acc-item">
          <button type="button" class="pv-acc-head"><span>환불 규정이 궁금해요</span><span class="pv-acc-arrow">▼</span></button>
          <div class="pv-acc-body">세 번째 항목 본문입니다.</div>
        </div>
      </div>`);
    sec.append(g);
  }

  if (c.carousel) {
    const g = compGroup('Carousel');
    g.insertAdjacentHTML('beforeend', `
      <div class="pv-carousel" data-carousel>
        <div class="pv-carousel-track">
          <div class="pv-carousel-slide"><h5>슬라이드 1</h5><p>스크롤 스냅 캐러셀 — 카드 사이 간격은 --widget-gap 토큰입니다.</p></div>
          <div class="pv-carousel-slide"><h5>슬라이드 2</h5><p>라디우스·그림자·타이포도 추출 토큰을 따릅니다.</p></div>
          <div class="pv-carousel-slide"><h5>슬라이드 3</h5><p>화살표 버튼과 하단 도트로 이동할 수 있습니다.</p></div>
          <div class="pv-carousel-slide"><h5>슬라이드 4</h5><p>마지막 슬라이드입니다.</p></div>
        </div>
        <div class="pv-carousel-dots">
          <span class="pv-carousel-dot is-active"></span><span class="pv-carousel-dot"></span><span class="pv-carousel-dot"></span><span class="pv-carousel-dot"></span>
        </div>
        <div class="pv-carousel-nav">
          <button type="button" class="pv-carousel-btn" data-car-prev title="이전">←</button>
          <button type="button" class="pv-carousel-btn" data-car-next title="다음">→</button>
        </div>
      </div>`);
    sec.append(g);
  }

  if (c.forms) {
    const g = compGroup('Form Controls');
    g.insertAdjacentHTML('beforeend', `
      <div class="pv-form-row">
        <label class="pv-form-item"><span class="pv-switch"><input type="checkbox" checked><span class="pv-switch-track"></span><span class="pv-switch-knob"></span></span>알림 받기</label>
        <label class="pv-form-item"><input type="checkbox" class="pv-check" checked>약관 동의</label>
        <label class="pv-form-item"><input type="radio" name="pv-radio" class="pv-radio" checked>월간</label>
        <label class="pv-form-item"><input type="radio" name="pv-radio" class="pv-radio">연간</label>
        <select class="pv-select"><option>지역 선택</option><option>서울</option><option>부산</option><option>대구</option></select>
      </div>`);
    sec.append(g);
  }

  if (c.nav) {
    const g = compGroup('Navigation');
    g.insertAdjacentHTML('beforeend', `
      <div class="pv-breadcrumb" style="margin-bottom:14px">
        <a href="#" onclick="return false">홈</a><span class="sep">/</span>
        <a href="#" onclick="return false">서비스</a><span class="sep">/</span>
        <span class="current">현재 페이지</span>
      </div>
      <div class="comp-row">
        <div class="pv-pagination">
          <button type="button" class="pv-page" disabled>‹</button>
          <button type="button" class="pv-page is-current">1</button>
          <button type="button" class="pv-page">2</button>
          <button type="button" class="pv-page">3</button>
          <span class="pv-page-ellipsis">…</span>
          <button type="button" class="pv-page">12</button>
          <button type="button" class="pv-page">›</button>
        </div>
      </div>`);
    sec.append(g);
  }

  if (c.data) {
    const g = compGroup('Data Display');
    g.insertAdjacentHTML('beforeend', `
      <div class="pv-table-wrap" style="margin-bottom:16px">
        <table class="pv-table">
          <thead><tr><th>항목</th><th>상태</th><th class="num">금액</th></tr></thead>
          <tbody>
            <tr><td>정기 구독</td><td><span class="pv-badge pv-badge-success">활성</span></td><td class="num">₩12,000</td></tr>
            <tr><td>추가 크레딧</td><td><span class="pv-badge pv-badge-warn">대기</span></td><td class="num">₩5,000</td></tr>
            <tr><td>환불 요청</td><td><span class="pv-badge pv-badge-danger">거절</span></td><td class="num">-₩3,000</td></tr>
          </tbody>
        </table>
      </div>
      <div class="pv-progress">
        <div class="pv-progress-label"><span>프로젝트 완성도</span><span>68%</span></div>
        <div class="pv-progress-track"><div class="pv-progress-bar" style="width:68%"></div></div>
      </div>`);
    sec.append(g);
  }

  if (c.misc) {
    const g = compGroup('Avatar · Divider · Chips');
    g.insertAdjacentHTML('beforeend', `
      <div class="pv-avatar-row" style="margin-bottom:16px">
        <span class="pv-avatar" style="width:28px;height:28px;font-size:11px">김</span>
        <span class="pv-avatar" style="width:36px;height:36px">이</span>
        <span class="pv-avatar" style="width:48px;height:48px;font-size:16px">박</span>
        <span class="pv-avatar" style="width:36px;height:36px">+9</span>
      </div>
      <div class="comp-row" style="margin-bottom:16px">
        <span class="pv-chip">디자인 <button type="button" class="pv-chip-x" title="제거">✕</button></span>
        <span class="pv-chip">워드프레스 <button type="button" class="pv-chip-x" title="제거">✕</button></span>
        <span class="pv-chip">Bricks <button type="button" class="pv-chip-x" title="제거">✕</button></span>
      </div>
      <hr class="pv-divider">`);
    sec.append(g);
  }

  if (c.cards2) {
    const g = compGroup('Icon Cards · Image Cards');
    // 아이콘 카드 — 아이콘 + 제목 + 설명문
    g.insertAdjacentHTML('beforeend', `
      <div class="pv-iconcard-grid">
        <div class="pv-iconcard">
          <div class="pv-iconcard-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 3 14h7l-1 8 10-12h-7l1-8z"/></svg></div>
          <h5>빠른 설정</h5>
          <p>디자인 시스템을 몇 분 만에 사이트에 적용할 수 있습니다.</p>
        </div>
        <div class="pv-iconcard">
          <div class="pv-iconcard-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg></div>
          <h5>안전한 저장</h5>
          <p>모든 토큰은 프로젝트 JSON으로 보관되고 언제든 되돌릴 수 있습니다.</p>
        </div>
        <div class="pv-iconcard">
          <div class="pv-iconcard-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M7 15v3"/><path d="M11 10v8"/><path d="M15 13v5"/><path d="M19 6v12"/></svg></div>
          <h5>성장 지표</h5>
          <p>일관된 토큰 사용으로 유지보수 비용이 줄어듭니다.</p>
        </div>
      </div>
      <div class="pv-imgcard-grid" style="margin-top:22px">
        <div class="pv-imgcard">
          <div class="pv-imgcard-media"><svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice"><rect width="400" height="300" fill="var(--p-primary-soft, #e8f0fe)"/><circle cx="315" cy="72" r="34" fill="var(--p-primary, #4c8dff)" opacity=".9"/><path d="M0 232 L110 128 L190 212 L272 138 L400 252 L400 300 L0 300 Z" fill="var(--p-primary, #4c8dff)" opacity=".22"/><path d="M0 262 L140 168 L240 242 L400 168 L400 300 L0 300 Z" fill="var(--p-primary, #4c8dff)" opacity=".42"/></svg></div>
          <h5>산맥처럼 쌓은 기록</h5>
          <p class="pv-imgcard-meta">여행 · 2026.09</p>
          <p>테두리 없는 이미지 카드 형태입니다. 이미지 자체가 카드 역할을 합니다.</p>
        </div>
        <div class="pv-imgcard">
          <div class="pv-imgcard-media"><svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice"><rect width="400" height="300" fill="var(--p-primary-soft, #e8f0fe)"/><path d="M0 150 Q 60 100 120 150 T 240 150 T 360 150 T 480 150 V300 H0 Z" fill="var(--p-primary, #4c8dff)" opacity=".3"/><path d="M0 190 Q 66 146 132 190 T 264 190 T 396 190 V300 H0 Z" fill="var(--p-primary, #4c8dff)" opacity=".5"/><circle cx="320" cy="66" r="26" fill="var(--p-primary, #4c8dff)" opacity=".85"/></svg></div>
          <h5>물결 위의 하루</h5>
          <p class="pv-imgcard-meta">라이프스타일 · 2026.08</p>
          <p>이미지 영역은 SVG 플레이스홀더로, 실제 사이트에서는 썸네일로 교체됩니다.</p>
        </div>
        <div class="pv-imgcard">
          <div class="pv-imgcard-media"><svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice"><rect width="400" height="300" fill="var(--p-primary-soft, #e8f0fe)"/><rect x="40" y="170" width="70" height="90" rx="10" fill="var(--p-primary, #4c8dff)" opacity=".35"/><rect x="130" y="120" width="70" height="140" rx="10" fill="var(--p-primary, #4c8dff)" opacity=".55"/><rect x="220" y="80" width="70" height="180" rx="10" fill="var(--p-primary, #4c8dff)" opacity=".8"/><circle cx="330" cy="70" r="22" fill="var(--p-primary, #4c8dff)" opacity=".9"/></svg></div>
          <h5>도시의 스카이라인</h5>
          <p class="pv-imgcard-meta">아키텍처 · 2026.07</p>
          <p>타이틀·메타·본문 크기와 색은 모두 추출 토큰을 따릅니다.</p>
        </div>
      </div>`);
    sec.append(g);
  }

  if (c.content) {
    const g = compGroup('Stats · CTA · Quote');
    g.insertAdjacentHTML('beforeend', `
      <div class="pv-stats" style="margin-bottom:24px">
        <div class="pv-stat"><div class="pv-stat-num">12<small>종</small></div><div class="pv-stat-label">컴포넌트 프리셋</div></div>
        <div class="pv-stat"><div class="pv-stat-num">47<small>+</small></div><div class="pv-stat-label">디자인 토큰</div></div>
        <div class="pv-stat"><div class="pv-stat-num">5<small>개</small></div><div class="pv-stat-label">빌더 내보내기</div></div>
      </div>
      <div class="pv-cta" style="margin-bottom:24px">
        <div>
          <h4>디자인 시스템을 사이트에 바로 적용하세요</h4>
          <p>추출한 토큰을 Bricks·Elementor·GreenShift로 내보낼 수 있습니다.</p>
        </div>
        <button class="pv-btn pv-btn-primary">지금 시작하기</button>
      </div>
      <blockquote class="pv-quote">
        <div class="pv-quote-text">추출하고 조정하고 발행까지, 한 화면에서 끝납니다. 사이트의 디자인 언어를 그대로 물려받은 토큰 세트로 일관성을 유지하세요.</div>
        <div class="pv-quote-author"><span class="pv-avatar">디</span><span>디자인 시스템 가이드에서</span></div>
      </blockquote>`);
    sec.append(g);
  }

  if (c.overlay) {
    const g = compGroup('Modal · Tooltip · Dropdown');
    g.insertAdjacentHTML('beforeend', `
      <div class="comp-row" style="align-items:flex-start;gap:36px;flex-wrap:wrap">
        <div class="pv-modal-demo" data-modal-demo>
          <button class="pv-btn pv-btn-primary pv-btn-sm" data-modal-open>모달 열기</button>
          <div class="pv-modal-backdrop" data-modal-backdrop>
            <div class="pv-modal">
              <div class="pv-modal-icon">?</div>
              <h5>디자인 시스템을 초기화할까요?</h5>
              <p>모든 조정값이 사라집니다. 계속하기 전에 project.json으로 저장하는 것을 권장합니다.</p>
              <div class="pv-modal-actions">
                <button class="pv-btn pv-btn-ghost pv-btn-sm" data-modal-close>취소</button>
                <button class="pv-btn pv-btn-primary pv-btn-sm" data-modal-close>초기화</button>
              </div>
            </div>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:22px;align-items:flex-start;padding-top:8px">
          <div class="pv-tooltip-wrap">
            <button class="pv-btn pv-btn-outline pv-btn-sm">여기에 올려보세요</button>
            <span class="pv-tooltip">툴팁 — hover 시 표시</span>
          </div>
          <div class="pv-dropdown" data-dropdown>
            <button class="pv-btn pv-btn-secondary pv-btn-sm" data-dd-toggle>내 메뉴 ▾</button>
            <div class="pv-dropdown-menu">
              <button class="pv-dropdown-item" type="button"><span class="pv-dropdown-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg></span>프로필<small>Shift+P</small></button>
              <button class="pv-dropdown-item" type="button"><span class="pv-dropdown-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2-1.2L14 3h-4l-.5 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2 1.2L10 21h4l.5-2.6a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.06-.4.1-.8.1-1.2z"/></svg></span>설정</button>
              <button class="pv-dropdown-item" type="button"><span class="pv-dropdown-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16v12H7l-3 3z"/></svg></span>문의하기</button>
              <div class="pv-dropdown-sep"></div>
              <button class="pv-dropdown-item danger" type="button"><span class="pv-dropdown-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5V9l7-6 7 6v12h-4"/><path d="M9 21v-6h6v6"/></svg></span>로그아웃</button>
            </div>
          </div>
        </div>
      </div>`);
    sec.append(g);
  }

  if (c.pricing) {
    const g = compGroup('Pricing');
    g.insertAdjacentHTML('beforeend', `
      <div class="pv-pricing-grid">
        <div class="pv-price-card">
          <div class="pv-price-name">스타터</div>
          <div class="pv-price-amount">₩0</div>
          <div class="pv-price-period">영구 무료</div>
          <ul class="pv-price-features">
            <li><span class="ck">✓</span>토큰 추출 1개 프로젝트</li>
            <li><span class="ck">✓</span>컴포넌트 미리보기</li>
            <li><span class="no">✕</span>빌더 내보내기</li>
            <li><span class="no">✕</span>다크모드 토큰</li>
          </ul>
          <button class="pv-btn pv-btn-outline pv-btn-sm" style="width:100%">무료로 시작</button>
        </div>
        <div class="pv-price-card is-featured">
          <div class="pv-price-badge">인기</div>
          <div class="pv-price-name">프로</div>
          <div class="pv-price-amount">₩12,000<small>/월</small></div>
          <div class="pv-price-period">연간 결제 시 20% 할인</div>
          <ul class="pv-price-features">
            <li><span class="ck">✓</span>프로젝트 무제한</li>
            <li><span class="ck">✓</span>빌더 5종 내보내기</li>
            <li><span class="ck">✓</span>다크모드·반응형 토큰</li>
            <li><span class="ck">✓</span>GreenShift 직접 적용</li>
          </ul>
          <button class="pv-btn pv-btn-primary pv-btn-sm" style="width:100%">프로 시작하기</button>
        </div>
        <div class="pv-price-card">
          <div class="pv-price-name">팀</div>
          <div class="pv-price-amount">₩39,000<small>/월</small></div>
          <div class="pv-price-period">좌석 5개 포함</div>
          <ul class="pv-price-features">
            <li><span class="ck">✓</span>프로의 모든 기능</li>
            <li><span class="ck">✓</span>토큰 히스토리·롤백</li>
            <li><span class="ck">✓</span>팀 워크스페이스</li>
            <li><span class="ck">✓</span>우선 지원</li>
          </ul>
          <button class="pv-btn pv-btn-outline pv-btn-sm" style="width:100%">팀 문의</button>
        </div>
      </div>`);
    sec.append(g);
  }

  if (c.flow) {
    const g = compGroup('Stepper · Timeline');
    g.insertAdjacentHTML('beforeend', `
      <div class="pv-stepper">
        <div class="pv-step is-done"><div class="pv-step-dot">✓</div><div class="pv-step-label">템플릿 선택</div><div class="pv-step-sub">완료</div></div>
        <div class="pv-step is-done"><div class="pv-step-dot">✓</div><div class="pv-step-label">토큰 조정</div><div class="pv-step-sub">완료</div></div>
        <div class="pv-step is-active"><div class="pv-step-dot">3</div><div class="pv-step-label">미리보기 검수</div><div class="pv-step-sub">진행 중</div></div>
        <div class="pv-step"><div class="pv-step-dot">4</div><div class="pv-step-label">빌더 내보내기</div><div class="pv-step-sub">대기</div></div>
      </div>
      <div class="pv-timeline">
        <div class="pv-timeline-item">
          <div class="pv-timeline-dot"></div>
          <div class="pv-timeline-date">2026.09.28</div>
          <h6>사이트 디자인 시스템 추출</h6>
          <p>레퍼런스 사이트에서 컬러·타이포·레이아웃 토큰을 추출했습니다.</p>
        </div>
        <div class="pv-timeline-item">
          <div class="pv-timeline-dot"></div>
          <div class="pv-timeline-date">2026.10.03</div>
          <h6>반응형 토큰 확장</h6>
          <p>태블릿·모바일 폰트 크기와 섹션 여백 토큰이 추가되었습니다.</p>
        </div>
        <div class="pv-timeline-item">
          <div class="pv-timeline-dot"></div>
          <div class="pv-timeline-date">2026.10.05</div>
          <h6>컴포넌트 라이브러리 23종</h6>
          <p>모달·가격표·타임라인 등 실무 위젯이 추가되었습니다.</p>
        </div>
        <div class="pv-timeline-item is-muted">
          <div class="pv-timeline-dot"></div>
          <div class="pv-timeline-date">예정</div>
          <h6>빌더 실사이트 검증</h6>
          <p>Elementor·Divi·Builderius 임포트 검증이 남아 있습니다.</p>
        </div>
      </div>`);
    sec.append(g);
  }

  if (c.misc2) {
    const g = compGroup('Social · List Group · Newsletter');
    g.insertAdjacentHTML('beforeend', `
      <div class="pv-social-row" style="margin-bottom:20px">
        <button class="pv-social" type="button" title="X"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.5 3h3.1l-6.8 7.8L21.8 21h-6.3l-4.9-6.4L5 21H1.9l7.3-8.3L2.2 3h6.4l4.4 5.9L17.5 3zm-1.1 16.1h1.7L7.7 4.8H5.9l10.5 14.3z"/></svg></button>
        <button class="pv-social" type="button" title="Facebook"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M14 8.5V6.8c0-.8.2-1.3 1.4-1.3H17V2.6C16.4 2.5 15.4 2.5 14.4 2.5c-2.6 0-4.4 1.6-4.4 4.5v1.5H7v3.4h3V21h4v-9.1h2.8l.4-3.4H14z"/></svg></button>
        <button class="pv-social" type="button" title="Instagram"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.2" cy="6.8" r="1.1" fill="currentColor" stroke="none"/></svg></button>
        <button class="pv-social" type="button" title="YouTube"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M21.6 7.2a2.5 2.5 0 0 0-1.8-1.8C18.2 5 12 5 12 5s-6.2 0-7.8.4A2.5 2.5 0 0 0 2.4 7.2 26 26 0 0 0 2 12a26 26 0 0 0 .4 4.8 2.5 2.5 0 0 0 1.8 1.8c1.6.4 7.8.4 7.8.4s6.2 0 7.8-.4a2.5 2.5 0 0 0 1.8-1.8A26 26 0 0 0 22 12a26 26 0 0 0-.4-4.8zM10 15V9l5.2 3L10 15z"/></svg></button>
        <button class="pv-social" type="button" title="LinkedIn"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M4.98 3.5A2.5 2.5 0 1 0 5 8.5a2.5 2.5 0 0 0-.02-5zM3 9.5h4V21H3zM9.5 9.5h3.8v1.6h.05a4.2 4.2 0 0 1 3.75-2c4 0 4.75 2.6 4.75 6V21h-4v-5.3c0-1.3 0-3-1.8-3s-2.1 1.4-2.1 2.9V21h-4z"/></svg></button>
        <button class="pv-social is-brand" type="button" title="브랜드색 버튼"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.8l-5.8 3 1.1-6.4L2.6 9.8l6.5-.9z"/></svg></button>
      </div>
      <div class="pv-listgroup" style="margin-bottom:22px">
        <button class="pv-listitem" type="button"><span class="pv-listitem-ico">👤</span><span><span class="pv-listitem-title">계정 설정</span><br><span class="pv-listitem-sub">이메일·비밀번호·알림</span></span><span class="chev">›</span></button>
        <button class="pv-listitem" type="button"><span class="pv-listitem-ico">🎨</span><span><span class="pv-listitem-title">테마 관리</span><br><span class="pv-listitem-sub">라이트·다크 토큰 세트</span></span><span class="chev">›</span></button>
        <button class="pv-listitem" type="button"><span class="pv-listitem-ico">📦</span><span><span class="pv-listitem-title">내보내기 기록</span><br><span class="pv-listitem-sub">최근 30일</span></span><span class="chev">›</span></button>
        <button class="pv-listitem" type="button"><span class="pv-listitem-ico">🔗</span><span><span class="pv-listitem-title">연동된 사이트</span><br><span class="pv-listitem-sub">2개 연결됨</span></span><span class="chev">›</span></button>
      </div>
      <div class="pv-newsletter" data-newsletter>
        <h5>새 토큰 세트가 나오면 알려드릴게요</h5>
        <p>월 1회, 디자인 시스템 업데이트 소식만 보냅니다.</p>
        <form class="pv-newsletter-form">
          <input class="pv-input" type="email" placeholder="name@example.com" required>
          <button class="pv-btn pv-btn-primary" type="submit">구독</button>
        </form>
        <div class="pv-newsletter-note">구독은 언제든 해지할 수 있습니다.</div>
        <div class="pv-newsletter-ok">✓ 구독해 주셔서 감사합니다! 확인 메일을 보냈습니다.</div>
      </div>`);
    sec.append(g);
  }

  if (c.header) {
    const g = compGroup('Header Nav');
    g.insertAdjacentHTML('beforeend', `
      <div class="pv-header-demo">
        <div class="pv-header-bar">
          <div class="pv-header-logo"><span class="pv-header-logo-mark">D</span>DESIGN</div>
          <nav class="pv-header-nav">
            <a class="pv-header-link is-active" href="#" onclick="return false">홈</a>
            <a class="pv-header-link" href="#" onclick="return false">기능</a>
            <a class="pv-header-link" href="#" onclick="return false">가격</a>
            <a class="pv-header-link" href="#" onclick="return false">문의</a>
          </nav>
          <button class="pv-btn pv-btn-primary pv-btn-sm">시작하기</button>
        </div>
        <div class="pv-header-sub">
          <span>활성 링크는 프라이머리 밑줄 · 호버는 연한 배경 · 로고 마크도 토큰 색</span>
          <span>max-width: var(--container-width)</span>
        </div>
      </div>`);
    sec.append(g);
  }

  wireInteractions(sec);
  return sec;
}

/* ---------- 컴포넌트 인터랙션 (탭·아코디언·캐러셀) ---------- */
function wireInteractions(sec) {
  // 탭
  for (const tabs of sec.querySelectorAll('[data-tabs]')) {
    tabs.addEventListener('click', (e) => {
      const tab = e.target.closest('.pv-tab');
      if (!tab) return;
      const all = [...tabs.querySelectorAll('.pv-tab')];
      const idx = all.indexOf(tab);
      all.forEach((t, i) => t.classList.toggle('is-active', i === idx));
      tabs.querySelectorAll('.pv-tab-panel').forEach((p, i) => p.classList.toggle('is-active', i === idx));
    });
  }
  // 아코디언
  for (const head of sec.querySelectorAll('.pv-acc-head')) {
    head.addEventListener('click', () => {
      head.closest('.pv-acc-item').classList.toggle('is-open');
    });
  }
  // 캐러셀 — 스크롤 스냅 + 도트 동기화
  for (const car of sec.querySelectorAll('[data-carousel]')) {
    const track = car.querySelector('.pv-carousel-track');
    const slides = [...track.children];
    const dots = [...car.querySelectorAll('.pv-carousel-dot')];
    if (!track || !slides.length) continue;
    const step = () => {
      const first = slides[0].getBoundingClientRect();
      const second = slides[1]?.getBoundingClientRect() || first;
      return Math.max(second.left - first.left, first.width * 0.8);
    };
    // 즉시 스크롤(snap) — smooth는 렌더 프레임이 없는 환경(숨겨진 창)에서 동작하지 않는다
    car.querySelector('[data-car-prev]')?.addEventListener('click', () => track.scrollBy({ left: -step() }));
    car.querySelector('[data-car-next]')?.addEventListener('click', () => track.scrollBy({ left: step() }));
    const io = new IntersectionObserver((entries) => {
      for (const en of entries) {
        if (!en.isIntersecting) continue;
        const i = slides.indexOf(en.target);
        dots.forEach((d, j) => d.classList.toggle('is-active', j === i));
      }
    }, { root: track, threshold: 0.6 });
    slides.forEach((sl) => io.observe(sl));
  }
  // 모달 — 열기/닫기(백드롭·버튼)
  for (const demo of sec.querySelectorAll('[data-modal-demo]')) {
    const backdrop = demo.querySelector('[data-modal-backdrop]');
    demo.querySelector('[data-modal-open]')?.addEventListener('click', () => backdrop.classList.add('is-open'));
    demo.querySelectorAll('[data-modal-close]').forEach((b) => b.addEventListener('click', () => backdrop.classList.remove('is-open')));
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) backdrop.classList.remove('is-open'); });
  }
  // 드롭다운 — 토글, 항목 클릭 시 닫힘, 섹션 밖 클릭 닫힘은 같은 클릭의 다른 대상에서 처리
  for (const dd of sec.querySelectorAll('[data-dropdown]')) {
    dd.querySelector('[data-dd-toggle]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const was = dd.classList.contains('is-open');
      closeAllDropdowns(sec);
      if (!was) dd.classList.add('is-open');
    });
    dd.querySelectorAll('.pv-dropdown-item').forEach((it) => it.addEventListener('click', () => closeAllDropdowns(sec)));
  }
  sec.addEventListener('click', (e) => {
    if (!e.target.closest('[data-dropdown]')) closeAllDropdowns(sec);
  });
  // 뉴스레터 — 제출 시 완료 상태
  for (const nl of sec.querySelectorAll('[data-newsletter]')) {
    nl.querySelector('form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      nl.classList.add('is-done');
    });
  }
}

function closeAllDropdowns(scope) {
  scope.querySelectorAll('[data-dropdown].is-open').forEach((d) => d.classList.remove('is-open'));
}

function compGroup(title) {
  const div = document.createElement('div');
  div.className = 'comp-group';
  div.innerHTML = `<div class="comp-group-title">${title}</div>`;
  return div;
}
