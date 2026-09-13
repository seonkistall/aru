# ARU 피부 라벨 데이터셋 조사

최종 갱신: 2026-09-13

이 문서는 "논문에 reference로 올라와 있고, ARU의 7개 축이 라벨링된 퍼블릭 이미지
데이터셋"을 찾는 조사의 결과판이다. 기계가 읽는 레지스트리는
[`ml/external_datasets.json`](../ml/external_datasets.json), 라이선스 판정 로직은
[`ml/licensing.py`](../ml/licensing.py)에 있다. 이 문서는 그 판정의 근거와
확인되지 않은 부분을 기록한다.

## 결론 세 줄

1. 7개 축을 한 번에 라벨링한 퍼블릭 데이터셋은 없다. 축별로 쪼개져 있다.
2. 한국인·연령대·스마트폰 촬영을 동시에 만족하는 유일한 후보는 **AI-Hub 028
   한국인 피부상태 측정 데이터(dataSetSn=71645)** 하나뿐이다.
3. 그런데 그 데이터셋에도 **유분·홍조·트러블 라벨은 없다.** ARU가 이미 서비스
   중인 3축 가운데 2축(유분·홍조)은 퍼블릭 데이터로 학습할 수 없다.

## AI-Hub 028 한국인 피부상태 측정 데이터

| 항목 | 내용 | 확인 경로 |
|---|---|---|
| 규모 | 1,099명(14–69세), 얼굴 이미지 13,936장, 측정 기록 84,688건 | 프로젝트 저장소 ReadMe |
| 촬영 | DSLR 7각도(암막실·고정장치) / 태블릿 3각도 / **스마트폰 3각도** | 프로젝트 저장소 ReadMe |
| 영역 | 얼굴 8개 영역 BBox (forehead, glabellus, l_cheek, r_cheek, chin 등) | `tool/img_crop.py`, 파생 metadata.csv |
| 전문의 육안 등급 | dryness(5), pigmentation(6, forehead·cheek), pore(6), sagging(6), wrinkle(7, forehead·glabellus·perocular) | `tool/test.py` 등급 수 정의 |
| 기기 측정값 | moisture, elasticity_R2, wrinkle_Ra, pore, pigmentation | `tool/test.py` regression 정의 |
| 피험자 메타 | age(정수), gender, skin_type(0–5), sensitive(0/1) | 파생 metadata.csv 헤더 |
| 논문 | Skin Research and Technology 32(9) e70375 (2026), CC BY 4.0 | 저장소 배지 |

근거가 된 1차 자료는 두 개의 공개 저장소다.

- `github.com/leejeongho3214/NIA` — 데이터 구축 주체(단국대)의 공식 저장소.
  어노테이션 JSON 키(`info` / `images` / `annotations` / `equipment`), 파일 경로
  규칙 `{equ}/{sub}/{sub}_{equ}_{angle}_{area}.json`, 등급 수를 코드에서 직접 확인했다.
- `github.com/hpicsk/regional-ccm` — MIT 라이선스 파생 연구. 43,424개 region crop의
  메타데이터 CSV를 **AI-Hub 가입 없이 지금 바로** 받을 수 있다. 이미지는 없고
  피험자 속성과 bbox만 있다. 서브그룹 설계와 코호트 분석을 데이터 신청 전에
  미리 끝낼 수 있다는 뜻이다.

이 스키마는 [`ml/adapter_specs/aihub_korean_skin.json`](../ml/adapter_specs/aihub_korean_skin.json)에
그대로 반영되어 있고, spec은 `verified: true`로 표시되어 있다.

### 이 데이터셋에 없는 것 (중요)

| ARU 축 | 상태 |
|---|---|
| 유분 | **없음.** `skin_type`(0–5)은 피험자 단위 유/건성 phenotype이지 이미지 라벨이 아니다. 이걸 이미지 라벨로 쓰면 모델은 "얼굴에서 설문 답변을 맞히는" 학습을 한다 |
| 홍조 | **없음.** erythema 등급 자체가 없다 |
| 트러블 | **없음.** 여드름·병변 등급이 없다 |
| 수분 | 코르네오미터 측정값으로 **존재**하지만 카메라 head로 쓰면 안 된다. 건조 head의 보조 감독 신호로만 |
| 민감 | `sensitive` 플래그는 피험자 단위 자기보고다. 이미지 라벨이 아니다 |

조사 에이전트 한 곳은 이 데이터셋이 유분·민감을 포함한다고 보고했으나, 저장소
코드를 직접 읽어 확인한 결과 **틀렸다.** 위 표가 코드 기준이다.

### 라이선스 — 가장 약한 고리

AI-Hub 이용정책은 영리·비영리 연구개발 목적 사용과, 학습된 모델 등 2차 저작물의
영리적 이용·판매를 허용한다고 알려져 있다. 금지되는 것은 데이터 자체의 재배포다.
다만 **AI-Hub는 개별 데이터셋마다 조건이 다를 수 있다고 명시**하고 있고, 이번
세션의 네트워크에서 aihub.or.kr 접속이 차단되어 **71645 페이지의 이용약관을 직접
읽지 못했다.** 따라서 레지스트리 tier는 보수적으로 `gated_application`이며,
`ml/licensing.py`는 이 상태에서 shipping 학습을 거부한다.

해제 조건: AI-Hub 계정으로 71645 페이지의 이용 조건을 직접 확인하고,
`ml/external_datasets.json`의 `licenseTier`를 근거와 함께 갱신할 것.

## 축별 커버리지 (현재 확정분)

| 축 | 퍼블릭 소스 | 상업 학습 | 실질 판정 |
|---|---|---|---|
| 건조 | AI-Hub 71645 (전문의 5단계) | 미확인 | 신청 통과 시 유일한 현실적 감독 신호 |
| 모공 | AI-Hub 71645 (6단계) | 미확인 | 동일 |
| 색감 | AI-Hub 71645 (색소침착 6단계) | 미확인 | 동일 |
| 주름 | AI-Hub 71645 (7단계, 3부위), FFHQ-Wrinkle | 71645 미확인 / FFHQ-Wrinkle 불가 | 동일 |
| 수분 | AI-Hub 71645 기기 측정 | 미확인 | 카메라 축으로 쓰지 않음 |
| 트러블 | ACNE04, AcneSCU | **불가** (academic / non-commercial) | 연구·감사용만 |
| 홍조 | SkinCon (Fitzpatrick17k·DDI 위) | **불가** (CC BY-NC-SA) | 연구·감사용만 |
| 유분 | 없음 | — | **ARU 자체 수집 외에 방법이 없다** |
| 민감 | 없음 (설문 축) | — | 카메라 축이 아님 |

## 인종·나이대를 다루는 방식

ARU는 인종을 예측하지 않는다. 두 가지 이유다.

1. 카메라 물리에서 실제로 달라지는 변수는 혈통이 아니라 멜라닌 양이다. 홍조는
   주변 피부 대비 red ratio로 읽는데, 그 기준선이 멜라닌에 따라 이동한다.
   "한국인"이라는 라벨은 픽셀이 이미 담고 있는 정보를 더해주지 않지만 ITA는 더해준다.
2. 개인정보보호법상 인종·민족은 민감정보다. 스캔마다 동의 수준이 올라간다.
   ITA는 이미 분석 동의를 받은 이미지에서 파생한 측정값이다.

그래서 계층화 축은 **측정된 tone band × 자기보고 age band**다. 두 축을 각각,
그리고 교차 셀로 평가한다. 표본이 모자란 셀은 평균에 섞이지 않고 `UNEVALUATED`로
보고된다. 상세 구현은 [`ml/subgroups.py`](../ml/subgroups.py)와
[`docs/ml-camera-upgrade-plan.md`](ml-camera-upgrade-plan.md)를 참고한다.

한계: AI-Hub 71645는 **전원 한국인**이라 tone band 분포가 좁다. 어두운 피부
구간의 성능은 이 데이터로 보증할 수 없고, 그 사실이 학습 리포트의 경고로 자동
출력된다. 다국어 서비스인 ARU가 그 구간을 주장하려면 SCIN·DDI 같은 감사 전용
데이터로 별도 stress test를 하거나, 자체 수집에서 커버리지를 만들어야 한다.

## 아직 확인 중

조사 워크플로우의 10개 탐색 축 가운데 2개(한국·유분/모공)만 완료된 시점의 문서다.
홍조·민감, 건조·수분, 트러블, 색감, 다속성, 방법론, 인구통계, 상업 라이선스
축은 진행 중이며, 완료 시 이 문서와 레지스트리를 갱신한다.

네트워크 제약도 기록해 둔다. 이번 세션의 프록시가 aihub.or.kr, arxiv.org, doi.org,
pubmed, koreascience를 차단했다. 확인된 내용은 대부분 raw.githubusercontent.com과
검색 결과 본문에서 나온 것이고, **라이선스와 접근 절차는 차단되지 않은 망에서
다시 확인해야 한다.**
