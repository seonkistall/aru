# 피부 분석 성능 개선 로드맵

카메라 피부 분석의 정확도를 올리기 위한 개선책과, 각 단계에 필요한 태스크·준비 작업.
게이트 원칙: **크롭 <30 = 캘리브레이션만 · 100+ = 파이프라인 dry-run · 300+ = 첫 모델 학습 · 500+ = 서브그룹 평가.**

## 현재 상태 (2026-07-03)

- 런타임: ROI 캘리브레이션 휴리스틱 (lib/skin.ts) + 3프레임 버스트 median 융합 + 프레임 합의도
- 선택적 클라우드 보정: Gemini/OpenAI (동의 시)
- 모델 승격 메커니즘: manifest + `NEXT_PUBLIC_VISIBLE_ATTR_MODEL` 플래그 (ONNX 대기)
- 학습 데이터: **0건** — 모든 모델 작업이 데이터 수집에 걸려 있음

## 트랙 1 — 데이터 (지금 시작, 최우선)

성능의 병목은 알고리즘이 아니라 라벨된 데이터다.

- [ ] **30명 파일럿 실행** — `/pilot` 세션으로 라벨+동의 크롭 수집 (`docs/pilot-ml-loop.md` 런북)
  - 준비: 실기기 QA 통과 (`docs/mobile-camera-qa.md`), 참가자 동의 안내문, Supabase env 세팅(`npm run supabase:check`)
- [ ] **라벨 품질 체계**: 사용자 확인(confirmed) vs 수정(corrected) 비율 추적, 버스트 합의도(이미 메타 기록됨)를 라벨 신뢰도 가중치로 사용
- [ ] **촬영 조건 메타 활용**: 품질 메타(밝기·글레어·거리·movement)별 라벨 분포를 확인해 "라벨이 흔들리는 촬영 조건"을 식별 → 게이트 임계값 역보정
- [ ] **동의 클라우드 라벨 활용**: AI 분석 동의 사용자의 Gemini/OpenAI 라벨을 휴리스틱과 자동 비교(무료 준-라벨) — 불일치 케이스를 캘리브레이션 우선 검토 대상으로

## 참고 사례 반영 (2026-07-03 통합됨)

참고: [vinit714/A-Recommendation-system-for-Facial-Skin-Care](https://github.com/vinit714/A-Recommendation-system-for-Facial-Skin-Care-using-Machine-Learning-Models) —
EfficientNet-B0 전이학습(피부타입 80%/여드름 68%), K-means 피부톤, 코사인 유사도 추천, Flask 서버사이드.
**라이선스 미명시 → 코드 미사용, 아이디어만 반영.** 서버사이드 추론·CV벡터 유사도 추천·중증도 등급은 우리 불변식(온디바이스·설문 우선 룰베이스·의료 경계)과 충돌해 채택 안 함.

- [x] **아키텍처 베이크오프 준비**: `train_visible_attributes.py --arch {mobilenetv3_small|efficientnet_b0}` — 300+ 게이트 도달 시 두 모델 참가자 그룹 CV로 비교 후 ONNX 승격
- [x] **K-means 피부톤 기록**: 볼 픽셀 k=3 클러스터 → 지배 톤 CIELAB L*/ITA를 raw feature로 기록(사용자 미표시) — 500+ 게이트의 톤별 서브그룹 평가에 샘플 단위 톤 데이터 확보
- [x] **ROI 픽셀 트리밍**: 패치 내 휘도 상·하위 10% 제거 후 색/질감 통계(글린트·머리카락 그림자 오염 차단, specular 비율은 원본 유지) — feature 버전 `roi-calibrated-2026-07-03`로 구분
- [x] **라벨 관찰 필드**: 피드백에 "트러블 흔적 보임"(관찰만, 등급화 금지) → `meta.observations.troubleSeen`

## 논문·데이터셋 리서치 (2026-07-03)

- **사전학습 부트스트랩**: [SCIN (Google, 10k+ 동의 기반 실사용 피부 이미지, Fitzpatrick/Monk 톤 라벨 포함)](https://github.com/google-research-datasets/scin) — 백본을 피부 도메인에 적응시킨 뒤 우리 크롭으로 파인튜닝하면 300+ 게이트에서 더 적은 데이터로 성능 도달 가능성. **라이선스 확인 완료(2026-07-03): SCIN Data Use Public License — 상업 사용·ML 학습·학습 모델 상업 사용 모두 허용. 조건: 어트리뷰션(라이선스 고지+출처 링크+수정 표시) 유지, 재식별 시도 절대 금지(위반 시 권리 즉시 종료). 데이터는 GCS `dx-scin-public-data` 버킷.**
- **톤 공정성 프로토콜**: [Fitzpatrick17k](https://www.emergentmind.com/topics/fitzpatrick-17k-dataset) 기준 척도 + 우리가 기록 중인 toneIta로 500+ 게이트 서브그룹 평가 구체화. 편차 발견 시 [FairDisCo(disentanglement contrastive)](https://arxiv.org/pdf/2208.10013) 계열 기법 참고.
- **속성 grade 고도화 경로**: [JOCD 2024 (Lee) — U-Net으로 붉은기 등 grade 추정+세그멘테이션 동시 수행](https://onlinelibrary.wiley.com/doi/10.1111/jocd.16218) — 장기적으로 ROI 통계 → 픽셀 세그멘테이션 기반 grade로 업그레이드하는 경로의 근거.
- **트러블 관찰 근거**: [selfie 기반 여드름 중증도 평가 (arXiv:1907.07901)](https://arxiv.org/abs/1907.07901) — 셀피에서 트러블 신호 추정이 성립함을 확인. 우리는 관찰 라벨(troubleSeen)까지만, 등급화는 의료 경계로 금지 유지.
- **수분/TEWL 추정**: [selfie 기반 hydration/TEWL 추정 (arXiv:2509.06282)](https://arxiv.org/pdf/2509.06282) — 기술적으로 가능해지고 있으나 정량 수치 표시는 불변식상 금지. 내부 보조 신호로만 장기 검토.

## 트랙 2 — 캘리브레이션 (크롭 <30에서도 가능)

- [ ] `ml/calibrate.py`로 threshold 보정 — 첫 10~30개 라벨만으로 oil/redness/pores 경계값(0.05/0.16 등) 재조정
- [ ] **조명 정규화**: gray-world 화이트밸런스 보정을 raw feature 추출 전에 적용 (조명 색온도에 따른 relRedness 왜곡 완화) — lib/skin.ts extractRawFeatures 확장
- [ ] **ROI 확장 실험**: 현재 T존+양볼 → 턱/코옆 추가 시 신호 안정성 비교 (SAMPLING_LANDMARKS 이미 노출됨)
- [ ] **버스트 파라미터 튜닝**: 3프레임/140ms가 최적인지 — 5프레임/100ms 대비 노이즈 감소 vs 지연 측정

## 트랙 3 — 모델 (데이터 게이트 준수)

- [ ] 100+ 크롭: `ml/run_pipeline.py` dry-run — 휴리스틱 vs 랜덤포레스트 벤치마크로 "모델이 이길 여지" 정량화
- [ ] 300+ 크롭: MobileNetV3-small 학습 (`ml/train_visible_attributes.py`, 참가자 단위 CV 필수) → ONNX export
- [ ] **ONNX 웹 런타임 연결**: onnxruntime-web 번들 + `classifyVisibleAttributes` 실구현 → manifest `status: "active"` + 플래그 온 (승격 메커니즘 기존재)
- [ ] 500+ 크롭: 디바이스·조명·피부톤·메이크업별 서브그룹 성능 평가 — 편차가 크면 그룹별 threshold/모델 분기

## 트랙 4 — 평가 인프라 (모델 전에 준비)

- [ ] **골든셋**: 조명·각도·디바이스 매트릭스로 찍은 고정 이미지 20~30장 + 합의 라벨 — 코드 변경마다 회귀 측정
- [ ] **재현성 테스트**: 같은 사람·같은 조건 연속 3회 스캔의 레벨 일치율(현재 버스트 합의도가 프록시) — 목표치 정의(예: 90%+)
- [ ] **A/B 스위치**: 휴리스틱 vs 모델 결과를 동시 기록(모델은 섀도 모드) → 사용자 수정률로 실전 비교
- [ ] 라이트한 단위 테스트: extractRawFeatures/median/agreement에 고정 입력 스냅샷 테스트 (현재 테스트 0)

## 우선순위 요약

| 순서 | 작업 | 선행 조건 |
|---|---|---|
| 1 | 실기기 QA → 30명 파일럿 시작 | 없음 (라이브 배포 완료) |
| 2 | 첫 라벨 10~30개로 threshold 캘리브레이션 | 파일럿 데이터 |
| 3 | 조명 정규화 + 골든셋 구축 | 없음 (병행 가능) |
| 4 | 100+ dry-run → 300+ 학습 → ONNX 연결 | 데이터 게이트 |
| 5 | 섀도 A/B → 모델 승격 | 학습된 모델 |
