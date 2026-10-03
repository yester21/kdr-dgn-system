# Design Studio — 디자인 시스템 생성기

사이트 URL을 넣으면 **폰트 계층 · 컬러 · CSS 토큰을 추출**해서 에셋 형태(타이포 스펙imen ·
컬러 스와치 · 버튼/카드/입력창 컴포넌트)로 미리보고, 왼쪽 패널에서 조정한 뒤
**WordPress 빌더 5종(Bricks · Elementor · GreenShift · Divi · Builderius)** 용 임포트 파일로
발행하는 독립형 정적 웹앱. 라이트/다크 모드 지원.

```
URL 입력 → 추출(CSSOM 분석) → 미리보기 + 좌측 조정 → ZIP 내보내기 / GreenShift 직접 적용
```

## 실행법

빌드 도구·npm 없이 정적 서빙만으로 동작한다:

```bash
cd design-studio
python -m http.server 3100
# http://localhost:3100
```

Cloudflare Pages / Netlify / Vercel / GitHub Pages 어디든 그대로 배포 가능.

## 워크플로

1. **가져오기** — 헤더에 URL 입력. CORS 프록시 체인(allorigins → corsproxy.io → codetabs → r.jina.ai)으로
   HTML과 외부 CSS를 가져온 뒤, 감춘 iframe의 **브라우저 네이티브 CSSOM**으로 분석한다.
   전부 실패하면 `소스 붙여넣기`(페이지 소스 직접 붙여넣기)로 동일하게 분석된다.
2. **추출 결과** — `:root` CSS 변수, 색상 빈도(OKLCH 클러스터링으로 브랜드/중립 분리),
   font-family 빈도 + Google Fonts 링크, h1~h6/p 규칙의 타이포 계층, border-radius·box-shadow·
   스페이싱 후보, `prefers-color-scheme: dark` 변수(있으면 다크 값으로 승격),
   **@media(max-width) 안의 폰트 크기 오버라이드(반응형 타이포)** — 사이트 max-width 통계에서
   태블릿/모바일 브레이크포인트를 추정해 계층 항목에 `tablet`/`phone` 값으로 붙인다.
   **레이아웃 토큰**도 추출한다 — 컨테이너 폭(max-width 960~1600 최빈값), 섹션 세로 여백
   (padding-y 40~200), 위젯 간격(큰 gap)·스택 간격(작은 gap). 컴포넌트 미리보기는 12종
   (버튼·입력창·카드·배지·얼럿·**탭·아코디언·캐러셀**·폼 컨트롤·내비·데이터·기타)이며
   탭/아코디언/캐러셀은 실제로 클릭 동작한다.
3. **조정** — 좌측 패널에서 토큰 이름·값·cssVar·다크값 편집, 프라이머리 11단계 스케일 생성,
   타이포 계층 편집, 컴포넌트 표시 선택. 추출은 자동이지만 **판단·조정은 사람이** — 사이트마다
   CSS 편차가 크므로 편집을 전제로 설계됐다.
4. **미리보기** — 중앙 캔버스가 곧 산출물. 모든 요소는 `--p-*` 토큰만 사용해 렌더되고
   **라이트/다크 토글**로 두 테마를, **뷰포트 토글(🖥/📱T/📱M)**로 반응형 폰트 크기 적용 상태를
   확인한다(태블릿 720px·모바일 400px 캔버스 시뮬레이션). 폰트는 Google Fonts/jsdelivr CDN에서 로드
   (오프라인이면 시스템 폰트 폴백).
5. **발행** — `내보내기` → ZIP(`IMPORT-GUIDE.md` 포함). 또는 GreenShift는 사이트에 직접 적용.

## 빌더별 내보내기 형식과 상태

| 폴더 | 파일 | 근거 | 상태 |
|---|---|---|---|
| `bricks/` | `theme-styles.json` · `color-palette.json` · `global-variables.json` | fin-calc 실전 투입 샘플과 동일 구조(6자리 hex id, `conditions:[{main:"any"}]`, 팔레트 `raw=var(--x)` 참조 + 변수 파일이 값 정의). 반응형은 `_tablet`(≤991)/`_landscape`(≤767)/`_portrait`(≤478) 접미어 | ✅ 검증 형식 (반응형 포함 분은 검증 대기) |
| `elementor/` | `site-settings.json` | 키트 site-settings 표준 키(`system_colors` 4슬롯 + `custom_colors` + `system_typography` + `custom_typography`). 반응형은 `typography_font_size_tablet`/`_mobile` | ✅ 표준 키 (래퍼 문서 기반) |
| `greenshift/` | `figma-settings.json` | `wp-json/greenshift/v1/figma_settings` 실측 규격(`variables` 배열, `figma_fonts`) | ✅ 실측 규격 + 앱 내 직접 적용(GET 병합 POST) |
| `divi/` | `divi-customizer.json` | 테마 커스터마이저 포터빌리티 + `et_divi`/`et_global_data.global_colors` | ⚠ 초기 형식 — 실제 임포트 검증 대기 |
| `builderius/` | `design-tokens.json` | W3C 토큰 구조 | ⚠ 초기 형식 — 실제 임포트 검증 대기 |
| `generic/` | `tokens.css`(+`[data-theme="dark"]`) · `tokens.json`(W3C) · `tailwind-snippet.js` | — | ✅ |

Divi·Builderius가 거부하면 `generic/tokens.css`를 각 빌더의 글로벌 CSS에 붙여넣는
확실한 경로가 항상 있다(IMPORT-GUIDE에 안내).

## 프라이버시 / 외부 의존

- **CORS 프록시**: 입력한 URL이 제3자 프록시 서비스(allorigins, corsproxy.io, codetabs, r.jina.ai)로
  전송된다. 내부 사이트를 분석할 때는 `소스 붙여넣기`를 쓰면 URL이 외부로 나가지 않는다(CSS 파일은 제외).
- **폰트 CDN**: 미리보기 폰트 로드에 fonts.googleapis.com / cdn.jsdelivr.net 사용. 실패·차단 시
  시스템 폰트로 렌더되며 앱 동작에는 영향 없음.
- 그 외 외부 네트워크 호출 0. 상태는 localStorage(`design-studio-v1`)에 자동 저장.

## project.json 스키마 (요약)

```jsonc
{
  "version": 1,
  "meta": { "name": "", "sourceUrl": "", "extractedAt": "" },
  "colors": {
    "mode": "auto|manual|none",           // 다크값 자동 도출 여부
    "groups": [ { "id": "brand", "name": "브랜드",
      "tokens": [ { "id": "primary", "name": "프라이머리", "cssVar": "--primary", "value": "#3182f6", "dark": "#5c9dff" } ] } ]
  },
  "typography": {
    "families": { "heading": { "name": "", "stack": "" }, "body": { "name": "", "stack": "" }, "mono": {} },
    "body": { "size": "16px", "weight": "400", "lineHeight": "1.6", "letterSpacing": "0" },
    "heading": { "weight": "700", "lineHeight": "1.25", "letterSpacing": "-0.01em" },
    "breakpoints": { "tablet": 991, "phone": 640 },
    "hierarchy": [ { "id": "h1", "label": "제목 1", "size": "42px", "weight": "700", "lineHeight": "1.25", "letterSpacing": "-0.02em", "family": "heading",
                     "tablet": { "size": "34px", "lineHeight": "1.3" }, "phone": { "size": "26px", "lineHeight": "1.35" } } ]
  },
  "spacing": [ { "id": "space-4", "value": "16px" } ],
  "layout": [ { "id": "container-width", "value": "1200px" }, { "id": "section-pad-y", "value": "80px" }, { "id": "section-pad-y-sm", "value": "48px" }, { "id": "widget-gap", "value": "24px" }, { "id": "stack-gap", "value": "12px" } ],
  "radius":  [ { "id": "radius-md", "value": "12px" } ],
  "shadows": [ { "id": "shadow-md", "value": "0 4px 16px rgba(0,0,0,.08)" } ],
  "fonts": [ { "family": "Pretendard Variable", "weights": [400,700], "source": "google", "cssUrl": "…" } ],
  "preview": { "theme": "light", "components": { "buttons": true } },
  "export":  { "prefix": "ds", "builders": { "bricks": true } }
}
```

외부 JSON은 `store.js`의 `normalizeProject()`가 현 스키마로 방어적으로 정규화한다.

## 파일 구성

```
design-studio/
├── index.html          # 다크 UI 스켈레톤
├── assets/app.css      # 앱 토큰(--dsg-*) + 미리보기(--p-*) + 컴포넌트
└── js/
    ├── app.js          # 배선
    ├── store.js        # 상태 + 이벤트 버스 + localStorage + normalize
    ├── util.js         # uid·download·색 변환(hex/hsl/oklch)·WCAG 대비
    ├── proxy.js        # CORS 프록시 체인
    ├── extract.js      # CSSOM 추출 + 클러스터링 (핵심 엔진)
    ├── scale.js        # 11단계 스케일 · 다크 팔레트 도출
    ├── preview.js      # 미리보기 렌더 (토큰 주입)
    ├── adjust.js       # 좌측 조정 패널
    ├── exporters.js    # 빌더 5종 + generic 변환기 · IMPORT-GUIDE
    ├── rest.js         # GreenShift 직접 적용 (GET 병합 POST)
    ├── export.js       # ZIP/JSON 내보내기
    ├── zip.js          # 자체 ZIP 라이터 (store 방식, CRC32)
    └── sample.js       # 첫 로드 샘플
```
