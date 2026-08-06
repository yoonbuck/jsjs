# Task 5: Test262 and integration

## Completed scope

- Pinned 14 compact, untagged Date Test262 files from the existing package.json
  revision `b363f29d3c43c626dc852744ad64a0b48a003693`; the revision was not
  changed.
- Added a Node CI-contract invariant that requires the three Date groups. Since
  `ci:contract` runs `test:node` and the pinned upstream suite, it validates
  both their mandatory presence and their real execution.
- Regenerated the Test262 report and README coverage block. The upstream subset
  is now 369 files / 729 variants, all passing.
- Updated README's compact built-in table to describe only the implemented ES5
  Date surface and deterministic clock/timezone behavior.

## TDD and fixture evidence

### Date integration fixes

- **RED:** `npm run test:node --silent` failed the new focused cases:
  - `timeClip ... normalizes negative zero`: expected `+0`, got `-0`.
  - `Date constructor clones dates ...`: an own throwing `toString` escaped.
- **Root causes:** `timeClip` returned `ToInteger` unchanged, preserving `-0`;
  `new Date(date)` took a conversion path when Date conversion methods were
  overridden instead of copying the internal Date value.
- **GREEN:** after normalizing `TimeClip` with `+ 0` and always cloning
  `EngineDate.timeValue`, `npm run test:node --silent` exited 0.

### Test262 selection

- **Initial selector RED:** the first 14-candidate selector reported 28
  variants: 20 passed and 8 failed. The Date failures exposed the `-0` and
  clone defects above; `parse/zero.js` also failed only because it uses
  post-ES5 `const`, so it was not pinned.
- **Before manifest pin:** the final explicit selector over the 14 selected
  files reported **28 passed, 0 failed, 0 skipped**.
- **Manifest-invariant RED:** before adding the Date groups,
  `npm run test:node --silent` failed with `missing Date group
  date-accessors-mutators`.
- **Manifest-invariant GREEN:** the same command passed after the manifest
  change. The post-pin `npm run test262:upstream --silent` passed all **729**
  selected variants.

## Pinned groups and rationale

- `date-construction-statics` (5 files): Date call/display-parse behavior,
  Date cloning, `TimeClip` negative-zero semantics, `Date.UTC` overflow and
  clipping.
- `date-accessors-mutators` (5 files): UTC year/millisecond getters and
  overflowing UTC month/hour/millisecond setters.
- `date-formatting-json` (4 files): ISO and UTC formatting, `toJSON` handling
  of non-finite dates, and `valueOf`.

The paths are all explicit, revision-pinned, untagged ES5-compatible files.
No post-ES5 Date feature or broad Date-suite claim was added.

## Artifacts and documentation

- `tools/test262/upstream-subset.json`: three Date groups and 14 files.
- `test/node/workflow-contract.test.js`: exact group/path invariant.
- `docs/test262-report.jsonl` and README generated coverage: 369 files / 729
  variants selected; 369 / 729 passed (0.689% / 0.714%).
- `README.md`: Date moved into the implemented ES5 families; removed from the
  unimplemented-library list.

## Validation

- `npm run test262:fixtures --silent` — 14 total, 13 passed, 0 failed, 1
  expected feature skip.
- `npm run test262:fixtures:manifest --silent` — 13 total, 11 passed, 0
  failed, 2 expected feature skips.
- `npm run test262:upstream --silent` — 729 passed, 0 failed, 0 skipped.
- `npm run test262:upstream:check --silent` — passed.
- `npm run vendor:check --silent` — passed.
- `npm run ci:check --silent` — passed.
- `npm run typecheck --silent` — passed.
- `npm run lint --silent` — passed.
- `npm run format --silent` — passed.
- `npm test --silent` — passed.
- `npm run ci:contract --silent` — all 19 contract cases passed, including the
  real browser and pinned upstream Test262 runs.
- `git diff --check` — passed.

## Self-review

- Confirmed group and path ordering satisfies the deterministic subset parser.
- Confirmed every selected Date record and all three baseline summaries have
  zero failures or skips in the generated report.
- Confirmed generated artifact drift checks and the full portable CI contract
  pass. No remaining concerns.

---

## Round 1 fix: ES5 Date construction and Test262 audit

### Corrected behavior and TDD evidence

- **RED:** before changing production code,
  `node test/run-node.js test/date-builtins.test.js` failed the restored
  Date-conversion cases: an own or inherited `Date#toString` override was
  ignored by the unconditional internal-slot clone, and an ordinary guest
  object took String conversion rather than `valueOf`-first Number conversion.
  The focused guest case expected `valueOf,123` and received the String-path
  result. This is an ES5 correctness failure.
- **RED:** before changing the manifest,
  `node test/run-node.js test/node/workflow-contract.test.js` rejected the
  changed Date selection until its exact contract list was updated.
- **GREEN:** `Date(value)` now uses no-hint `ToPrimitive`. `EngineDate`
  supplies ES5's Date-specific String default, while every other guest object
  retains the ordinary Number default. No host conversion is delegated.
- The previous internal-slot clone and its ES2015 Test262 test are removed.
  Overridden Date conversion methods are now observed, as ES5 requires.

### Selected-Date frontmatter audit

Every remaining selected Date test was read for its frontmatter and `info`
semantics. Modern `esid` labels in the upstream corpus were retained only
where the asserted algorithm is an ES5 Date algorithm; no post-ES5 feature is
being claimed.

- **date-construction-statics**
  - `15.9.1.15-1.js` — `sec-date-time-string-format`; ES5 Date Time String
    Format defaults for omitted fields.
  - `S15.9.2.1_A2.js` — `es5id: 15.9.2.1_A2`; ES5 Date-as-function behavior.
  - `S15.9.3.2_A3_T1.1.js` — `sec-date-value`, source 2009; ES5 Date
    construction's Date class/brand.
  - `UTC/overflow-make-day.js` and `UTC/time-clip.js` — `sec-date.utc`;
    their `info` asserts ES5 `MakeDay` overflow and `TimeClip` range behavior.
- **date-accessors-mutators**
  - `getUTCFullYear/this-value-valid-date.js` —
    `sec-date.prototype.getutcfullyear`; ES5 UTC year extraction.
  - `getUTCMilliseconds/this-value-valid-date.js` —
    `sec-date.prototype.getutcmmilliseconds`; ES5 millisecond extraction.
  - `setUTCHours/this-value-valid-date-ms.js` —
    `sec-date.prototype.setutchours`; ES5 UTC field normalization.
  - `setUTCMilliseconds/this-value-valid-date.js` —
    `sec-date.prototype.setutcmilliseconds`; ES5 UTC millisecond normalization.
  - `setUTCMonth/this-value-valid-date-month.js` —
    `sec-date.prototype.setutcmonth`; ES5 UTC month normalization.
- **date-formatting-json**
  - `prototype/S15.9.5_A42_T1.js` —
    `sec-properties-of-the-date-prototype-object`, source 2009; the ES5
    required `toUTCString` property, without pinning a later formatting choice.
  - `toISOString/15.9.5.43-0-3.js` —
    `sec-date.prototype.toisostring`; ES5.1-required method presence.
  - `toJSON/non-finite.js` — `sec-date.prototype.tojson`; ES5's generic
    Number-hint conversion and non-finite `null` result.
  - `valueOf/S9.4_A3_T1.js` — `es5id: 9.4_A3_T1`; ES5 TimeClip truncation.

Removed non-ES5 or ES5-permitted-only pins are
`construct_with_date.js` (explicit `es6id: 20.3.2.2`),
`TimeClip_negative_zero.js` (explicit ES6 `+0` constraint), and
`toUTCString/day-names.js` (later standardized fixed formatting). They are
replaced by compact ES5-required tests above; all three representative groups
remain at five, five, and four tests.

### TimeClip choice and generated artifacts

The implementation continues to normalize `-0` to `+0`, but this is recorded
as the project's chosen ES5-permitted behavior, not as a correction to an ES5
defect. The ES6-only negative-zero Test262 file is not pinned.

`npm run test262:upstream --silent` regenerated
`docs/test262-report.jsonl` and the README coverage block. The selection
remains 369 files / 729 variants, with 369 / 729 passing.
