# Pooling feature generations: what a run now reports, and why it warns rather than blocks

Cycle 26, 2026-09-21.

## 1. The defect this closes

The backlog item, opened 2026-09-16, read:

> The "do not pool feature generations" rule is documentation and nothing else.
> `fallbackVersion` moved to `roi-calibrated-2026-09-16` and the string is carried per row
> (`ml/prepare_crop_dataset.py`, `ml/run_pipeline.py`), but no ML script filters, groups or
> warns on it, and `ml/calibrate.py` has no version handling at all. So a pre-09-16 and a
> post-09-16 tone reading still land in the same subgroup cell and the same threshold fit.
> Cheapest useful version: a `coverage_warnings` entry when one run mixes generations.

Re-checked against the tree at `ab23796` rather than taken on trust, and every clause of it
still held. `model_version` and `input_schema_version` are **written** at
`ml/prepare_crop_dataset.py:117-118` and `ml/run_pipeline.py:338-339`, and listed in the CSV
header at `ml/run_pipeline.py:277-278` (line numbers as on main, `ab23796`). Grepping the whole of `ml/` for either name returns
those five write sites and **nothing that reads them back**. `ml/calibrate.py` has no version
handling at all.

The item's own dates are the argument for it: `fallbackVersion` in `lib/skin.ts` is
`roi-calibrated-2026-09-18` today, having been `roi-calibrated-2026-09-16` when the item was
filed. It moves when a feature's semantics change. Rows captured either side of that move
carry different numbers for the same name.

One thing the item did not say, found while fixing it and worth more than the fix: even with
the counting in place the warning would never have fired on a real run. `run_pipeline.py`
builds a **narrow projection** of each row (`decoded.append({`, `ml/run_pipeline.py:363` on
main and on this branch) and passes *that* to
`subgroups.coverage()`, not the CSV row. The projection carried `participant_id`,
`session_id`, `device_id`, `toneIta`, `age_band` and `id` — neither version field. So the
generation of every row was invisible at exactly the place the check has to run.
`ml/selftest.py::FeatureGenerations::test_the_pipeline_projection_carries_the_fields_coverage_reads`
pins the projection on source for that reason: every other assertion in the file passes with
the projection unchanged.

## 2. The question the fix needed answered: warn, or block?

Not a taste question. `coverage_warnings` output is read by a human and gates nothing;
`promotion_check` has `blockers` that stop a promotion. Putting a mixed-generation run in the
second list would be a new promotion rule, which is hard guardrail 8 — the owner's call, not
a cycle's. Putting it in the first is a smaller claim and had to be justified rather than
assumed.

### What an established pipeline does with the same problem

scikit-learn draws a line between two kinds of mismatch, and it draws it explicitly. Read from
its own source — another project's implementation, not a paper and not a standard; the sources
that would be primary for this (`scikit-learn.org`, `en.wikipedia.org`) refuse this network,
and `raw.githubusercontent.com` is what answers.

```
--- https://raw.githubusercontent.com/scikit-learn/scikit-learn/1.5.2/sklearn/exceptions.py
    http=200 bytes=6058   sha256 635e992922c815c6b95cf11d84bd0f06d5bd1d58e4adeb335e2864d17ae61618
--- https://raw.githubusercontent.com/scikit-learn/scikit-learn/1.7.1/sklearn/exceptions.py
    http=200 bytes=7703   sha256 09a6854b80d56ea86a52276203e70cbd33fa0d1eaa205984533ba2312e470de7
--- https://raw.githubusercontent.com/scikit-learn/scikit-learn/1.5.2/sklearn/base.py
    http=200 bytes=53095  sha256 cd62bc6b3f5a6f16466c7eaa0ec91a83a83c91b93610d67e39c55fda85530c89
--- https://raw.githubusercontent.com/scikit-learn/scikit-learn/1.7.1/sklearn/base.py
    http=200 bytes=47777  sha256 a2ad39c5ff6491d04c35738e942860def0e80d6800aeb1690cfd68bf46be8d91
--- https://raw.githubusercontent.com/scikit-learn/scikit-learn/1.7.1/sklearn/utils/validation.py
    http=200 bytes=108488 sha256 ae3c972e645e2d0ba00459e8f82ac540f0a670f474cc293875a95f4d63f0ccc2
```

**A provenance mismatch warns and continues.** `BaseEstimator.__setstate__`, at
`sklearn/base.py:372-382` in v1.5.2 and `:438-448` in v1.7.1 — the same nine lines in both:

```python
def __setstate__(self, state):
    if type(self).__module__.startswith("sklearn."):
        pickle_version = state.pop("_sklearn_version", "pre-0.18")
        if pickle_version != __version__:
            warnings.warn(
                InconsistentVersionWarning(
                    estimator_name=self.__class__.__name__,
                    current_sklearn_version=__version__,
                    original_sklearn_version=pickle_version,
                ),
            )
```

`warnings.warn`, not `raise`. `InconsistentVersionWarning` subclasses `UserWarning`
(`sklearn/exceptions.py:160`) and its message says why the work is allowed to continue:

> "Trying to unpickle estimator {name} from version {original} when using version {current}.
> This might lead to breaking code or invalid results. Use at your own risk."

**A structural mismatch raises.** `_check_feature_names`, `sklearn/utils/validation.py:2697`,
ends its comparison branch with `raise ValueError(message)` when the fitted and supplied
feature names differ in membership or order — and the message enumerates the unseen and the
missing names. Two neighbouring branches, where names are present on only one side, take
`warnings.warn` and `return` instead.

**An unstamped artifact is given a name of its own, not merged into the current one.** The
`state.pop("_sklearn_version", "pre-0.18")` default is a sentinel: an estimator that carries
no version is read as a *different* version and warns, rather than being read as matching.

### Applied to ARU

Pooling two extractor generations is sklearn's first kind. Every index in every row is
present, finite and well-formed; what differs is what the numbers *mean*, and nothing in the
data records how far apart two generations are. That is unknowable from the rows, so it is
reported and left to the reader. It is not sklearn's second kind: nothing here is checkably
wrong the way a renamed column is.

The sentinel is why unstamped rows became `UNSTAMPED` rather than being folded in with the
stamped ones. A row with no version could have come from any generation, so pooling it is the
same comparison made blind; it gets its own line in the report. External-dataset rows never
carry these fields, so a run made entirely of them reports one generation and warns about
nothing, which is correct — there is no mixing to report.

**The published promotion rule is untouched.** `coverage_warnings` has never been a gate,
`promotionGate` and `status` in `public/models/visible-attributes/manifest.json` are
byte-identical to main, and `minQwkGainOverHeuristic` is still 0.0.

## 3. What changed

| File | Change |
|---|---|
| `ml/subgroups.py` | `FEATURE_GENERATION_KEYS`, `UNSTAMPED`, `feature_generation(row)`; `Coverage.generations`; counted in `coverage()`; exposed as `featureGenerations` in `as_dict()`; two clauses in `coverage_warnings()` |
| `ml/run_pipeline.py` | the `decoded` projection carries `model_version` and `input_schema_version` |
| `ml/selftest.py` | `FeatureGenerations`, 9 cases |

Every run that already wrote `subgroup_warnings` now gets these for free:
`ml/run_pipeline.py:384`, `ml/train_visible_attributes.py:532,546,918`,
`ml/evaluate_dataset.py:71`, `ml/external_manifest.py:431` (as on this branch).

`feature_generation` reads snake_case and camelCase spellings of both fields, because
`prepare_crop_dataset` writes snake_case rows and a manifest row read straight from the app
writes camelCase; the same generation under two spellings must not split into two.

Nothing about a person was added to anything. The two fields are version strings, and the
projection they were added to already carried `participant_id`, `session_id` and `device_id`.

## 4. The guard, broken at its source lines

Five breaks, each of the code the tests claim to protect, never of a test. `ml/subgroups.py`
and `ml/run_pipeline.py` were restored byte-identical after each one (`ml/subgroups.py`
sha256 `270cc66838e7e9bb5d1f57bcdfe5df710179010dbe235bf041ee81a1e2f9b076` before and after).
Baseline is `Ran 130 tests ... OK`.

| # | Break, at its source line | Result |
|---|---|---|
| 1 | `if len(stamped) > 1:` → `> 2` | `FAILED (failures=2)` — `test_two_generations_in_one_run_are_named_and_counted`, `test_a_schema_change_alone_is_a_different_generation`; `AssertionError: 0 != 1` |
| 2 | drop `("input_schema_version", "inputSchemaVersion")` from `FEATURE_GENERATION_KEYS` | `FAILED (failures=1)` — `test_a_schema_change_alone_is_a_different_generation`; `AssertionError: 0 != 1` |
| 3 | `stamped = {... if name != UNSTAMPED}` → `stamped = dict(cov.generations)` | `FAILED (failures=2)` — `test_external_rows_that_carry_no_version_at_all_warn_about_nothing` (`Lists differ: ['3 rows (100%) carry no feature generatio[112 chars]nd.'] != []`) and `test_unstamped_rows_beside_stamped_ones_are_reported_separately` (`2 != 1`) |
| 4 | remove both version fields from `run_pipeline.py`'s `decoded` projection | `FAILED (failures=1)` — `AssertionError: 'model_version' not found in 'decoded.append({...' : run_pipeline's coverage projection dropped model_version` |
| 5 | `("model_version", "modelVersion")` → `("model_version",)` | `FAILED (failures=1)` — `AssertionError: 'roi-calibrated-2026-09-18/2026-06-30.visible-face-crop.v1' != '/2026-06-30.visible-face-crop.v1'` |

Break 3 is the one that shows the two clauses are independent: folding unstamped rows in with
the stamped ones leaves every "two generations" assertion green and fails only the two cases
about unstamped rows.

## 5. What this does not do

- It does not **split** a mixed run, filter it, or refuse it. That is a decision about what
  happens to already-collected samples, and it is the same decision
  `VISIBLE_MODEL_CONTRACT.inputSchemaVersion` is waiting on in its own backlog item.
- It does not touch `ml/calibrate.py`, which still has no version handling. Threshold fitting
  reads a CSV directly and does not go through `coverage()`; giving it the same report is a
  separate change and is now the remaining half of the backlog item.
- It cannot say **how far apart** two generations are. Nothing in the rows records that, which
  is exactly why the output is a warning.
