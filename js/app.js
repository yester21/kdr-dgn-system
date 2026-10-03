// app.js — 배선: URL 가져오기, 섹션 전환, 미리보기·조정 패널 갱신, 저장/내보내기

import { Store, SECTIONS } from './store.js';
import { normalizeUrl, fetchPage } from './proxy.js';
import { extractDesignSystem } from './extract.js';
import { ensureDarkValues } from './scale.js';
import { renderPreview, applyTokens } from './preview.js';
import { renderAdjust } from './adjust.js';
import { exportZip, exportProjectJson } from './export.js';
import { applyToGreenShift } from './rest.js';
import { SAMPLE_PROJECT } from './sample.js';
import { readTextFile, download, jsonBlob, debounce } from './util.js';

const $ = (sel) => document.querySelector(sel);

const store = new Store(Store.loadSaved() || SAMPLE_PROJECT);
ensureDarkValues(store.project);

let activeSection = 'colors';

/* ---------- 토스트 ---------- */

function toast(msg, kind = 'ok') {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = msg;
  $('#toast-area').append(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .25s'; }, 2600);
  setTimeout(() => el.remove(), 3000);
}

/* ---------- 모달 ---------- */

function openModal({ title, build, actions = [] }) {
  const root = $('#modal-root');
  const back = document.createElement('div');
  back.className = 'modal-backdrop';
  back.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true">
      <div class="modal-head"><span class="modal-title"></span>
        <button class="icon-btn" data-close>✕</button></div>
      <div class="modal-body"></div>
      <div class="modal-foot"></div>
    </div>`;
  back.querySelector('.modal-title').textContent = title;
  const body = back.querySelector('.modal-body');
  build?.(body);
  const foot = back.querySelector('.modal-foot');
  const close = () => back.remove();
  for (const a of actions) {
    const btn = document.createElement('button');
    btn.className = `btn ${a.class || 'btn-ghost'}`;
    btn.textContent = a.label;
    btn.addEventListener('click', () => a.onClick?.(body, close));
    foot.append(btn);
  }
  back.addEventListener('click', (e) => { if (e.target === back) close(); });
  back.querySelector('[data-close]').addEventListener('click', close);
  root.append(back);
  return close;
}

/* ---------- 미리보기 / 조정 패널 갱신 ---------- */

const canvas = $('#pv-canvas');

function repaintPreview() {
  const theme = store.project.preview.theme;
  canvas.dataset.theme = theme;
  applyTokens(canvas, store.project, theme);
  renderPreview(canvas, store.project, {
    onCopyColor: (t) => toast(`${t.name} — ${t.value} 복사됨`, 'ok'),
  });
}

function repaintAdjust() {
  renderAdjust($('#adjust-pane'), store, activeSection, {
    toast,
    onExportZip: () => doExportZip(),
    onExportProject: () => { exportProjectJson(store.project); toast('project.json을 저장했습니다', 'ok'); },
    onApplyGreenShift: (url, login, pass, report) => {
      applyToGreenShift(store.project, url, login, pass, report).catch((e) => report(`오류: ${e.message}`, 'error'));
    },
  });
}

const repaintPreviewDebounced = debounce(repaintPreview, 60);

store.on('project', (e) => {
  repaintPreviewDebounced();
  if (e.tag !== 'adjust-value') repaintAdjust();
  updateHeaderMeta();
});

function updateHeaderMeta() {
  $('#pv-project-name').textContent = store.project.meta.name || '새 프로젝트';
  $('#pv-source-url').textContent = store.project.meta.sourceUrl || '';
  const badge = $('#source-badge');
  if (store.project.meta.sourceUrl) {
    badge.hidden = false;
    badge.textContent = store.project.meta.sourceUrl.replace(/^https?:\/\//, '');
    badge.title = store.project.meta.sourceUrl;
  } else {
    badge.hidden = true;
  }
}

/* ---------- 좌측 내비 ---------- */

function renderNav() {
  const nav = $('#side-nav');
  nav.replaceChildren();
  for (const s of SECTIONS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `nav-chip${s.id === activeSection ? ' is-active' : ''}`;
    btn.textContent = s.label;
    btn.addEventListener('click', () => selectSection(s.id));
    nav.append(btn);
  }
}

function selectSection(id) {
  activeSection = id;
  renderNav();
  repaintAdjust();
  const target = $(`#sec-${id}`);
  if (target) {
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } else if (id === 'export') {
    // 내보내기는 미리보기 섹션 없음 — 상단으로
    $('#pv-scroll').scrollTo({ top: 0, behavior: 'smooth' });
  }
}

/* ---------- 테마 토글 ---------- */

$('#theme-seg').addEventListener('click', (e) => {
  const btn = e.target.closest('.seg-btn');
  if (!btn) return;
  const theme = btn.dataset.theme;
  store.update((pr) => { pr.preview.theme = theme; }, { tag: 'theme' });
  for (const b of $('#theme-seg').children) b.classList.toggle('is-active', b === btn);
});

/* ---------- 뷰포트 전환 (반응형 폰트 미리보기) ---------- */

$('#vp-seg').addEventListener('click', (e) => {
  const btn = e.target.closest('.seg-btn');
  if (!btn) return;
  const viewport = btn.dataset.viewport;
  store.update((pr) => { pr.preview.viewport = viewport; }, { tag: 'viewport' });
  for (const b of $('#vp-seg').children) b.classList.toggle('is-active', b === btn);
  document.querySelector('#sec-typography')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

/* ---------- URL 가져오기 ---------- */

async function runExtraction(html, baseUrl, via) {
  const project = await extractDesignSystem(html, baseUrl, {
    onProgress: (m) => toast(m),
  });
  ensureDarkValues(project);
  store.replace(project);
  toast(`추출 완료 (${via}) — 좌측에서 조정하고 내보내세요`, 'ok');
}

$('#url-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const raw = $('#url-input').value;
  const url = normalizeUrl(raw);
  if (!url) { toast('URL 형식을 확인하세요', 'error'); return; }
  const btn = $('#btn-fetch');
  btn.disabled = true;
  btn.textContent = '가져오는 중…';
  try {
    const result = await fetchPage(url, { onProgress: (m) => toast(m) });
    if (!result) {
      toast('프록시 전체 실패 — 소스 붙여넣기로 시도하세요', 'error');
      openPasteModal(url);
      return;
    }
    await runExtraction(result.html, url, `프록시: ${result.via}`);
  } catch (err) {
    toast(`오류: ${err.message || err}`, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '가져오기';
  }
});

function openPasteModal(url) {
  openModal({
    title: '페이지 소스 붙여넣기',
    build: (body) => {
      body.insertAdjacentHTML('beforeend', `
        <div class="adj-note" style="margin-bottom:10px">
          대상 사이트에서 <b>우클릭 → 페이지 소스 보기</b>(또는 Ctrl+U)로 전체 HTML을 복사해 아래에 붙여넣으세요.
          외부 CSS 파일도 함께 분석하려면 사이트 URL을 상단 입력창에 남겨두세요(프록시가 CSS 파일은 가져올 수 있는 경우가 있습니다).
        </div>
        <textarea placeholder="<!doctype html> …"></textarea>`);
      const ta = body.querySelector('textarea');
      ta.value = '';
      setTimeout(() => ta.focus(), 50);
    },
    actions: [
      { label: '취소' },
      {
        label: '분석 시작', class: 'btn-primary',
        onClick: async (body, close) => {
          const html = body.querySelector('textarea').value;
          if (!html.includes('<')) { toast('HTML 소스가 아닌 것 같습니다', 'error'); return; }
          close();
          const baseUrl = normalizeUrl($('#url-input').value) || url || '';
          try {
            await runExtraction(html, baseUrl, '소스 붙여넣기');
          } catch (err) {
            toast(`분석 오류: ${err.message || err}`, 'error');
          }
        },
      },
    ],
  });
}

$('#btn-paste').addEventListener('click', () => openPasteModal($('#url-input').value));

/* ---------- 저장 / 열기 / 내보내기 ---------- */

$('#btn-save').addEventListener('click', () => {
  exportProjectJson(store.project);
  toast('project.json을 저장했습니다', 'ok');
});

$('#btn-open').addEventListener('click', () => $('#file-json').click());
$('#file-json').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file) return;
  try {
    const text = await readTextFile(file);
    const data = JSON.parse(text);
    if (!data || typeof data !== 'object' || !data.colors) throw new Error('project.json 구조가 아닙니다');
    ensureDarkValues(data);
    store.replace(data);
    toast('프로젝트를 불러왔습니다', 'ok');
  } catch (err) {
    toast(`불러오기 실패: ${err.message}`, 'error');
  }
});

function doExportZip() {
  try {
    const files = exportZip(store.project);
    toast(`${files.length}개 파일 ZIP으로 내보냈습니다 — IMPORT-GUIDE.md 참고`, 'ok');
  } catch (err) {
    toast(`내보내기 오류: ${err.message || err}`, 'error');
  }
}
$('#btn-export').addEventListener('click', doExportZip);

/* ---------- 초기 렌더 ---------- */

renderNav();
repaintAdjust();
repaintPreview();
updateHeaderMeta();
for (const b of $('#theme-seg').children) {
  b.classList.toggle('is-active', b.dataset.theme === store.project.preview.theme);
}
for (const b of $('#vp-seg').children) {
  b.classList.toggle('is-active', b.dataset.viewport === (store.project.preview.viewport || 'desktop'));
}
