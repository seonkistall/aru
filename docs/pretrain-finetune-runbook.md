# 사전학습 → 미세조정 실행 런북

최종 갱신: 2026-09-14

퍼블릭 데이터로 사전학습하고 ARU 자체 크롭으로 미세조정하는 경로의 실행 절차다.
파이프라인은 완성되어 있고 합성 데이터로 4단계 전부 검증했다. **막혀 있는 것은
코드가 아니라 데이터 접근이다.**

## 시작 전에 반드시 알아야 할 것

**가중치는 2차 저작물이다.** 비상업 데이터로 사전학습한 가중치는 그 위에 아무리
깨끗한 자체 데이터를 미세조정해도 **출시할 수 없다.** 이건 의견이 아니라 CC BY-NC와
academic-use 조항의 문언이다.

`ml/licensing.py`가 이걸 기계적으로 강제한다. 체크포인트는 자기가 거쳐온 모든
출처를 `lineage`에 기록하고, `--init-from`으로 이어받으면 그 계보가 현재 목적에
대해 다시 검사된다. 실제 동작:

```
$ python ml/train_visible_attributes.py --data ml/data/crops \
    --init-from ml/artifacts/stageA/visible_attr_mobilenetv3_small.pt \
    --purpose product_training

Refusing to train for purpose='product_training'. Blocked:
  - acne04 (inherited from --init-from weights) [academic_only]: tier 'academic_only'
    permits only research_pretrain, eval_audit, camera_qa. Shipping weights count as
    commercial use.
Re-run with --purpose research_pretrain for a non-shipping experiment, drop those rows,
or start from weights without that lineage.
```

자체 데이터는 100% 깨끗했는데도 막혔다. 그게 맞다. 위 실행은 ACNE04가 섞인
사전학습에서 이어받았기 때문이고, **AI-Hub는 `commercial_ok`라 더 이상 막지 않는다.**

AI-Hub 단독으로 사전학습하면 같은 미세조정이 통과한다 (2026-09-14 합성 데이터로 실행 확인):

```
$ python ml/train_visible_attributes.py \
    --manifest .../ship/aihub_korean_skin/manifest.csv \
    --purpose shipping_pretrain --axes pores wrinkles pigmentation
...
$ python ml/train_visible_attributes.py --data .../crops \
    --init-from .../stageShip/visible_attr_mobilenetv3_small.pt \
    --purpose product_training

init-from ...: loaded 242 tensors, skipped 4 shape-mismatched, 4 left at init
epoch=01 ...
promotion gate: BLOCKED
  - [oil] no labelled validation samples, so ordinal quality is unverified ...
  - [tone] no cell reached n>=20. Tone is measured on every scan, so ...
  - [age] no cell reached n>=20. Age is only collected in consented pilot ...
  - [tone_x_age] no cell reached n>=20. The joint cell needs both ...
```

> 위 블록은 실제 실행 출력이 아니라 형태를 보여주는 예시다 (torch 필요). 문구는
> `ml/subgroups.py`의 `promotion_check` / `_UNEVALUATED_NOTE`가 원본이다.
> 2026-09-15부터 **평가 불가 차원은 예외 없이 차단**한다. 이전에는 `tone`과 `age`만
> 이름으로 걸려 있어서, 매니페스트가 선언한 `tone_x_age`는 평가되지 않아도 아무
> 블로커를 남기지 않고 통과했다.
> 같은 날 축별 `qwk`/`pearson` floor가 추가됐다. ordinal 블로커가 **앞에** 붙으므로
> 실제 출력의 첫 줄은 대개 차원이 아니라 축이다 — 지금처럼 동의된 crop이 0이면 모든
> 축이 `n == 0`이라 위 첫 줄이 먼저 나온다.

라이선스는 통과하고 **승급 게이트에서 막힌다.** 그게 정확히 맞는 상태다 — 합성
데이터에는 서브그룹이 없으니까. 실데이터가 쌓이면 이 세 줄이 해제 조건이다.

체크포인트에 기록된 계보:

```json
[{"purpose": "shipping_pretrain", "sources": ["aihub_korean_skin"],
  "axes": ["pores", "wrinkles", "pigmentation"]},
 {"purpose": "product_training", "sources": ["aru_opt_in_camera_panel"],
  "axes": ["oil", "redness", "pores"]}]
```

## 1단계: 데이터 확보 (오너만 가능)

### AI-Hub 028 한국인 피부상태 측정 데이터 (dataSetSn=71645)

1. aihub.or.kr 회원가입 (국내 신청자 한정)
2. ~~`dataSetSn=71645` 페이지 → 이용약관 탭을 먼저 읽는다~~ — **완료 (2026-09-14)**
3. 데이터 활용 신청 (신청자 신분·소속·목적) ← **여기가 현재 위치**
4. 승인 후 전체 다운로드 / AI-Hub Shell / Open API

**2단계 결과**: 소유자가 약관을 확인해 **상업 학습 허용**으로 보고했고,
`ml/external_datasets.json`의 `aihub_korean_skin.licenseTier`는 `commercial_ok`다.
모공·주름·색소침착 사전학습 가중치를 **출시 모델에 쓸 수 있다.**

두 가지를 계속 기억할 것:

- 이 tier는 **소유자 확인 기록**이지 저장소가 보관한 약관 원문이 아니다
  (`licenseEvidence` 필드에 그렇게 적혀 있고, 게이트 출력에도 나온다).
- **신청 승인서에 별도 조건이 붙을 수 있다.** 승인되면 그 조건을 읽고 필요하면
  tier를 내린다. 내리는 순간 그 데이터로 학습한 가중치도 함께 막힌다(lineage).

| 약관 결과 | tier | 결과 |
|---|---|---|
| **상업적 R&D와 학습 모델의 영리 이용 허용 ← 확인된 값** | `commercial_ok` | 모공·주름·색소침착 사전학습 가중치를 **출시 가능** |
| 비영리 한정 | `non_commercial` | 연구용 사전학습만. 출시 모델은 자체 데이터 단독 |
| 별도 협의 필요 | `contract_required` | 계약 후 `ml/private_sources.json`에 기재 |

### 그 외 퍼블릭 데이터셋

조사 결과([docs/skin-dataset-survey.md](skin-dataset-survey.md)) 전부 비상업이다.
**연구용 사전학습에는 쓸 수 있고, 출시 가중치에는 쓸 수 없다.**

| 데이터셋 | ARU 축 | tier |
|---|---|---|
| ACNE04 | 트러블 | academic_only |
| AcneSCU | 트러블 | non_commercial |
| FFHQ-Wrinkle | 주름 | non_commercial |
| SkinCon | (홍조는 질환 병변 표시라 부적합) | non_commercial |

## 2단계: 매니페스트 생성

데이터셋마다 한 번씩. 이미지는 **절대 커밋하지 않는다.**

```bash
python ml/external_manifest.py \
  --source aihub_korean_skin \
  --root /local/path/028.한국인_피부상태_측정_데이터 \
  --purpose research_pretrain \
  --compute-ita \
  --out ml/data/external
```

`--compute-ita`는 이미지에서 ITA를 직접 측정한다. AI-Hub에는 피부톤 필드가 없어서
이게 없으면 전 행이 tone 미상이 되고 서브그룹 평가가 불가능해진다.

출력 `provenance.json`에는 라이선스 판정, 축별 라벨 수, 서브그룹 커버리지 경고가
들어간다. **경고를 읽어라.** 어두운 피부 구간이 0이면 그 구간 성능은 보증할 수 없다.

## 3단계: 사전학습 (여러 데이터셋 동시)

매니페스트를 여러 개 넘기면 합쳐서 학습한다. 데이터셋이 라벨링하지 않은 축은
행 단위로 마스킹되므로, 트러블만 있는 ACNE04와 모공·주름·색소침착이 있는 AI-Hub를
한 번에 쓸 수 있다. 이미지 루트는 각 매니페스트의 `provenance.json`에서 읽는다.

```bash
python ml/train_visible_attributes.py \
  --data ml/data/external \
  --manifest ml/data/external/aihub_korean_skin/manifest.csv \
             ml/data/external/acne04/manifest.csv \
  --axes pores wrinkles pigmentation trouble \
  --aux-heads tone_band age_band \
  --purpose research_pretrain \
  --epochs 30 --export-onnx \
  --out-dir ml/artifacts/stageA
```

`--purpose`는 정직하게 쓴다. AI-Hub는 `commercial_ok`가 되어 `shipping_pretrain`이
가능하지만, **ACNE04·AcneSCU·FFHQ-Wrinkle을 섞는 순간 lineage가 막힌다.** 출시용
사전학습은 AI-Hub 단독으로 돌리고, 연구 비교용 실행만 `research_pretrain`으로 섞는다.

## 4단계: 자체 데이터로 미세조정

```bash
python ml/run_pipeline.py --labels gyeol-labels-500.jsonl \
  --crops gyeol-crop-samples-320.jsonl --decode-crops --name pilot-001

python ml/train_visible_attributes.py \
  --data ml/experiments/<timestamp>-pilot-001/dataset \
  --init-from ml/artifacts/stageA/visible_attr_mobilenetv3_small.pt \
  --axes oil redness pores \
  --purpose product_training \
  --epochs 20 --export-onnx \
  --out-dir ml/artifacts/stageB
```

몸통(trunk)만 전이된다. 단계별로 축이 다르면 head는 shape이 달라 자동으로
버려지고 새로 초기화된다 — 실측: 242개 텐서 전이, head 6개 건너뜀. 다른 축의
분류기를 억지로 재사용하면 조용한 쓰레기가 된다.

## 5단계: 승급 판정

`metrics.json`에서 네 가지를 본다.

1. **`promotion_gate.promotable`** — 두 규칙을 **모두** 통과해야 true다.
   (a) 톤/나이/교차 셀 최악 그룹이 평균 대비 `maxAccuracyGap` 안에 드는지. 표본
   부족 셀은 통과가 아니라 **차단**이다. (b) 축별 `qwk`/`pearson`이 `minQwk` /
   `minPearson` 이상인지.
2. **축별 `qwk`와 `pearson`** — **2026-09-15부터 게이트가 자동으로 막는다.**
   수동 판단 항목이 아니다. 치우친 등급 분포에서 다수 등급만 찍는 모델이 정확도
   0.80과 `within_one_grade` 0.95를 받고 QWK는 0이 된다. 그런 모델은 모든 셀에서
   똑같이 틀리므로 서브그룹 격차도 거의 없어서, (a)만으로는 **아무것도 학습하지
   못한 모델이 가장 쉽게 통과**했다. 그래서 (b)가 있다.

   판정하는 사람이 알아야 할 것: **현재 floor는 0.4이고 잠정값이다.** ARU 데이터로
   측정한 값이 아니라 degeneracy 방어선이고, 품질 기준이 아니다. 실제로 필요한
   기준은 "같은 validation split에서 현행 휴리스틱을 이긴다"인데 파이프라인이 아직
   휴리스틱 베이스라인을 기록하지 않는다. **0.4를 넘겼다는 사실만으로 승급을
   정당화하지 말 것.**

   게이트는 fail-closed다. 축이 `overall`에 없거나, 검증 표본이 0이거나,
   `accuracy`/`qwk`/`pearson`이 없거나 NaN/inf면 통과가 아니라 차단이다.
3. **`heuristic_baseline` — 현행 휴리스틱을 이겼는지.** `lib/skin.ts`의 임계값 규칙을
   **같은 검증 행**에 **같은 confusion 코드**로 채점한 결과다. 축별로 모델 `qwk`가
   휴리스틱 `qwk`를 `minQwkGainOverHeuristic`(현재 0.0, 즉 **엄격히 초과**)만큼
   넘어야 한다. 비기면 통과가 아니다.

   이게 승급 판정의 핵심 질문이다. 나머지 규칙은 "모델이 절대적으로 괜찮은가"를
   묻지만, 게이트가 존재하는 이유는 "**지금 출시 중인 규칙을 대체해야 하는가**"다.
   서브그룹 격차도 통과하고 qwk floor도 통과하면서 TypeScript 파일의 숫자 3쌍보다
   나쁠 수 있고, 그걸 승급시키면 리포트의 모든 수치가 멀쩡해 보이는 채로 제품이
   나빠진다.

   `scoredRows`를 반드시 같이 볼 것. 휴리스틱이 **채점되지 않았으면 차단**이다 —
   "휴리스틱을 재본 적이 없다"와 "모델이 이겼다"가 같게 보이면 안 된다. 외부
   데이터 pretrain은 ARU의 ROI feature가 없으므로 여기서 막히는 게 정상이다.

   **두 qwk는 같은 행에서 나와야 한다.** 모델은 라벨이 있는 모든 검증 행에서
   채점되지만, 휴리스틱은 라벨과 ROI feature를 **둘 다** 가진 행에서만 채점된다.
   한 행이라도 라벨만 있고 feature가 없으면 두 숫자는 서로 다른 행 집합을 설명하는
   것이고, 그 차이는 모델 덕분이라고 말할 수 없다. 그래서 `scoredRows != n`이면
   차단한다. `skippedNoFeature`가 몇 개인지 알려주고, 고칠 곳은 게이트가 아니라
   export다.
4. **`lineage`** — 출시하려는 가중치가 거쳐온 모든 출처. 여기 비상업이 하나라도
   있으면 그 모델은 출시 불가다.

기준값은 `public/models/visible-attributes/manifest.json`이 단일 소스이고
`ml/model_contract.py`가 읽는다. 학습기에 하드코딩된 값은 없다.

## 현재 막혀 있는 지점

| 단계 | 상태 |
|---|---|
| 1. 데이터 확보 | **막힘.** AI-Hub 신청·승인은 오너 계정 필요 |
| 2. 매니페스트 | 코드 완성, 합성 데이터로 검증 |
| 3. 사전학습 | 코드 완성, 외부 2종 동시 학습 검증 |
| 4. 미세조정 | 코드 완성, 계보 전파·head 재초기화 검증 |
| 5. 승급 판정 | 코드 완성. **자체 크롭 0장이라 4단계 입력이 없음** |

3·4단계가 실제로 의미 있는 숫자를 내려면 **파일럿(B2)으로 크롭 300장**이 필요하다.
사전학습이 그 요구량을 줄여주지만 0으로 만들지는 못한다. 그리고 유분·홍조는
AI-Hub에도 라벨이 없어서 **사전학습으로 얻을 것이 없다** — 자체 데이터가 유일한 경로다.
