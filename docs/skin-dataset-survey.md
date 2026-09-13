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
   한국인 피부상태 측정 데이터(dataSetSn=71645)** 하나뿐이고, 여기서 ARU 축으로
   쓸 수 있는 것은 **모공·주름·색소침착 3개뿐**이다.
3. **유분·홍조·건조·트러블은 어떤 퍼블릭 데이터로도 학습할 수 없다.** ARU가 이미
   서비스 중인 3축 중 2축(유분·홍조)이 여기 포함된다. 자체 수집 외에 경로가 없다.

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
- `github.com/hpicsk/regional-ccm` — 파생 연구 저장소. 43,424개 region crop의
  메타데이터 CSV가 공개되어 있어 **스키마와 코호트 분포를 신청 전에 파악**할 수 있다.
  다만 **데이터 소스로 쓸 수는 없다**: repo 루트에 LICENSE 파일이 없고
  (pyproject의 MIT 선언은 코드에 대한 것이다), 표 자체에는 라이선스 부여가 없으며,
  AI-Hub 이용 조건이 걸린 데이터에서 파생된 것이다. 상업적 경로는 AI-Hub 71645를
  직접 신청하는 것뿐이다. 이 저장소는 **스키마 참고용**으로만 쓴다.

이 스키마는 [`ml/adapter_specs/aihub_korean_skin.json`](../ml/adapter_specs/aihub_korean_skin.json)에
그대로 반영되어 있고, spec은 `verified: true`로 표시되어 있다.

### 이 데이터셋에서 ARU가 실제로 쓸 수 있는 것

전문의 육안 등급 5종은 README의 평가 항목 목록
(**색소침착, 입술건조도, 모공, 턱선처짐, 주름**)이 `tool/test.py`의 class head 5개
(`pigmentation, dryness, pore, sagging, wrinkle`)와 순서대로 대응한다. 이 대응이
아래 판정의 근거다.

| 라벨 | ARU 축 | 판정 |
|---|---|---|
| 모공 pore (6등급) | 모공 | **사용 가능** |
| 주름 wrinkle (7등급, 3부위) | 주름 | **사용 가능** |
| 색소침착 pigmentation (6등급, 2부위) | 색소침착 | **사용 가능** (색감 아님, 아래 참고) |
| 입술건조도 dryness (5등급) | — | **사용 불가.** 이건 얼굴 건조가 아니라 **입술** 건조도다. ARU는 볼·T존 각질을 본다. 다른 부위의 다른 개념 |
| 턱선처짐 sagging (6등급) | — | 대응하는 ARU 축 없음 |
| 유분 | — | **라벨 자체가 없다.** Sebumeter 측정값도, 부위별 유분 등급도 없다. `skin_type`(0–5)은 피험자 단위 유/건성 phenotype이라 이미지 라벨로 쓰면 "얼굴에서 설문 답변 맞히기"를 학습한다 |
| 홍조 | — | erythema 등급 없음 |
| 트러블 | — | 여드름·병변 등급 없음 |
| 수분 | — | 코르네오미터 측정값은 있으나 카메라 head로 쓰지 않는다. 논문도 이미지↔수분 상관은 moderate 수준으로 보고한다 |
| 민감 | — | `sensitive`는 피험자 단위 자기보고 플래그 |

**색소침착 ≠ 색감.** ARU의 `tone` 축은 부위 간 균일도이고, 색소침착은 국소 반점
등급이다. 톤이 균일해도 반점이 있을 수 있고 그 반대도 가능하다. 두 축을 하나로
합쳐두면 외부의 반점 등급이 균일도 head에 그대로 매핑되어 잘못된 개념을 학습한다.
그래서 `ml/aru_axes.py`에서 `pigmentation` 축을 분리했다. **색감(균일도)을
등급화한 퍼블릭 데이터셋은 지금까지 하나도 찾지 못했다.**

조사 에이전트 한 곳은 이 데이터셋이 유분·민감·건조·색감을 포함한다고 보고했으나,
저장소 코드와 README를 직접 읽어 확인한 결과 **모두 틀렸다.** 위 표가 1차 자료 기준이다.

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
| 모공 | AI-Hub 71645 (6등급) | 약관 미확인 | 신청 통과 시 유일한 감독 신호 |
| 주름 | AI-Hub 71645 (7등급, 3부위) | 약관 미확인 | 동일. FFHQ-Wrinkle은 비상업 |
| 색소침착 | AI-Hub 71645 (6등급, 2부위) | 약관 미확인 | 동일 |
| 색감(균일도) | **없음** | — | 등급화한 데이터셋을 찾지 못함 |
| 건조 | **없음** | — | 71645의 dryness는 입술건조도. 자체 수집 필요 |
| 유분 | **없음** | — | 자체 수집 외 방법 없음 |
| 홍조 | **없음** | — | SkinCon의 Erythema는 질환 병변 이진 표시지 화장품 홍조 등급이 아니다 |
| 트러블 | ACNE04, AcneSCU | **불가** (academic / non-commercial) | 연구·감사용만 |
| 수분 | AI-Hub 71645 기기 측정 | 약관 미확인 | 카메라 축으로 쓰지 않음 |
| 민감 | **없음** | — | 카메라 축이 아님 (설문) |

### 검증에서 탈락한 것

적대적 검증 단계에서 다음은 ARU에 **사용 불가**로 판정됐다. 대부분은 라이선스와
구성 개념 양쪽에서 동시에 탈락한다.

| 후보 | 탈락 사유 |
|---|---|
| SkinCon | Erythema·Xerosis는 질환 병변의 이진 표시. 게다가 Xerosis 양성이 35건뿐. 라이선스는 3중으로 막힘 |
| Fitzpatrick17k | 114개 라벨이 전부 질환 진단명. 홍조 severity 없음. melasma는 아예 없음. CC BY-NC-SA 3.0 |
| DDI / DDI-2 | Stanford Research Use Agreement가 비상업 + 2차 저작물 금지. `skin_tone`은 환자 phototype 계층화 변수지 색감 라벨이 아님 |
| Derm1M | CC BY-NC 4.0. 개념 어휘 49개에 pore·wrinkle·sebum·moisture 전부 없음 |
| ISGD | 33개 속성 중 29개가 헤어·그루밍. `oily_skin`은 이진 판단이고 전체 속성 중 AUC 최저. 라이선스 미선언 |
| PorePatch | 라벨이 0건. 키포인트 매칭 벤치마크지 모공 등급 데이터가 아님 |
| AI-Hub 71886 (스킨케어 성분-효능) | 운영기관 기준 비영리 R&D 한정. ARU 축 지원 0 |
| AI-Hub 71863 (합성 피부질환) | 합성 이미지 + 임상 데이터 트랙 |
| K-FACE | 피부 라벨 없음. 식별 가능한 생체정보라 별도 법적 검토 필요 |
| SkinCAP | CC BY-NC-SA 4.0 + 연구용 사용 동의. 나이·성별 컬럼 자체가 없음 |
| Synth-RFF-300 | NVIDIA StyleGAN2-ADA 라이선스가 비상업 한정. 합성 얼굴이라 피험자 속성이 존재할 수 없음 |
| Augsburg / Phayao / SkinQurator | **데이터셋이 아니다.** 논문·공모전 페이지이고 배포되는 데이터가 없다 |

**SCIN은 결이 다르다.** 라이선스 전문(147줄)을 읽은 결과 NonCommercial 조항이 없어
저작권 측면에서는 상업 학습을 막지 않고, GCS에서 등록 없이 받을 수 있다. 문제는
라이선스가 아니라 **라벨이다**: 스키마 전체에 severity 척도가 하나도 없다. 질환
유무 표시뿐이고, `age_group`이 있는 행 중 절반 이상이 `AGE_UNKNOWN`이다. 그래서
레지스트리 tier는 `contract_required`로 두고 용도는 **톤 커버리지·공정성 감사
참고용**으로 제한한다.

반복되는 함정 하나를 기록해 둔다. 피부과 데이터셋의 `erythema`, `xerosis`,
`comedo` 같은 개념은 **질환 피부의 병변 유무 표시**다. 건강한 피부의 화장품 등급이
아니다. 이름이 같다고 ARU 축에 매핑하면 안 된다.

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

탐색 10개 축은 모두 완료됐고, 후보별 적대적 검증 19건 중 17건이 끝난 시점의
문서다. 남은 검증(SCIN 등)이 끝나면 갱신한다.

네트워크 제약도 기록해 둔다. 이번 세션의 프록시가 aihub.or.kr, arxiv.org, doi.org,
pubmed, koreascience를 차단했다. 확인된 내용은 대부분 raw.githubusercontent.com과
검색 결과 본문에서 나온 것이고, **라이선스와 접근 절차는 차단되지 않은 망에서
다시 확인해야 한다.**
