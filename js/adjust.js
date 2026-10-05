// adjust.js — 좌측 조정 패널: 섹션별 편집 컨트롤
// 값 편집은 패널을 다시 그리지 않고(포커스 유지), 구조 변경(추가/삭제)만 다시 그린다.

import { slugify, contrastRatio, contrastGrade } from './util.js';
import { deriveDarkValues, makeScale } from './scale.js';

export function renderAdjust(container, store, section, hooks = {}) {
  container.replaceChildren();
  switch (section) {
    case 'colors': renderColors(container, store, hooks); break;
    case 'typography': renderTypography(container, store); break;
    case 'fonts': renderFonts(container, store); break;
    case 'spacing': renderSpacing(container, store); break;
    case 'components': renderComponents(container, store); break;
    case 'export': renderExport(container, store, hooks); break;
    default:
      container.innerHTML = `<div class="adj-empty">섹션을 선택하세요.</div>`;
  }
}

/* ---------- 공용 ---------- */

function block(title, actions = '') {
  const div = document.createElement('div');
  div.className = 'adj-block';
  div.innerHTML = `<div class="adj-block-title"><span>${title}</span>${actions}</div>`;
  return div;
}

function field(labelText, value, onInput, { placeholder = '', mono = false } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'adj-field';
  wrap.innerHTML = `<label>${labelText}</label>
    <input type="text" value="${escape(value)}" placeholder="${escape(placeholder)}" ${mono ? 'style="font-family:var(--dsg-mono);font-size:12px"' : ''}>`;
  const input = wrap.querySelector('input');
  input.addEventListener('input', () => onInput(input.value));
  return wrap;
}

function escape(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

// ---------- 컬러 ----------
function renderColors(container, store, hooks) {
  const p = store.project;

  // 다카모드 설정
  const modeBlock = block('다크모드');
  modeBlock.insertAdjacentHTML('beforeend', `
    <div class="adj-field">
      <label>다크 팔레트</label>
      <select id="adj-color-mode">
        <option value="auto" ${p.colors.mode === 'auto' ? 'selected' : ''}>자동 도출 (비어 있는 값만 채움)</option>
        <option value="manual" ${p.colors.mode === 'manual' ? 'selected' : ''}>수동 (자동 채움 안 함)</option>
        <option value="none" ${p.colors.mode === 'none' ? 'selected' : ''}>사용 안 함</option>
      </select>
    </div>
    <button class="btn btn-ghost btn-sm btn-block" id="btn-derive-dark" style="margin-top:6px">다크 값 전체 재계산</button>`);
  container.append(modeBlock);
  modeBlock.querySelector('#adj-color-mode').addEventListener('change', (e) => {
    store.update((pr) => { pr.colors.mode = e.target.value; }, { tag: 'adjust-value' });
  });
  modeBlock.querySelector('#btn-derive-dark').addEventListener('click', () => {
    store.update((pr) => {
      const save = pr.colors.mode;
      pr.colors.mode = 'auto';
      for (const g of pr.colors.groups) for (const t of g.tokens) t.dark = '';
      deriveDarkValues(pr);
      pr.colors.mode = save;
    }, { tag: 'adjust-structure' });
    hooks.toast?.('다크 팔레트를 재계산했습니다', 'ok');
  });

  // 프라이머리 스케일 생성
  const scaleBlock = block('프라이머리 스케일');
  scaleBlock.insertAdjacentHTML('beforeend', `
    <div class="adj-note">프라이머리 색에서 11단계(50~950) 스케일을 만들어 <b>브랜드 그룹 뒤에</b> 추가합니다.</div>
    <button class="btn btn-accent btn-sm btn-block" id="btn-make-scale" style="margin-top:8px">스케일 11단계 생성</button>`);
  container.append(scaleBlock);
  scaleBlock.querySelector('#btn-make-scale').addEventListener('click', () => {
    const primary = p.colors.groups.flatMap((g) => g.tokens).find((t) => t.id === 'primary' || t.cssVar === '--primary');
    if (!primary) return hooks.toast?.('primary 토큰이 없습니다', 'error');
    const steps = makeScale(primary.value);
    if (!steps) return hooks.toast?.('색상을 읽을 수 없습니다', 'error');
    store.update((pr) => {
      const brand = pr.colors.groups.find((g) => g.id === 'brand') || pr.colors.groups[0];
      // 기존 스케일 토큰 제거 후 추가
      brand.tokens = brand.tokens.filter((t) => !/^primary-\d+$/.test(t.id));
      for (const [step, hex] of Object.entries(steps)) {
        brand.tokens.push({ id: `primary-${step}`, name: `프라이머리 ${step}`, cssVar: `--primary-${step}`, value: hex, dark: '' });
      }
    }, { tag: 'adjust-structure' });
    hooks.toast?.('11단계 스케일을 추가했습니다', 'ok');
  });

  // 그룹별 토큰 편집
  const bgToken = p.colors.groups.flatMap((g) => g.tokens).find((t) => t.cssVar === '--bg-default');
  for (const g of p.colors.groups) {
    const gblock = block(`${escape(g.name)} (${g.tokens.length})`,
      `<button class="btn btn-sm" data-add="${g.id}">+ 색상</button>`);
    for (const t of g.tokens) {
      const row = document.createElement('div');
      row.className = 'adj-row';
      const contrastBadge = bgToken && (g.id === 'text' || g.id === 'brand')
        ? contrastBadgeHtml(t.value, bgToken.value) : '';
      row.innerHTML = `
        <button class="swatch" title="${escape(t.value)}"><input type="color" value="${normalizeHexForInput(t.value)}"></button>
        <div class="adj-main">
          <input type="text" data-k="name" value="${escape(t.name)}" placeholder="이름">
          <div class="adj-varline">
            <input type="text" class="adj-sub" data-k="cssVar" value="${escape(t.cssVar)}" placeholder="--var">
            ${contrastBadge}
          </div>
        </div>
        <div class="row-actions">
          <button class="icon-btn" data-act="dark" title="다크 값 (${t.dark || '없음'})">🌙</button>
          <button class="icon-btn danger" data-act="del" title="삭제">✕</button>
        </div>`;
      const colorInput = row.querySelector('input[type="color"]');
      colorInput.addEventListener('input', () => {
        store.update((pr) => { t.value = colorInput.value; }, { tag: 'adjust-value' });
      });
      row.querySelectorAll('input[type="text"]').forEach((inp) => {
        inp.addEventListener('input', () => {
          store.update((pr) => { t[inp.dataset.k] = inp.value; if (inp.dataset.k === 'name' && !t.cssVar.startsWith('--')) t.cssVar = `--${slugify(inp.value)}`; }, { tag: 'adjust-value' });
        });
      });
      row.querySelector('[data-act="del"]').addEventListener('click', () => {
        store.update((pr) => { g.tokens = g.tokens.filter((x) => x.id !== t.id); }, { tag: 'adjust-structure' });
      });
      row.querySelector('[data-act="dark"]').addEventListener('click', () => {
        const v = prompt(`${t.name}의 다크 모드 값 (hex)`, t.dark || t.value);
        if (v === null) return;
        store.update((pr) => { t.dark = v.trim(); }, { tag: 'adjust-structure' });
      });
      gblock.append(row);
    }
    gblock.querySelector('[data-add]').addEventListener('click', () => {
      store.update((pr) => {
        g.tokens.push({ id: `c${Date.now().toString(36)}`, name: '새 색상', cssVar: `--new-${g.tokens.length + 1}`, value: '#888888', dark: '' });
      }, { tag: 'adjust-structure' });
    });
    container.append(gblock);
  }
}

function normalizeHexForInput(v) {
  return /^#[0-9a-fA-F]{6}$/.test(v) ? v : '#888888';
}

function contrastBadgeHtml(fg, bg) {
  const r = contrastRatio(fg, bg);
  const g = contrastGrade(r);
  const cls = g === 'fail' ? 'badge-warn' : 'badge-ok';
  return `<span class="badge ${cls}" title="배경 기본 대비 ${r.toFixed(2)}:1">${g} ${r.toFixed(1)}</span>`;
}

// ---------- 타이포그래피 ----------
function renderTypography(container, store) {
  const t = store.project.typography;

  const famBlock = block('폰트 패밀리');
  const famRow = (key, label) => {
    const f = t.families[key];
    const wrap = document.createElement('div');
    wrap.className = 'adj-field';
    wrap.innerHTML = `<label>${label}</label>
      <input type="text" data-fam="${key}" value="${escape(f.name)}" placeholder="Pretendard" style="margin-bottom:4px">
      <textarea data-stack="${key}" rows="2" placeholder="CSS font-family 스택">${escape(f.stack)}</textarea>`;
    wrap.querySelector('[data-fam]').addEventListener('input', (e) => {
      store.update((pr) => { pr.typography.families[key].name = e.target.value; }, { tag: 'adjust-value' });
    });
    wrap.querySelector('[data-stack]').addEventListener('input', (e) => {
      store.update((pr) => { pr.typography.families[key].stack = e.target.value; }, { tag: 'adjust-value' });
    });
    return wrap;
  };
  famBlock.append(famRow('heading', '제목용 (heading)'));
  famBlock.append(famRow('body', '본문용 (body)'));
  container.append(famBlock);

  const bodyBlock = block('본문 기본값');
  const grid = document.createElement('div');
  grid.className = 'adj-grid2';
  for (const [key, label] of [['size', '크기 (16px)'], ['weight', '굵기 (400)'], ['lineHeight', '행간 (1.6)'], ['letterSpacing', '자간 (0)']]) {
    const wrap = document.createElement('div');
    wrap.className = 'adj-field';
    wrap.innerHTML = `<label>${label}</label><input type="text" data-body="${key}" value="${escape(t.body[key])}">`;
    wrap.querySelector('input').addEventListener('input', (e) => {
      store.update((pr) => { pr.typography.body[key] = e.target.value; }, { tag: 'adjust-value' });
    });
    grid.append(wrap);
  }
  bodyBlock.append(grid);
  container.append(bodyBlock);

  const hBlock = block('타이포 계층', `<button class="btn btn-sm" id="adj-add-hier">+ 단계</button>`);
  t.hierarchy.forEach((item, idx) => {
    const row = document.createElement('div');
    row.className = 'adj-row';
    row.style.gridTemplateColumns = '1fr auto';
    row.innerHTML = `
      <div class="adj-main">
        <input type="text" data-k="label" value="${escape(item.label)}">
        <div style="display:flex;gap:4px;margin-top:4px">
          <input type="text" class="adj-sub" data-k="size" value="${escape(item.size)}" style="width:64px" title="크기">
          <input type="text" class="adj-sub" data-k="weight" value="${escape(item.weight)}" style="width:48px" title="굵기">
          <input type="text" class="adj-sub" data-k="lineHeight" value="${escape(item.lineHeight)}" style="width:48px" title="행간">
        </div>
        <div style="display:flex;gap:4px;margin-top:3px;align-items:center" title="반응형 크기 — 비우면 해당 구간 값 없음">
          <span style="font-size:10px;color:var(--dsg-faint);width:14px;text-align:center">T</span>
          <input type="text" class="adj-sub" data-r="tablet" value="${escape(item.tablet?.size || '')}" style="width:56px" placeholder="태블릿">
          <span style="font-size:10px;color:var(--dsg-faint);width:14px;text-align:center">M</span>
          <input type="text" class="adj-sub" data-r="phone" value="${escape(item.phone?.size || '')}" style="width:56px" placeholder="모바일">
        </div>
      </div>
      <div class="row-actions">
        <button class="icon-btn" data-act="up" title="위로">↑</button>
        <button class="icon-btn" data-act="down" title="아래로">↓</button>
        <button class="icon-btn danger" data-act="del" title="삭제">✕</button>
      </div>`;
    row.querySelectorAll('input[data-k]').forEach((inp) => {
      inp.addEventListener('input', () => {
        store.update((pr) => { pr.typography.hierarchy[idx][inp.dataset.k] = inp.value; }, { tag: 'adjust-value' });
      });
    });
    row.querySelectorAll('input[data-r]').forEach((inp) => {
      inp.addEventListener('input', () => {
        const tier = inp.dataset.r;
        store.update((pr) => {
          const it = pr.typography.hierarchy[idx];
          if (!inp.value.trim()) {
            delete it[tier];
          } else {
            it[tier] = { size: inp.value.trim(), lineHeight: it[tier]?.lineHeight || '' };
          }
        }, { tag: 'adjust-value' });
      });
    });
    row.querySelector('[data-act="del"]').addEventListener('click', () => {
      store.update((pr) => { pr.typography.hierarchy.splice(idx, 1); }, { tag: 'adjust-structure' });
    });
    row.querySelector('[data-act="up"]').addEventListener('click', () => {
      if (idx === 0) return;
      store.update((pr) => {
        const h = pr.typography.hierarchy;
        [h[idx - 1], h[idx]] = [h[idx], h[idx - 1]];
      }, { tag: 'adjust-structure' });
    });
    row.querySelector('[data-act="down"]').addEventListener('click', () => {
      store.update((pr) => {
        const h = pr.typography.hierarchy;
        if (idx >= h.length - 1) return;
        [h[idx + 1], h[idx]] = [h[idx], h[idx + 1]];
      }, { tag: 'adjust-structure' });
    });
    hBlock.append(row);
  });
  hBlock.querySelector('#adj-add-hier').addEventListener('click', () => {
    store.update((pr) => {
      pr.typography.hierarchy.push({ id: `t${Date.now().toString(36)}`, label: '새 단계', size: '18px', weight: '600', lineHeight: '1.5', letterSpacing: '0', family: 'heading' });
    }, { tag: 'adjust-structure' });
  });
  container.append(hBlock);
}

// ---------- 폰트 ----------
function renderFonts(container, store) {
  const p = store.project;
  const b = block('웹폰트', `<button class="btn btn-sm" id="adj-add-font">+ 폰트</button>`);
  if (!p.fonts.length) {
    b.insertAdjacentHTML('beforeend', `<div class="adj-note">감지된 웹폰트가 없습니다. 사용 중인 폰트를 추가하면 미리보기에 반영됩니다.</div>`);
  }
  p.fonts.forEach((f, idx) => {
    const row = document.createElement('div');
    row.style.cssText = 'display:grid;grid-template-columns:1fr auto auto;gap:6px;align-items:center;margin-bottom:6px';
    row.innerHTML = `
      <input type="text" data-k="family" value="${escape(f.family)}" placeholder="Font Family" style="height:30px;padding:0 8px;background:var(--dsg-surface-2);border:1px solid var(--dsg-border-soft);border-radius:6px;color:var(--dsg-text)">
      <select data-k="source" style="height:30px;padding:0 6px;background:var(--dsg-surface-2);border:1px solid var(--dsg-border-soft);border-radius:6px;color:var(--dsg-text)">
        <option value="google" ${f.source === 'google' ? 'selected' : ''}>CDN</option>
        <option value="system" ${f.source === 'system' ? 'selected' : ''}>시스템</option>
      </select>
      <button class="icon-btn danger" data-act="del">✕</button>`;
    row.querySelector('[data-k="family"]').addEventListener('input', (e) => {
      store.update((pr) => { pr.fonts[idx].family = e.target.value; }, { tag: 'adjust-value' });
    });
    row.querySelector('[data-k="source"]').addEventListener('change', (e) => {
      store.update((pr) => { pr.fonts[idx].source = e.target.value; }, { tag: 'adjust-value' });
    });
    row.querySelector('[data-act="del"]').addEventListener('click', () => {
      store.update((pr) => { pr.fonts.splice(idx, 1); }, { tag: 'adjust-structure' });
    });
    b.append(row);
  });
  b.querySelector('#adj-add-font').addEventListener('click', () => {
    store.update((pr) => {
      pr.fonts.push({ family: 'New Font', weights: [400, 700], source: 'google', cssUrl: '' });
    }, { tag: 'adjust-structure' });
  });
  container.append(b);
  container.insertAdjacentHTML('beforeend', `
    <div class="adj-note">CDN으로 표시하면 Google Fonts에서 폰트를 불러와 미리보기에 적용합니다 (cssUrl이 있으면 그 URL 사용). 프리텐다드는 jsdelivr에서 로드합니다.</div>`);
}

// ---------- 스페이싱·모양 ----------
function renderSpacing(container, store) {
  const p = store.project;
  const dimEditor = (title, key, unitHint) => {
    const b = block(title, `<button class="btn btn-sm" data-add="${key}">+ 추가</button>`);
    p[key].forEach((d, idx) => {
      const row = document.createElement('div');
      row.style.cssText = 'display:grid;grid-template-columns:110px 1fr auto;gap:6px;align-items:center;margin-bottom:6px';
      row.innerHTML = `
        <span style="font-family:var(--dsg-mono);font-size:11px;color:var(--dsg-faint)">${escape(d.id)}</span>
        <input type="text" value="${escape(d.value)}" placeholder="${unitHint}" style="height:30px;padding:0 8px;background:var(--dsg-surface-2);border:1px solid var(--dsg-border-soft);border-radius:6px;color:var(--dsg-text);font-family:var(--dsg-mono);font-size:12px">
        <button class="icon-btn danger" data-act="del">✕</button>`;
      row.querySelector('input').addEventListener('input', (e) => {
        store.update((pr) => { pr[key][idx].value = e.target.value; }, { tag: 'adjust-value' });
      });
      row.querySelector('[data-act="del"]').addEventListener('click', () => {
        store.update((pr) => { pr[key].splice(idx, 1); }, { tag: 'adjust-structure' });
      });
      b.append(row);
    });
    b.querySelector(`[data-add="${key}"]`).addEventListener('click', () => {
      const prefix = { spacing: 'space', radius: 'radius', shadows: 'shadow', layout: 'layout' }[key] || key;
      store.update((pr) => { pr[key].push({ id: `${prefix}-${pr[key].length + 1}`, value: '' }); }, { tag: 'adjust-structure' });
    });
    return b;
  };
  container.append(dimEditor('Spacing', 'spacing', '16px'));
  container.append(dimEditor('레이아웃 (컨테이너 폭·섹션 여백·간격)', 'layout', '1200px'));
  container.append(dimEditor('Radius', 'radius', '12px'));
  container.append(dimEditor('Shadow', 'shadows', '0 4px 12px rgba(0,0,0,.1)'));
}

// ---------- 컴포넌트 ----------
function renderComponents(container, store) {
  const c = store.project.preview.components;
  const b = block('표시할 컴포넌트');
  const items = [
    ['buttons', '버튼'], ['inputs', '입력창'], ['cards', '카드'], ['badges', '배지'], ['alerts', '알럿'],
    ['tabs', '탭'], ['accordion', '아코디언'], ['carousel', '캐러셀'],
    ['forms', '폼 컨트롤(스위치·체크·셀렉트)'], ['nav', '내비(브레드크럼·페이지네이션)'],
    ['data', '데이터(테이블·프로그레스)'], ['misc', '기타(아바타·디바이더·칩)'],
  ];
  for (const [key, label] of items) {
    const row = document.createElement('label');
    row.className = 'adj-toggle';
    row.innerHTML = `<span>${label}</span><input type="checkbox" ${c[key] ? 'checked' : ''}>`;
    row.querySelector('input').addEventListener('change', (e) => {
      store.update((pr) => { pr.preview.components[key] = e.target.checked; }, { tag: 'adjust-value' });
    });
    b.append(row);
  }
  container.append(b);
  container.insertAdjacentHTML('beforeend', `
    <div class="adj-note">컴포넌트는 미리보기 토큰만 사용해 렌더됩니다 — 색·라디우스·폰트를 바꾸면 즉시 반영됩니다. 상단의 <strong>라이트/다크</strong> 토글로 두 테마를 확인하세요.</div>`);
}

// ---------- 내보내기 ----------
function renderExport(container, store, hooks) {
  const p = store.project;

  const nameBlock = block('프로젝트');
  nameBlock.append(field('이름', p.meta.name, (v) => {
    store.update((pr) => { pr.meta.name = v; }, { tag: 'adjust-value' });
  }));
  nameBlock.append(field('CSS 변수 접두어', p.export.prefix, (v) => {
    store.update((pr) => { pr.export.prefix = slugify(v) || 'ds'; }, { tag: 'adjust-value' });
  }, { placeholder: 'ds' }));
  container.append(nameBlock);

  const exBlock = block('내보낼 빌더');
  const builders = [
    ['bricks', 'Bricks', '테마 스타일·팔레트·변수 JSON — 실전 검증 형식'],
    ['elementor', 'Elementor', 'Site Settings(키트) JSON'],
    ['greenshift', 'GreenShift', 'figma_settings JSON (+직접 적용)'],
    ['divi', 'Divi', '커스터마이저 JSON — 초기 형식·검증 대기'],
    ['builderius', 'Builderius', '디자인 토큰 JSON — 초기 형식·검증 대기'],
    ['generic', '공용 토큰', 'tokens.css / tokens.json(W3C) / Tailwind'],
  ];
  for (const [key, name, desc] of builders) {
    const row = document.createElement('label');
    row.className = 'export-item';
    row.style.cursor = 'pointer';
    row.innerHTML = `
      <input type="checkbox" ${p.export.builders[key] ? 'checked' : ''}>
      <span class="ex-main"><span class="ex-name">${name}</span><br><span class="ex-desc">${desc}</span></span>`;
    row.querySelector('input').addEventListener('change', (e) => {
      store.update((pr) => { pr.export.builders[key] = e.target.checked; }, { tag: 'adjust-value' });
    });
    exBlock.append(row);
  }
  container.append(exBlock);

  const dlBlock = block('내보내기');
  dlBlock.insertAdjacentHTML('beforeend', `
    <button class="btn btn-primary btn-block" id="adj-export-zip">ZIP 패키지 내려받기</button>
    <button class="btn btn-ghost btn-sm btn-block" id="adj-export-project" style="margin-top:8px">project.json만 저장</button>`);
  container.append(dlBlock);
  dlBlock.querySelector('#adj-export-zip').addEventListener('click', () => hooks.onExportZip?.());
  dlBlock.querySelector('#adj-export-project').addEventListener('click', () => hooks.onExportProject?.());

  // GreenShift 직접 적용
  const gsBlock = block('GreenShift 직접 적용');
  gsBlock.insertAdjacentHTML('beforeend', `
    <div class="adj-note" style="margin-bottom:10px">WordPress 사이트의 <b>애플리케이션 비밀번호</b>로 글로벌 변수·폰트를 즉시 등록합니다. 기존 설정은 GET으로 읽어 병합되므로 안전합니다. (GreenShift 설정 → AI and API에서 발급)</div>
    <div class="adj-field"><label>사이트 URL</label><input type="url" id="gs-url" placeholder="https://example.com"></div>
    <div class="adj-grid2">
      <div class="adj-field"><label>로그인 ID</label><input type="text" id="gs-login"></div>
      <div class="adj-field"><label>앱 비밀번호</label><input type="password" id="gs-pass" placeholder="xxxx xxxx xxxx xxxx"></div>
    </div>
    <button class="btn btn-accent btn-block" id="gs-apply">사이트에 적용</button>
    <div id="gs-status" style="font-size:12px;color:var(--dsg-faint);margin-top:8px"></div>`);
  container.append(gsBlock);
  gsBlock.querySelector('#gs-apply').addEventListener('click', async () => {
    const url = gsBlock.querySelector('#gs-url').value.trim();
    const login = gsBlock.querySelector('#gs-login').value.trim();
    const pass = gsBlock.querySelector('#gs-pass').value;
    const status = gsBlock.querySelector('#gs-status');
    if (!url || !login || !pass) { status.textContent = '세 값을 모두 입력하세요.'; return; }
    status.textContent = '적용 중…';
    hooks.onApplyGreenShift?.(url, login, pass, (msg, kind) => {
      status.textContent = msg;
      hooks.toast?.(msg, kind || 'ok');
    });
  });
}
