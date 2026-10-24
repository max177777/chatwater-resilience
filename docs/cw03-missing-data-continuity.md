# CW-03 — missing data continuity handoff

Local work, 2026-10-23. Checkpoint: `37aef3d` on `noah/assessment-validity`; current branch: `noah/missing-data-continuity`, created from that checkpoint. This batch is intentionally uncommitted. No push, merge, deployment, external AI request or ECAM equation change.

## Preservation and sources

The checkpoint contains the reviewed pre-existing demo and assessment-validity work (49 paths). Generated corpus files, PDFs/private documents, credentials, dependencies and caches were excluded. Two pre-existing untracked machine-generated Copilot reports under `.github/` were excluded and left untouched. The path/hash manifest and pre-checkpoint patch are in ignored `.cache/missing-data-continuity/`. No reset or clean was used.

`docs/assessment-validity-review.md` was read before implementation. Its source PDFs remain accessible at `/Users/noah/Downloads/Review.docx.pdf` and `/Users/noah/Downloads/Indonesia Example.docx.pdf`; the previous handoff records their full reading, page inspection and hashes. This batch uses their fictional Cases A/B and retained review decisions. Originals are unchanged.

## Migration and input contract

The existing `inputStatus[assessmentId].s[scopeOrSubstageId][code]` remains authoritative. Availability is separate from source origin and confirmation. No destructive migration guesses the intent of a historical zero.

| Input state | Interpretation |
|---|---|
| Blank, null or absent imported field | Unknown; cannot become a constructor zero during hydration. |
| Explicit manual zero, or a matching confirmed zero | Available when physical bounds and dependencies permit zero. |
| Legacy/imported zero without a matching confirmation record | **Unconfirmed**, with an explanation that entry intent/source was not recorded. It is neither inferred deliberate nor inferred missing. |
| Untouched zero in a new assessment | Unknown/default; displayed blank until entered or explicitly confirmed. |
| Nonzero legacy value | Usable numerical input, with unknown/imported source still visibly unconfirmed. This compatibility policy does not certify its measurement or source. |
| Confirmed default/estimate/typical value | Keeps that origin. Confirmation never labels it measured/manual. |
| Explicit unknown | Retains the stored value, origin, notes and prior record; dependent values become unavailable. |
| Not applicable | Derived from process-question settings, or a matching explicit input status. Displayed as not applicable, rather than a measured zero. |
| Malformed, nonfinite or out-of-bounds number | Invalid; original input remains editable. |

Existing old `{st:'entered'}` records retain their prior explicit-manual meaning; `{st:'confirmed'}` retains confirmation without inventing a measured origin. A record whose value differs from the current input does not confirm the new value. Confirming that new value keeps its source unknown and saves the previous record. Numeric edits/status changes retain up to eight prior records; this is not an unlimited audit log. Marking unknown never deletes the current numerical value. Vendor question resets retain the pre-reset fields in provenance records before running the unchanged reset behavior. Native/project backups and existing project checkpoints preserve the saved data and edited text.

The form provides Confirm value/zero and Mark unknown controls. Blank/malformed values cannot be confirmed. General factors show origin and confirmation separately. No scientific provenance is inferred from clicking Confirm.

## Dependency coverage

The shared browser/Node implementation is `public/js/result-status.js`. It calls the trusted bundled ECAM methods; it does not evaluate uploaded code or alter equations. It traces static `this.field` / `this.method` references, including both conditional branches, through **148 methods, 116 published substage outputs and 250 numeric input slots** across all six substage types. Current bundled methods have no unresolved `this` references. Applicability uses ECAM questions plus explicit owners for non-displayed sludge/biogas components. Inactive children contribute structural zero only inside aggregation; contradictory retained nonzero inactive contributions invalidate their parent.

The exact per-method direct references, flattened input requirements, process owners, constants, tables, source hashes and published-output lists are in [cw03-dependency-coverage.json](cw03-dependency-coverage.json). Regenerate with `node scripts/review-dependencies.js` and review the diff after vendor changes; the continuity test detects inventory drift.

Application projections covered:

- Substage and stage GHG by gas, complete assessment GHG, first-level emission-source breakdown and contributor ranking.
- Stage/utility electricity totals; resident/served population and per-capita KPI dependencies, including assessment duration.
- Independent NRW, water loss and length-normalized water measures. The application-only NRW/km companion uses the same shared status combiner.
- All eight built-in rules: pump upgrade, pump audit, water loss (legacy rule ID `nrw_reduction`), septic desludging, CSO reduction, biogas capture, fuel switch and solar PV. Their requirement lists are recorded in the inventory. The septic scenario additionally tracks density, emptying share, onsite population, sludge BOD concentration, General BOD factor and the complete inventory/period used by its ECAM rerun. Scenario assumptions and thresholds are unchanged.
- Action support checks, browser comparisons, server-recalculated chat, proposal facts and ZIP calculation/status data. Unsupported estimates are omitted from calculated options and cannot rank as quantified benefits. Existing saved selections/text remain recoverable and are marked outdated. Explanations/alternatives recheck their option against current support before using its benefits.

An unavailable component does **not** become zero. A complete total is null when a required component is unknown/invalid/unconfirmed/untracked. `known_subtotal` sums supported **whole substages**, is labeled incomplete, and is never used as a complete assessment total or contributor-ranking denominator. Other supported components can remain visible. Plans/proposals and decision exports require a supported inventory plus existing validity/freshness checks. A full local project backup remains possible for an incomplete draft.

### Explicit limits and remaining decisions

This is conservative application dependency coverage, not scientific validation or a claim that every global ECAM indicator is reviewed. Unexposed global ECAM indicators, arbitrary custom-benefit models, expression-level validation and narrative evidence are not certified. ECAM methods that internally coerce zero-denominator arithmetic to a finite zero retain that vendor behavior; no replacement scientific equations were introduced. Constants/tables/GWP reports remain versioned model settings, not measured inputs. Dynamic or known external/global method references fail closed; a vendor upgrade still requires human inventory review.

Existing compact decision-card diagnostics cover only their original subset of checks. The shared evaluator and `availability_checks` are the support authority for all eight rules; custom actions remain unquantified. Not every absent rule has a full bilingual explanation or a direct link to every prerequisite. There is no claim of complete ECAM semantic dependency coverage.

Scientific/product decisions remain: computational sufficiency; whether legacy nonzero values should eventually require confirmation; the pump-only energy boundary; the water-loss action's intended measure/scenario; onsite responsibility/classification; and narrower per-document dependencies. No such decisions were silently resolved here.

## Freshness and text preservation

A semantic `supportRevision` accompanies action basis, plan dependencies and proposal dependencies. Recalculation compares the current output-support statuses, energy/population support, General factor statuses and period validity. A confirmation/unknown/applicability change that alters support marks the assessment's actions and dependent documents outdated, even if native ECAM numeric revision is unchanged. Old drafts with no support fingerprint require review; their text is retained.

Numeric/configuration/GWP changes retain the existing revision protections. Source-note edits do not change this fingerprint: current computed results and document facts do not consume per-input source notes. Such notes remain in the transfer metadata. This invalidation is deliberately conservative at **assessment** scope; it does not yet isolate only the particular selected action/document fields affected. A future output that consumes a source note must explicitly add a narrative dependency. No saved text is automatically regenerated, erased or marked reviewed.

## Duplication and transfer

Existing native ECAM download/import and saved-session/ZIP capabilities were inspected and reused. Native ECAM JSON stays an ordinary ECAM array. Duplication copies/remaps all substage input records and General/Water/Waste scopes to fresh assessment/substage IDs. Original plan/proposal identity relationships remain with the original assessment; duplication does not silently reassign them.

The version-1 project envelope wraps native ECAM data plus a bound companion around the existing saved-session schema. It preserves assessment/substage IDs, statuses/origins/confirmations/notes/history, units/question settings, GWP index, ECAM/schema/transfer versions, actions, selected identities, edited plan/proposal, previous versions and checkpoints. The existing ZIP now contains:

- `ecam/assessments-ecam-format.json` — native ECAM data.
- `ecam/application-metadata.json` — bound companion, with application state under `state`.
- `project/project-backup.json` — complete project envelope.
- Existing calculation, action, proposal and evidence exports.

Use **Save project backup / Restore project backup**, or load a native file with its companion together. Valid complete restores use a **new isolated browser workspace** (`?workspace=…`) after saving the current one. Current workspace data is retained. A failed parse/write leaves it untouched. A standalone companion is rejected.

Association checks require supported envelope/schema/GWP versions, matching counts and unique IDs within each assessment, exact assessment ID and native revision, full native-data digest (including names, comments and units), metadata digest, and saved-state digest. These checksums detect accidental cross-assessment/revision association; they are not cryptographic signatures or authentication. Assessment settings and old dependency records are preserved, not rewritten to appear fresh.

Absent, malformed, mismatched or unsupported companion metadata is **never applied**. Native values import with explicit imported/unconfirmed provenance and a warning. Nonzero values follow the compatibility policy above; ambiguous zeros stay unconfirmed. Incoming edited documents/settings from a mismatched sidecar or old unbound saved session are retained in `transferRecovery` for recovery through the project backup. They are not rebound to the imported assessment. There is no dedicated recovery-editor UI yet. With native data alone, GWP/source/identity information cannot be recovered and the warning says so.

## Verification

All verification used fictional fixtures and AI off. `npm test` runs all **16 test files**, each with the offline guard preloaded: provider credentials removed, external fetches refused, any provider behavior injected with synthetic replies. Full suite passed. Relevant new checks cover blank/explicit zero, ambiguous legacy zero, unchanged default origin, missing imported fields, invalid/NA dependencies, unknown distribution energy and downstream facts/draft protection, non-staling source notes, duplicate status remapping, complete project transfer including edited/previous/checkpoint text and non-default GWP, native+companion round trip, missing/mismatched/changed-unit/changed-ID metadata, and unchanged valid Cases A/B. Server ZIP/Word tests inspect package contents; imported bindings/status/settings are compared programmatically.

Browser verification used the available in-app browser against AI-off `http://localhost:38743` with isolated `?workspace=cw03-review` storage. A complete synthetic project restored to a fresh workspace URL. Confirmed legacy billed-volume zero stayed unknown-source/confirmed and produced 100% NRW. Blank input disabled confirmation; explicitly typing zero made it entered. Marking 900000 kWh distribution electricity unknown kept the value and showed an incomplete total with **609.3 tCO2eq known subtotal** and a link back to the affected process. Duplication preserved that unknown energy and confirmed legacy-zero provenance. Confirming a new General default displayed **default · available · confirmed**. Screenshot: ignored `.cache/missing-data-continuity/browser-partial.png`.

Browser file chooser operations replaced unavailable direct browser test APIs. The browser upload/isolation and displayed statuses were checked; native/mismatched companion rejection and ZIP/project round trips were verified by automated tests. A fresh browser-generated backup download was not independently inspected in this batch. Live hosting, external AI completion, cross-browser/mobile, concurrent tabs, comprehensive accessibility/security/load tests, Word application pagination and scientific approval remain unverified. Existing all-assessments ZIP export scope (CW-11) is unchanged.

### Fresh browser backup acceptance — 2026-10-24

Completed the remaining real-button acceptance check before the CW-03 checkpoint. An isolated AI-off workspace (`http://localhost:38745/?workspace=workspace_14a9bbde90134b79`) contained a synthetic entered zero, legacy/unconfirmed zero, retained unknown 900000 kWh input, source notes, AR4 GWP, MWh display units, assessment/plan/proposal links, edited document text, previous wording and a checkpoint. A synthetic seed was imported through the browser to set up this data; it was **not** used as the downloaded test artifact.

Clicked the real **Save project backup** button and inspected `/Users/noah/Downloads/chatwater-project-backup.json`. Its project envelope and metadata digests validate. Restored that exact downloaded file through the UI into another isolated workspace (`workspace_ef51f0f5d0934753`). Downloaded it again with the real button as `chatwater-project-backup (1).json`, then reloaded and downloaded the original workspace as `chatwater-project-backup (2).json`. All three parsed saved states are deeply equal, including every value, status, source note, origin/confirmation, setting, identity, edited text, previous version and checkpoint. The original workspace remains intact. No concrete backup failure was found and no implementation change was needed for this check.

The in-app browser supported both upload and actual download access. Chrome's extension upload helper lacked file-URL permission; no permissions were changed. Verification details/hashes and screenshot are in ignored `.cache/cw11/cw03-browser-verification.json` and `cw03-restored.png`. This closes the earlier fresh-download limitation; broad cross-browser and scientific validation remain outside this acceptance check.

CW-03 was then committed locally as `bc8d316` on `noah/missing-data-continuity`. The subsequent **uncommitted** CW-11 batch on `noah/project-export-scope` scopes sharing packages and relabels the existing complete recovery operation **Save full workspace backup**. Its selected-project envelope deliberately excludes whole-workspace history; see [CW-11 handoff](cw11-project-export-scope.md). Earlier all-assessments ZIP/backup-button descriptions above are historical CW-03 behavior.
