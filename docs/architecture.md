# 아루 ARU — 시스템 작동 원리 (파트별 도식)

> 코드 기준 문서 (2026-07-03, v0.4.3 / feature `roi-calibrated-2026-07-03`).
> 다이어그램은 GitHub에서 Mermaid로 렌더됩니다.

## 1. 전체 구성도

```mermaid
flowchart LR
    subgraph Client["📱 클라이언트 (Next.js 16 / 브라우저)"]
        HOME[홈 /] --> SCAN[촬영 /scan]
        SCAN --> SURVEY[설문 /survey]
        SURVEY --> REPORT[추천 /report]
        REPORT --> CARE[케어 /care]
        REPORT --> STUDIO[공유카드 /studio]
        SCAN -.연구모드.-> PILOT[/pilot 세션]
        PILOT -.-> OPS[/ops 대시보드]
        OPS -.-> EVAL[/eval 골든셋 하네스]
    end

    subgraph API["서버 라우트 (Vercel)"]
        ANALYZE["/api/analyze<br/>비전 교차검증"]
        REASON["/api/reason<br/>추천 카피 LLM"]
        OUT["/api/out<br/>커머스 클릭 추적"]
        SYNC["/api/sync<br/>파일럿 배치 업로드"]
    end

    subgraph Ext["외부"]
        GEM[Gemini / OpenAI]
        SB[(Supabase<br/>테이블+크롭 버킷)]
        SHOP[올리브영 · 네이버 · 쿠팡]
    end

    SCAN -- "동의 시 얼굴 크롭" --> ANALYZE --> GEM
    REPORT --> REASON --> GEM
    CARE & REPORT --> OUT -- "UTM + 허용목록 302" --> SHOP
    OPS -- "SYNC_TOKEN + 오리진 가드" --> SYNC --> SB

    subgraph ML["🧪 오프라인 ML (ml/, Python)"]
        CAL[calibrate.py<br/>임계값 보정] --> TRAIN["train_visible_attributes.py<br/>--arch mobilenetv3 | efficientnet_b0"]
        TRAIN --> ONNX[ONNX export] --> MANIFEST["manifest.json 승격<br/>+ NEXT_PUBLIC_VISIBLE_ATTR_MODEL"]
    end
    OPS -- "라벨/크롭 JSONL 내보내기" --> CAL
    MANIFEST -. "활성화되면 온디바이스 추론" .-> SCAN
```

**원칙:** 기본 분석은 전부 온디바이스. 서버·외부 전송은 동의(2종 분리) 뒤에만, 정량 피부 수치·효능 클레임은 어디에도 표시하지 않음.

## 2. 카메라 파이프라인 (촬영 → 판독)

```mermaid
flowchart TD
    A["getUserMedia 720×960 전면"] --> B["650ms 품질 틱"]
    B --> C["MediaPipe FaceLandmarker<br/>VIDEO 모드 · detectForVideo(video)"]
    C -->|얼굴 없음| B
    C --> D["추적 가이드 존<br/>실측 랜드마크(T존·양볼) →<br/>object-fit cover 보정 → 미러링"]
    C --> E["품질 게이트 6종<br/>얼굴·중앙·거리·밝기(얼굴박스)·반사·안정"]
    E -->|변화시에만 렌더| F[품질 칩 / 가이드 색]
    E --> G{"자동촬영 ON &<br/>2틱 연속 통과?"}
    G -->|아니오| B
    G -->|예| H["카운트다운 3→2→1<br/>(틱당 1스텝, 이탈 시 취소)"]
    H --> I["capture()"]
    I --> J["풀해상도 프레임 + 재검출<br/>+ 촬영순간 steadiness 재계산"]
    J -->|검증 실패| K["재촬영 안내 + 4초 쿨다운"] --> B
    J --> L["동의 시: 얼굴 크롭 생성"]
    J --> M["버스트: +2프레임(140ms 간격)"]
    M --> N["analyzeSkinBurst"]
    N --> O["4단계 연출 (825ms×4 = 스캔바 1.1s×3회 왕복)<br/>정합→신호추출→판정→교차검증"]
    L -.동의 시.-> P["/api/analyze 클라우드 보정"] --> O
    O --> Q["결과 카드 + 세션 저장<br/>(gyeol_scan · gyeol_reads)"]
```

## 3. 분석 엔진 (특징 → 판독)

```mermaid
flowchart TD
    A[프레임 ImageData + 랜드마크] --> B["ROI 샘플링<br/>TZONE 13점 · CHEEKS 14점 (r=4 패치)"]
    B --> C["휘도 상·하위 10% 트리밍<br/>(머리카락 그림자·글린트 제거)<br/>※ specular 비율은 원본 유지"]
    C --> D["원시 특징<br/>shine · relRedness(부위 상대) · cov(질감)<br/>tzoneL · cheekL · specular"]
    C --> E["피부톤 (기록 전용, 미표시)<br/>gray-world 게인(0.6~1.6 클램프)<br/>→ k-means(k=3) 지배 클러스터<br/>→ CIELAB L* · ITA"]
    D --> F["버스트 융합<br/>특징별 진짜 median(3프레임)<br/>+ 프레임 간 레벨 합의도"]
    F --> G["버킷팅 (임계값 = calibrate.py 보정 대상)<br/>oil 0.05/0.16 · redness 0.012/0.03 · pores 0.085/0.14"]
    G --> H{"ONNX 모델 활성?<br/>(플래그+manifest)"}
    H -->|현재 아니오| I[ROI 판독 사용]
    H -->|300+ 크롭 후| J[MobileNetV3/EfficientNet 예측 병합]
    I & J --> K["confidence = 속성확신 0.72 + 환경신호 0.28<br/>× 합의도 보정 → 재촬영 판단"]
    K --> L["표시 항목: 유분·모공결·붉은기·전반<br/>+ 톤 균일감·T존 반사광 + 측정환경 3종"]
```

## 4. 데이터 처리 & 동의 (수집 → 학습)

```mermaid
flowchart LR
    subgraph Device["기기 내 저장"]
        SS["sessionStorage (새로고침 소멸)<br/>gyeol_scan · gyeol_reads · gyeol_survey"]
        LS["localStorage<br/>라벨 · 크롭(최대120) · 동의로그 · 구매/클릭 기록"]
    end

    CONSENT{"동의 2종 (촬영 전 기록)<br/>① AI 분석 전송(Gemini/OpenAI 명시)<br/>② 학습 크롭 저장"} -->|①| API1[/api/analyze/]
    CONSENT -->|②| LS
    FEEDBACK["맞아요/조금 달라요 + 트러블 관찰"] --> LS

    LS --> EXPORT["/privacy · /ops 내보내기<br/>JSONL/CSV (수동 = 원본)"]
    LS -- "/ops + SYNC_TOKEN<br/>오리진 가드 · 12회/60초" --> SYNC[/api/sync/] --> SB[(Supabase)]

    EXPORT --> PIPE["ML 파이프라인 (게이트)<br/>＜30 캘리브레이션만 → 100+ dry-run<br/>→ 300+ 학습·ONNX → 500+ 톤별 공정성(ITA)"]
    GOLD["/eval 골든셋 하네스<br/>브라우저 내 재판독 → 베이스라인 JSONL diff"] -.코드 변경마다 회귀 측정.-> PIPE
```

## 5. 추천 · 커머스 루프

```mermaid
flowchart TD
    A[설문 + 스캔 신호] --> B["recommend()<br/>타입/고민/제외성분/카테고리 스코어링<br/>→ 톤·브랜드 다양화 → picks"]
    B --> C["이유 문구: 템플릿 → /api/reason LLM 다듬기<br/>모든 카피 efficacyClean() 필터 (의료 클레임 차단)"]
    B --> D["routineFor(): 아침/저녁 루틴<br/>단계별 왜(실신호 근거) + 주기 칩<br/>스캔 미적용 시 설문 근거만 사용"]
    C & D --> E[리포트]
    E --> F["/api/out?sku&merchant&placement<br/>허용목록 검증 + UTM + 파트너 오버라이드<br/>(COMMERCE_LINK_OVERRIDES_JSON)"]
    F --> G[올리브영 · 네이버 · 쿠팡 · 글로벌]
    E --> H["공유 카드 /studio<br/>실스캔 프리필 → Web Share(카톡)"]
    G -.클릭 기록.-> I[care intents → 제휴 협상 지표]
```

## 관련 문서
`analysis-performance-roadmap.md`(성능 로드맵) · `pilot-ml-loop.md`(파일럿 런북) · `golden-set.md`(회귀 프로토콜) · `commerce-partnership-playbook.md`(BM) · `mobile-camera-qa.md`(QA)
