// preview.js — 디자인 시스템 미리보기: 토큰 주입 + 에셋 갤러리 렌더
// 캔버스의 모든 요소는 --p-* 토큰만 사용 (프리뷰 = 출력물 원칙)

import { escapeHtml, contrastRatio, hexToOklch, oklchToHex } from './util.js';
import { findToken } from './store.js';

const SAMPLE_HEADING = '제목처럼 쓰이는 문장의 샘플';
const SAMPLE_BODY = '본문처럼 읽히는 문장입니다. 행간과 자간, 글자의 굵기가 실제 문서에서 어떻게 보이는지 확인할 수 있습니다.';

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
        <div class="sw-chip" style="background:${t.value}"></div>
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
  const sec = section(project, 'typography', 'Typography', `${fam} · 본문 ${h.body.size}${bpNote}${vpNote}`);
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
        font-size:${escapeHtml(size)};
        font-weight:${escapeHtml(item.weight)};
        line-height:${escapeHtml(lineHeight)};
        letter-spacing:${escapeHtml(item.letterSpacing)};
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
    const stack = `"${f.family.replace(/"/g, '')}", -apple-system, system-ui, sans-serif`;
    grid.insertAdjacentHTML('beforeend', `
      <div class="font-card">
        <div class="font-card-aa" style="font-family:${stack.replace(/"/g, '&quot;')}">Aa 가</div>
        <div class="font-card-name">${escapeHtml(f.family)}</div>
        <div class="font-card-meta">${f.source === 'google' ? '웹폰트 CDN' : '시스템 폰트'}</div>
        <div class="font-weights" style="font-family:${stack.replace(/"/g, '&quot;')}">
          ${(f.weights || []).map((w) => `<span style="font-weight:${w}" title="${w}">${w}</span>`).join('')}
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
          <span class="layout-container-bar" style="width:min(88%, calc((${escapeHtml(cw)} / 1600px) * 100%))"></span>
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
          <span style="width:${escapeHtml(wGap)};display:flex;align-items:center;justify-content:center"><span style="font-size:10px;font-family:var(--dsg-mono);color:var(--p-primary,#4c8dff);font-weight:700">${escapeHtml(wGap)}</span></span>
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
      <div class="radius-box" style="border-radius:${escapeHtml(d.value)}">${escapeHtml(d.id)}</div>`);
  }
  sec.append(rGrid);

  sec.insertAdjacentHTML('beforeend', `<div class="pv-group-label">Shadow</div>`);
  const sGrid = document.createElement('div');
  sGrid.className = 'shadow-grid';
  for (const d of project.shadows) {
    sGrid.insertAdjacentHTML('beforeend', `
      <div class="shadow-card" style="box-shadow:${escapeHtml(d.value)}">${escapeHtml(d.id)}</div>`);
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
}

function compGroup(title) {
  const div = document.createElement('div');
  div.className = 'comp-group';
  div.innerHTML = `<div class="comp-group-title">${title}</div>`;
  return div;
}
