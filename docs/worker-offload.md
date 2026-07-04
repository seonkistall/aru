# Web Worker 추론 오프로드 (라이브 게이트)

라이브 촬영 게이트의 FaceLandmarker 추론을 Web Worker로 옮겨 메인 스레드를 비우는 최적화. **기본 OFF로 배포(ship dark)** — 실기기 검증 후 기본값을 켠다.

## 무엇을 하나

- `app/scan/landmarker.worker.ts` — 워커에서 FaceLandmarker(**CPU 델리게이트**) 생성 후, 전송받은 `ImageBitmap`으로 `detectForVideo` 실행 → 랜드마크 반환.
- `app/scan/landmarker-client.ts` — 메인 스레드 클라이언트. 워커를 못 만들면 `null` 반환(자동 폴백).
- `app/scan/page.tsx` — `?worker=1`일 때만 워커를 띄우고, `measureQuality`(라이브 게이트)에서만 사용. **`capture()`(실제 버스트 캡처)는 항상 메인 스레드** — 신뢰 경로 불변.

## 왜 CPU 델리게이트인가

일부 모바일 GPU 델리게이트는 손상된 비정규 랜드마크(~1e34)를 뱉는다(삼성에서 관측, 메인 스레드는 `forceCpuRef` 자가치유로 대응). CPU 델리게이트는 느리지만 항상 정확 → 워커 경로는 자가치유가 필요 없다. 대신 메인 스레드에서 벗어나 프레임 페인팅·카운트다운이 매끄러워지는 것이 목적.

## 안전장치 (프로덕션 위험 0)

- 플래그 없으면(`기본`) 워커를 만들지 않음 → 오늘과 100% 동일한 메인 스레드 경로.
- `?worker=1`이어도: 워커 생성 실패(`createImageBitmap`/`Worker` 미지원) → `null` → 메인 스레드.
- 프레임별로 워커 `detect`가 throw하면 그 프레임은 메인 스레드 추론으로 폴백.
- 워커는 언마운트 시 `terminate()`.

## 실기기 검증 체크리스트 (기본값 켜기 전)

1. `/scan?worker=1&debug=1`로 진입 → 디버그 오버레이가 정상 갱신되는지(랜드마크 인식·거리·밝기).
2. iOS Safari + Android Chrome(특히 삼성) 각각에서:
   - 얼굴 인식/게이트 통과가 메인 스레드 경로(`/scan?debug=1`)와 동등한지.
   - 손상 랜드마크로 인한 프리즈/오탐이 없는지(CPU 델리게이트라 없어야 정상).
   - 자동 캡처가 되는지, 결과 리포트가 나오는지.
3. 저사양 기기에서 라이브 프리뷰·3-2-1 카운트다운이 메인 스레드 대비 더 매끄러운지(오프로드 효과) 체감 확인.
4. WASM/모델 CDN 로드가 워커 컨텍스트에서도 되는지(오프라인/차단 시 폴백 동작).

## 기본값 켜는 법

검증 통과 후 `app/scan/page.tsx`의 `useWorkerRef.current = params.get("worker") === "1";`를 기본 on으로 바꾸거나(예: 특정 기기군만), 환경 변수 게이트로 승격. 데이터 병목이 우선(참고: `docs/analysis-performance-roadmap.md`)이므로 파일럿 이후 착수 권장.
