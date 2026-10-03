// store.js — 상태 저장소: 이벤트 버스 + localStorage 자동저장 + 프로젝트 정규화
// 키: design-studio-v1

import { uid, slugify } from './util.js';

const LS_KEY = 'design-studio-v1';

export const SECTIONS = [
  { id: 'colors', label: '컬러' },
  { id: 'typography', label: '타이포그래피' },
  { id: 'fonts', label: '폰트' },
  { id: 'spacing', label: '스페이싱·모양' },
  { id: 'components', label: '컴포넌트' },
  { id: 'export', label: '내보내기' },
];

function normColorToken(t) {
  return {
    id: t?.id || slugify(t?.name || 'color'),
    name: String(t?.name || '색상'),
    cssVar: String(t?.cssVar || `--${slugify(t?.name || 'color')}`),
    value: String(t?.value || '#000000'),
    dark: t?.dark ? String(t.dark) : '',
  };
}

function normColorGroup(g) {
  return {
    id: g?.id || slugify(g?.name || 'group'),
    name: String(g?.name || '그룹'),
    tokens: Array.isArray(g?.tokens) ? g.tokens.map(normColorToken) : [],
  };
}

function normRespTier(t) {
  if (!t || !t.size) return undefined;
  return { size: String(t.size), lineHeight: String(t.lineHeight || '') };
}

function normHierarchyItem(h, i) {
  const item = {
    id: h?.id || `t${i}`,
    label: String(h?.label || `단계 ${i + 1}`),
    size: String(h?.size || '16px'),
    weight: String(h?.weight || '400'),
    lineHeight: String(h?.lineHeight || '1.5'),
    letterSpacing: String(h?.letterSpacing || '0'),
    family: h?.family === 'body' || h?.family === 'mono' ? h.family : 'heading',
  };
  const tablet = normRespTier(h?.tablet);
  const phone = normRespTier(h?.phone);
  if (tablet) item.tablet = tablet;
  if (phone) item.phone = phone;
  return item;
}

function normDim(d, i, prefix) {
  return {
    id: d?.id || `${prefix}-${i + 1}`,
    value: String(d?.value ?? ''),
  };
}

// 외부/저장된 project.json을 현 스키마로 방어적으로 정규화
export function normalizeProject(input) {
  const p = input || {};
  const colors = p.colors || {};
  const groups = Array.isArray(colors.groups) && colors.groups.length ? colors.groups : [
    { id: 'brand', name: '브랜드', tokens: [] },
    { id: 'text', name: '텍스트', tokens: [] },
    { id: 'surface', name: '표면', tokens: [] },
    { id: 'border', name: '테두리', tokens: [] },
    { id: 'semantic', name: '시맨틱', tokens: [] },
  ];
  const typ = p.typography || {};
  return {
    version: 1,
    meta: {
      name: String(p.meta?.name || '새 프로젝트'),
      sourceUrl: String(p.meta?.sourceUrl || ''),
      extractedAt: String(p.meta?.extractedAt || ''),
      generator: 'design-studio',
    },
    colors: {
      mode: colors.mode === 'manual' || colors.mode === 'none' ? colors.mode : 'auto',
      groups: groups.map(normColorGroup),
    },
    typography: {
      families: {
        heading: { name: String(typ.families?.heading?.name || ''), stack: String(typ.families?.heading?.stack || '') },
        body: { name: String(typ.families?.body?.name || ''), stack: String(typ.families?.body?.stack || '') },
        mono: { name: String(typ.families?.mono?.name || ''), stack: String(typ.families?.mono?.stack || '') },
      },
      body: {
        size: String(typ.body?.size || '16px'),
        weight: String(typ.body?.weight || '400'),
        lineHeight: String(typ.body?.lineHeight || '1.6'),
        letterSpacing: String(typ.body?.letterSpacing || '0'),
      },
      heading: {
        weight: String(typ.heading?.weight || '700'),
        lineHeight: String(typ.heading?.lineHeight || '1.25'),
        letterSpacing: String(typ.heading?.letterSpacing || '-0.01em'),
      },
      hierarchy: Array.isArray(typ.hierarchy) && typ.hierarchy.length
        ? typ.hierarchy.map(normHierarchyItem)
        : [],
      breakpoints: typ.breakpoints && (typ.breakpoints.tablet || typ.breakpoints.phone)
        ? { tablet: typ.breakpoints.tablet || null, phone: typ.breakpoints.phone || null }
        : {},
    },
    spacing: Array.isArray(p.spacing) ? p.spacing.map((d, i) => normDim(d, i, 'space')) : [],
    radius: Array.isArray(p.radius) ? p.radius.map((d, i) => normDim(d, i, 'radius')) : [],
    shadows: Array.isArray(p.shadows) ? p.shadows.map((d, i) => normDim(d, i, 'shadow')) : [],
    layout: Array.isArray(p.layout) && p.layout.length
      ? p.layout.map((d) => ({ id: String(d?.id || 'layout'), value: String(d?.value ?? '') }))
      : [
          { id: 'container-width', value: '1200px' },
          { id: 'section-pad-y', value: '80px' },
          { id: 'section-pad-y-sm', value: '48px' },
          { id: 'widget-gap', value: '24px' },
          { id: 'stack-gap', value: '12px' },
        ],
    fonts: Array.isArray(p.fonts)
      ? p.fonts.map((f) => ({
          family: String(f?.family || ''),
          weights: Array.isArray(f?.weights) ? f.weights.map(Number).filter(Boolean) : [],
          source: f?.source === 'google' || f?.source === 'upload' ? f.source : 'system',
          cssUrl: String(f?.cssUrl || ''),
        }))
      : [],
    preview: {
      theme: p.preview?.theme === 'dark' ? 'dark' : 'light',
      viewport: p.preview?.viewport === 'tablet' || p.preview?.viewport === 'phone' ? p.preview.viewport : 'desktop',
      components: {
        buttons: p.preview?.components?.buttons !== false,
        inputs: p.preview?.components?.inputs !== false,
        cards: p.preview?.components?.cards !== false,
        badges: p.preview?.components?.badges !== false,
        alerts: p.preview?.components?.alerts !== false,
        tabs: p.preview?.components?.tabs === true,
        accordion: p.preview?.components?.accordion === true,
        carousel: p.preview?.components?.carousel === true,
        forms: p.preview?.components?.forms === true,
        nav: p.preview?.components?.nav === true,
        data: p.preview?.components?.data === true,
        misc: p.preview?.components?.misc === true,
      },
    },
    export: {
      prefix: String(p.export?.prefix || 'ds'),
      builders: {
        bricks: p.export?.builders?.bricks !== false,
        elementor: p.export?.builders?.elementor !== false,
        greenshift: p.export?.builders?.greenshift !== false,
        divi: p.export?.builders?.divi !== false,
        builderius: p.export?.builders?.builderius !== false,
        generic: p.export?.builders?.generic !== false,
      },
    },
  };
}

export class Store {
  constructor(initial) {
    this.project = normalizeProject(initial);
    this.listeners = new Map();
    this.saveTimer = null;
  }

  on(event, fn) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event).add(fn);
    return () => this.listeners.get(event).delete(fn);
  }

  emit(event, payload) {
    const set = this.listeners.get(event);
    if (set) for (const fn of set) fn(payload);
  }

  update(mutator, opts = {}) {
    mutator(this.project);
    this.persist();
    this.emit('project', { section: opts.section || null });
  }

  replace(project) {
    this.project = normalizeProject(project);
    this.persist();
    this.emit('project', { section: null, replaced: true });
  }

  persist() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(LS_KEY, JSON.stringify(this.project));
      } catch (e) {
        // 용량 초과 등 — 조용히 무시 (JSON 저장으로 대체 가능)
      }
    }, 250);
  }

  static loadSaved() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }
}

/* --- 색 토큰 조회 헬퍼 (preview/exporter 공용) --- */

// 그룹 id → 토큰 목록
export function tokensInGroup(project, groupId) {
  const g = project.colors.groups.find((gr) => gr.id === groupId);
  return g ? g.tokens : [];
}

// cssVar(--x) 또는 id로 토큰 찾기
export function findToken(project, ref) {
  if (!ref) return null;
  const key = String(ref).replace(/^var\(|\)$/g, '').trim();
  for (const g of project.colors.groups) {
    for (const t of g.tokens) {
      if (t.cssVar === key || t.cssVar === `--${key}` || t.id === key) return t;
    }
  }
  return null;
}

// 역할 색(hex) — theme 고려. fallbacks: 순서대로 시도.
export function roleColor(project, roles, theme = 'light') {
  for (const r of roles) {
    const t = typeof r === 'string' ? findToken(project, r) : r;
    if (t) {
      if (theme === 'dark' && t.dark) return t.dark;
      return t.value;
    }
  }
  return null;
}

export { uid };
