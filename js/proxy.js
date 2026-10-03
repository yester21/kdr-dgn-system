// proxy.js — 외부 사이트 HTML/CSS 가져오기: CORS 프록시 체인 + 소스 붙여넣기 폴백
// 주의: 입력한 URL이 아래 제3자 프록시 서비스로 전송됩니다(README 참고).

const TIMEOUT_MS = 10000;

const PROXIES = [
  {
    name: 'allorigins',
    build: (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  },
  {
    name: 'corsproxy.io',
    build: (url) => `https://corsproxy.io/?url=${encodeURIComponent(url)}`,
  },
  {
    name: 'codetabs',
    build: (url) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
  },
  {
    name: 'jina',
    build: (url) => `https://r.jina.ai/${url}`,
    headers: { 'X-Respond-With': 'html' },
  },
];

function fetchWithTimeout(target, opts = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  return fetch(target, { ...opts, signal: ctrl.signal })
    .finally(() => clearTimeout(timer));
}

async function tryProxy(proxy, url, { asText = false } = {}) {
  const res = await fetchWithTimeout(proxy.build(url), {
    headers: proxy.headers || {},
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = asText ? await res.text() : await res.text();
  return body;
}

// jina 리더 랩 벗기기 — "Title: …\nURL Source: …\nMarkdown Content:\n<본문>" 형태
function stripReaderWrap(text) {
  if (typeof text !== 'string') return text;
  const idx = text.indexOf('Markdown Content:');
  if (idx >= 0 && idx < 300 && /^Title:/m.test(text.slice(0, idx))) {
    return text.slice(idx + 'Markdown Content:'.length).replace(/^\s*\n/, '');
  }
  return text;
}

// URL 정규화 — 스킴 없으면 https 붙임
export function normalizeUrl(input) {
  let v = String(input || '').trim();
  if (!v) return null;
  if (!/^https?:\/\//i.test(v)) v = `https://${v}`;
  try {
    const u = new URL(v);
    if (!u.hostname.includes('.')) return null;
    return u.href;
  } catch (e) {
    return null;
  }
}

// 페이지 HTML 가져오기 → { html, via } / 실패 시 null
export async function fetchPage(url, { onProgress } = {}) {
  const errors = [];
  for (const proxy of PROXIES) {
    if (onProgress) onProgress(`프록시 시도: ${proxy.name}…`);
    try {
      const body = stripReaderWrap(await tryProxy(proxy, url));
      if (body && body.includes('<')) {
        return { html: body, via: proxy.name };
      }
      errors.push(`${proxy.name}: HTML 아님`);
    } catch (e) {
      errors.push(`${proxy.name}: ${e.message || '실패'}`);
    }
  }
  console.warn('[design-studio] 프록시 전체 실패', errors);
  return null;
}

// CSS 파일 등 텍스트 리소스 가져오기 → string / null
export async function fetchText(url) {
  for (const proxy of PROXIES) {
    try {
      const body = stripReaderWrap(await tryProxy(proxy, url));
      if (typeof body === 'string' && body.length) return body;
    } catch (e) {
      /* 다음 프록시로 */
    }
  }
  return null;
}

// URL을 절대 경로로 변환
export function absolutize(href, baseUrl) {
  try {
    return new URL(href, baseUrl || 'https://example.com').href;
  } catch (e) {
    return null;
  }
}
