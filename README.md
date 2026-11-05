# SCAM CUT AI (스캠컷 AI)

> 사기의 흐름을 읽고, 피해의 연결을 끊다.

문자·전화·이메일에 흩어진 금융사기 의심 정황을 **하나의 사건으로 연결**하고, 송금·인증번호·개인정보 제공 같은 위험 행동을 **실행 전에** 막아주는 모바일 웹앱입니다.


## 현재 화면 구성 (1단계: 자료 관리 · localStorage)

블루·화이트 톤의 모바일 웹앱이며, 해시 라우팅(`#/...`)이라 Vercel에서 별도 설정 없이 동작합니다.

| 화면 | 주소 | 기능 |
|---|---|---|
| 홈 | `#/` | 요약(사건·자료·미분류 수), 최근 사건, 미분류 자료 |
| 사건 목록 | `#/incidents` | 사건 생성 |
| 사건 상세 | `#/incident/:id` | 사건 수정·삭제, 시각 순서 타임라인, 자료 수정·삭제 |
| 자료 등록/수정 | `#/evidence/new`, `#/evidence/:id/edit` | 문자·전화·이메일 자료 CRUD, 사건 연결 |
| 자료 상세 | `#/evidence/:id` | 자료 전체 내용 확인, 수정·삭제 |
| 분석 결과 | `#/incident/:id/analysis` | MULTI SCAN·SCAM FLOW·ACTION GUARD·SAFE VERIFY 영역(저장된 분석 기록이 있을 때만 내용 표시) |
| 분석 내역 | `#/history` | 저장된 분석 기록(현재는 비어 있음), 분석 준비 현황 |
| 내 정보 | `#/me` | 저장된 데이터 현황, 개인정보 안내, 전체 데이터 삭제 |

디자인: 단색 블루 + 선형 SVG 아이콘(이모지·그라데이션 없음). 색상은 `app/globals.css` 상단 변수, 아이콘은 `app/components/icons.tsx`에 있습니다. 이전 스타일은 `legacy/globals.step2.css`에 백업되어 있습니다.

- 데이터는 `localStorage`(`scamcut.v2`)에만 저장됩니다. 이전 버전(`scamcut.items.v1`) 자료는 '미분류'로 자동 가져옵니다.
- **AI 분석은 아직 UI에 연결되지 않았으며, 어떤 분석 결과도 표시하지 않습니다.** 타임라인은 입력 시각 기준의 단순 정렬입니다.
- 이전 단계의 분석 UI(MULTI SCAN/SCAM FLOW 등)는 `legacy/`에 보관되어 있고, `lib/rules.ts`·`lib/flow.ts`·`lib/privacy.ts`·`app/api/analyze`는 그대로 남아 있어 다음 단계에서 연결합니다.

## 핵심 기능 (설계 목표)

| 탭 | 기능 | 분석 방식 |
|---|---|---|
| 🔍 MULTI SCAN | 자료별 위험 징후(사칭·압박·비밀유지·의심 링크 등)와 위험도 | 📏 규칙(실시간) + 🤖 AI 나란히 비교 |
| 🧬 SCAM FLOW | 자료 간 연결 그래프, 사건 묶기, 4단계 타임라인(접근→신뢰 형성→압박→실행 요구), 예상 다음 단계 | 📏 연결 점수 + Union-Find / 🤖 맥락 기반 재구성 + **두 방식 일치도** |
| 🛡️ ACTION GUARD | "지금 하려는 행동"을 고르면 자료에서 그 행동을 요구받았는지 교차 확인하고 멈춤 경고 + 체크리스트 | 📏 + 🤖 탐지 근거 표시 |
| ✅ SAFE VERIFY | 유형별 공식 확인 방법, 112·1332·118 바로 걸기, 피해 발생 시 조치 | 📏 정적 공공정보 + 🤖 맞춤 안전 행동 |

### AI 분석과 규칙 기반 판단은 구분됩니다
- **📏 규칙 기반** (`lib/rules.ts`, `lib/flow.ts`): 브라우저에서 즉시 실행됩니다. 키워드·정규식으로 징후와 엔티티(번호·계좌·도메인·인물)를 뽑고, 자료 쌍마다 연결 점수를 계산합니다(같은 번호 +45, 같은 계좌 +50, 같은 인물 +35, 같은 시나리오 +20, 3시간 이내 +15 …). 35점 이상인 쌍을 같은 사건으로 묶습니다. 모든 점수에 근거가 표시됩니다.
- **🤖 AI 분석** (`app/api/analyze/route.ts`): Claude(`claude-opus-5-5`)가 구조화된 출력(JSON 스키마)으로 자료별 위험도, 사건 묶음, 타임라인, 서사, 예상 다음 단계를 생성합니다. 공정한 비교를 위해 **AI에는 규칙 엔진 결과를 주지 않습니다.**
- 분석 결과는 어디에도 하드코딩되어 있지 않습니다. `lib/samples.ts`는 데모용 **입력 원문**일 뿐이고, 결과는 매번 계산됩니다.

### 개인정보 보호
- 입력 자료는 **브라우저 localStorage에만** 저장됩니다(서버 DB 없음).
- AI 전송 전에 **기기에서** 전화번호·계좌·주민번호·카드번호·인증번호·비밀번호·이메일을 마스킹합니다(`lib/privacy.ts`). 같은 번호는 같은 토큰(`[전화#1]`)으로 바꾸기 때문에, 원래 값은 숨기면서도 AI가 연결 고리를 파악할 수 있습니다.
- MULTI SCAN 탭의 "AI 전송 내용 미리보기"에서 실제로 전송되는 내용을 확인할 수 있습니다.
- 서버는 본문을 저장하거나 로그에 남기지 않습니다. API 키는 서버 환경변수에만 둡니다.

## 로컬 실행 (Windows PowerShell)

```powershell
cd C:\Users\user\scamcut-ai
npm install

# API 키 설정 (.env.local 파일 생성)
Copy-Item .env.example .env.local
notepad .env.local   # ANTHROPIC_API_KEY=sk-ant-... 입력 후 저장

npm run dev          # http://localhost:3000
```

휴대폰에서 테스트하려면 PC와 같은 Wi-Fi에서 `npm run dev -- -H 0.0.0.0`로 실행한 뒤 `http://<PC IP>:3000`으로 접속하세요(PC IP는 `ipconfig`로 확인).

API 키가 없어도 앱은 동작합니다. 이 경우 규칙 기반 분석만 사용하며, 화면에 "AI 키 미설정"이 표시됩니다.

```powershell
npm run test:rules   # 규칙 엔진·사건 연결·마스킹 테스트
npm run build        # 프로덕션 빌드 확인
```

## GitHub 업로드 & Vercel 배포 (PowerShell)

```powershell
cd C:\Users\user\scamcut-ai
git init
git add .
git commit -m "SCAM CUT AI initial"
git branch -M main
git remote add origin https://github.com/<계정>/scamcut-ai.git
git push -u origin main
```

1. https://vercel.com → **Add New… → Project** → GitHub 저장소 선택 (Framework: Next.js 자동 인식)
2. **Environment Variables**에 `ANTHROPIC_API_KEY` 추가 (선택: `ANTHROPIC_MODEL`, `SCAMCUT_EFFORT`)
3. **Deploy**

`.env.local`은 `.gitignore`에 포함되어 있어 GitHub에 올라가지 않습니다.

## 환경변수

| 이름 | 기본값 | 설명 |
|---|---|---|
| `ANTHROPIC_API_KEY` | (필수: AI 사용 시) | Anthropic API 키 |
| `ANTHROPIC_MODEL` | `claude-opus-5-5` | 사용할 Claude 모델 |
| `SCAMCUT_EFFORT` | `low` | 추론 깊이 `low`/`medium`/`high`. 높을수록 정밀하지만 느림 |

## 구조

```
app/
  page.tsx                 # 상태 관리, 탭, AI 호출(마스킹 후 전송)
  api/analyze/route.ts     # Claude 구조화 출력 분석 API
  components/              # ScanView, FlowView(그래프·타임라인), GuardView, VerifyView
lib/
  rules.ts                 # 규칙 기반 징후·행동·엔티티 탐지
  flow.ts                  # 사건 연결 엔진 + AI/규칙 일치도
  privacy.ts               # 기기 내 개인정보 마스킹
  verify.ts                # 공식 확인 경로·행동 가이드
  samples.ts               # 데모 입력 예시 (가상 데이터)
scripts/test-rules.ts      # 엔진 테스트
```

## 스캔이(안내 캐릭터)

- 이미지: `public/images/scani.png` (투명 배경). 교체하려면 같은 이름으로 덮어쓰면 됩니다.
- 메인 화면의 'AI 사기 분석 시작' 버튼 옆 캐릭터 또는 안내 카드를 누르면 **스캔이 AI 도우미** 안내창이 열립니다(자료 등록 방법 / SCAM FLOW 사건 연결 / 위험 행동 예방 / 안전 확인 방법).
- 안내 문구는 `lib/scani.ts`의 단계(`idle` · `analyzing` · `danger` · `safe`)로 바뀝니다. 단계는 **저장된 분석 기록의 `verdict` 값**(또는 분석 진행 플래그)에서만 결정되므로, AI 분석이 연결되기 전에는 항상 `idle`이며 위험·안전 문구나 실시간 감지 알림은 나타나지 않습니다.
- 다음 단계에서 분석 결과를 저장할 때 `AnalysisRecord.verdict`(`"danger"` | `"safe"`)를 채우면 캐릭터 문구가 자동으로 바뀝니다. 분석 중 표시는 `deriveStage(analyses, true)`처럼 진행 플래그를 넘기면 됩니다.
