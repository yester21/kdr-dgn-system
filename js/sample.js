// sample.js — 첫 로드용 샘플 프로젝트 (실제 추출 결과와 같은 구조)

export const SAMPLE_PROJECT = {
  version: 1,
  meta: {
    name: '샘플 — 머니북 캘린더',
    sourceUrl: 'https://sample.example.com',
    extractedAt: new Date().toISOString(),
    generator: 'design-studio',
  },
  colors: {
    mode: 'auto',
    groups: [
      {
        id: 'brand', name: '브랜드', tokens: [
          { id: 'primary', name: '프라이머리', cssVar: '--primary', value: '#3182f6', dark: '#5c9dff' },
          { id: 'primary-hover', name: '프라이머리 호버', cssVar: '--primary-hover', value: '#3d8bfd', dark: '#6fa6ff' },
          { id: 'primary-active', name: '프라이머리 누름', cssVar: '--primary-active', value: '#1b64da', dark: '#4d8ff2' },
          { id: 'primary-soft', name: '프라이머리 연함', cssVar: '--primary-soft', value: '#e8f3ff', dark: '#14324f' },
        ],
      },
      {
        id: 'text', name: '텍스트', tokens: [
          { id: 'text-strong', name: '텍스트 강함', cssVar: '--text-strong', value: '#191f28', dark: '#f2f5f9' },
          { id: 'text-body', name: '텍스트 본문', cssVar: '--text-body', value: '#333d4b', dark: '#cfd8e3' },
          { id: 'text-sub', name: '텍스트 보조', cssVar: '--text-sub', value: '#6b7684', dark: '#8b95a1' },
          { id: 'text-disabled', name: '텍스트 비활성', cssVar: '--text-disabled', value: '#b0b8c1', dark: '#5d6a7d' },
        ],
      },
      {
        id: 'surface', name: '표면', tokens: [
          { id: 'bg-default', name: '배경 기본', cssVar: '--bg-default', value: '#ffffff', dark: '#10161f' },
          { id: 'bg-subtle', name: '배경 연함', cssVar: '--bg-subtle', value: '#f9fafb', dark: '#161e29' },
          { id: 'bg-muted', name: '배경 중간', cssVar: '--bg-muted', value: '#f2f4f6', dark: '#1d2634' },
        ],
      },
      {
        id: 'border', name: '테두리', tokens: [
          { id: 'border-light', name: '테두리 연함', cssVar: '--border-light', value: '#e5e8eb', dark: '#2a3547' },
          { id: 'border-medium', name: '테두리 진함', cssVar: '--border-medium', value: '#d1d6db', dark: '#46536a' },
        ],
      },
      {
        id: 'semantic', name: '시맨틱', tokens: [
          { id: 'danger', name: '위험', cssVar: '--danger', value: '#f04452', dark: '#ff6b78' },
          { id: 'success', name: '성공', cssVar: '--success', value: '#1d8a3e', dark: '#3fb950' },
          { id: 'warn', name: '주의', cssVar: '--warn', value: '#b25000', dark: '#d29922' },
          { id: 'info', name: '정보', cssVar: '--info', value: '#1264d8', dark: '#5c9dff' },
        ],
      },
    ],
  },
  typography: {
    families: {
      heading: {
        name: 'Pretendard Variable',
        stack: "'Pretendard Variable', Pretendard, -apple-system, BlinkMacSystemFont, system-ui, Roboto, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif",
      },
      body: {
        name: 'Pretendard Variable',
        stack: "'Pretendard Variable', Pretendard, -apple-system, BlinkMacSystemFont, system-ui, Roboto, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif",
      },
      mono: { name: '', stack: '' },
    },
    body: { size: '16px', weight: '400', lineHeight: '1.6', letterSpacing: '0' },
    heading: { weight: '700', lineHeight: '1.25', letterSpacing: '-0.01em' },
    breakpoints: { tablet: 991, phone: 640 },
    hierarchy: [
      { id: 'display', label: '디스플레이', size: '56px', weight: '800', lineHeight: '1.15', letterSpacing: '-0.025em', family: 'heading' , tablet: { size: '48px', lineHeight: '1.2' }, phone: { size: '34px', lineHeight: '1.25' } },
      { id: 'h1', label: '제목 1', size: '42px', weight: '700', lineHeight: '1.25', letterSpacing: '-0.02em', family: 'heading' , tablet: { size: '34px', lineHeight: '1.3' }, phone: { size: '26px', lineHeight: '1.35' } },
      { id: 'h2', label: '제목 2', size: '32px', weight: '700', lineHeight: '1.3', letterSpacing: '-0.015em', family: 'heading' , tablet: { size: '27px', lineHeight: '1.35' }, phone: { size: '21px', lineHeight: '1.4' } },
      { id: 'h3', label: '제목 3', size: '25px', weight: '600', lineHeight: '1.35', letterSpacing: '-0.01em', family: 'heading' , tablet: { size: '21px', lineHeight: '1.4' }, phone: { size: '18px', lineHeight: '1.45' } },
      { id: 'h4', label: '제목 4', size: '20px', weight: '600', lineHeight: '1.35', letterSpacing: '-0.01em', family: 'heading' },
      { id: 'h5', label: '제목 5', size: '18px', weight: '600', lineHeight: '1.4', letterSpacing: '-0.01em', family: 'heading' },
      { id: 'h6', label: '제목 6', size: '15px', weight: '600', lineHeight: '1.45', letterSpacing: '0', family: 'heading' },
      { id: 'body', label: '본문', size: '16px', weight: '400', lineHeight: '1.6', letterSpacing: '0', family: 'body' , tablet: { size: '15px', lineHeight: '1.6' }, phone: { size: '14px', lineHeight: '1.6' } },
      { id: 'small', label: '작은 텍스트', size: '14px', weight: '400', lineHeight: '1.55', letterSpacing: '0', family: 'body' },
      { id: 'caption', label: '캡션', size: '13px', weight: '500', lineHeight: '1.5', letterSpacing: '0', family: 'body' },
    ],
  },
  spacing: [
    { id: 'space-1', value: '4px' }, { id: 'space-2', value: '8px' }, { id: 'space-3', value: '12px' },
    { id: 'space-4', value: '16px' }, { id: 'space-5', value: '24px' }, { id: 'space-6', value: '32px' },
    { id: 'space-7', value: '48px' }, { id: 'space-8', value: '64px' },
  ],
  radius: [
    { id: 'radius-xs', value: '6px' }, { id: 'radius-sm', value: '8px' }, { id: 'radius-md', value: '12px' },
    { id: 'radius-lg', value: '16px' }, { id: 'radius-xl', value: '20px' }, { id: 'radius-full', value: '999px' },
  ],
  shadows: [
    { id: 'shadow-sm', value: '0 2px 8px rgba(0, 0, 0, 0.06)' },
    { id: 'shadow-md', value: '0 4px 16px rgba(0, 0, 0, 0.08)' },
    { id: 'shadow-lg', value: '0 12px 32px rgba(0, 0, 0, 0.12)' },
  ],
  layout: [
    { id: 'container-width', value: '1200px' },
    { id: 'section-pad-y', value: '80px' },
    { id: 'section-pad-y-sm', value: '48px' },
    { id: 'widget-gap', value: '24px' },
    { id: 'stack-gap', value: '12px' },
  ],
  fonts: [
    { family: 'Pretendard Variable', weights: [400, 500, 700, 800], source: 'google', cssUrl: 'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css' },
  ],
  preview: { theme: 'light', viewport: 'desktop', components: { buttons: true, inputs: true, cards: true, badges: true, alerts: true, tabs: true, accordion: true, carousel: true, forms: true, nav: true, data: true, misc: true, cards2: true, content: true } },
  export: {
    prefix: 'ds',
    builders: { bricks: true, elementor: true, greenshift: true, divi: true, builderius: true, generic: true },
  },
};
