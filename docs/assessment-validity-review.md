# Launch review reconciliation — bounded validity batch

**Current local checkpoints (2026-10-24):** the original work below is preserved in `37aef3d` on `noah/assessment-validity`; CW-03 including real-browser backup acceptance is committed as `bc8d316` on `noah/missing-data-continuity`. The CW-11 continuation is uncommitted on `noah/project-export-scope`. See [CW-03 continuity handoff](cw03-missing-data-continuity.md), [exact dependency inventory](cw03-dependency-coverage.json), and [CW-11 export scope handoff](cw11-project-export-scope.md). Historical findings below describe their earlier batch unless updated in the checklist.

Local review: 2026-10-23. Branch: `noah/assessment-validity`. Tested base commit: `7ea984fca7fc44fdb3af99ab4e49c211146c77e2` (Meeting feedback, Oct 20). After `git fetch origin`, `HEAD` and `origin/main` are identical: zero commits ahead/behind. The starting version was `noah/demo-language-export` **plus its 42 modified/untracked files**, not a clean main checkout. No repository AGENTS.md was found in the repository or applicable ancestor locations.

All original work remains uncommitted. The initial tracked patch, copies of the 42 changed/untracked files, and their SHA-256 manifest are in `.cache/assessment-validity/pre-existing.patch`, `baseline/`, and `baseline.json`. These are local, ignored preservation copies. `.cache/assessment-validity/batch-files.json` lists the 24 paths changed by this batch relative to that starting tree. This batch adds shared assessment validity, server enforcement, fixture/test coverage and this report; it also extends the existing provenance, form, action wording, chat and export code. It does not commit, push, merge or deploy.

## Source files

Read the review's full ticket sections and the worked examples' settings, tables and narratives. Relevant input tables and review pages were also rendered locally and inspected. Originals were not edited.

- `/Users/noah/Downloads/Review.docx.pdf` — 25 pages; SHA-256 `c037c5e4389cf73fadb8a362ba8a5de3a2bb43a013c26e07d4a6611ee95b6bf9`.
- `/Users/noah/Downloads/Indonesia Example.docx.pdf` — 12 pages; SHA-256 `bb083a852e2ab398e605c2ec22e811d581dfe73ae87e798df22ba760283526a0`.

## Ticket checklist

These are **local** findings. No ticket is claimed fixed on the live site. “Partially addressed” includes pre-existing fixes in the starting working tree; it does not imply this batch implemented the whole ticket.

| ID | Current status | Verification and remaining work |
|---|---|---|
| CW-01 | Reproduced; addressed locally for the declared computational minimum | Original ECAM/form path admitted reversed dates and an empty assessment. New tests reject empty, equal/reversed and impossible calendar dates, require a process and its declared inputs, preserve drafts and block downstream routes. Scientific sufficiency still needs team approval. |
| CW-02 | Reproduced; addressed locally for the declared bounds | Tests cover negative energy, hours above 24, percentages above 100, nonfinite/malformed values, option indices, power factor, pump/total energy, same-process water balance and measured efficiency above 100%. Values are preserved; invalid drafts have unavailable results. No universal positive-value rule. |
| CW-03 | Addressed locally for the declared continuity scope; semantic/scientific limits remain | Shared status graph, legacy-zero confirmation, freshness and validated full-project transfer are covered in the continuation handoff. Earlier batch: New zero defaults, blank/null, manual zero, disabled-process applicability and imported/legacy unconfirmed values are distinguished using existing `inputStatus`. Invalid drafts are gated through forms, APIs and chat. Explicit dependency/status coverage is bounded; see migration section. |
| CW-04 | Partially addressed; scientific/product decision required | Case A reproduces NRW 28.5714% and water loss 25%. The existing authorized-consumption action is consistently called **water loss**; its rule ID, 15% trigger, 5-point assumption and benefit calculation remain unchanged. Both measures reach results, plan facts, chat and exports. Chimdi must approve the action's intended measure and benefit model. |
| CW-05 | Reproduced; scientific decision required | Split-energy case gives 597003.375 kWh new-pump energy and 302996.625 kWh saving under the existing equation. Specific provisional warning travels in the action's condition, facts, plan summary, chat and Word/ZIP. No pump-only formula approved or substituted. |
| CW-06 | Partially addressed before this batch | Existing provider code rejects output-limit truncation; synthetic tests verify failures/recovery and incomplete-text labels in Word/ZIP. Full semantic completion and live provider behavior remain unverified; no external AI called. |
| CW-07 | Partially addressed | Selected assessment identity/freshness/context already exist. This batch adds independent water-balance values/statuses to context; tests check 28.57% and 25% and block invalid-draft numerical context. Real generated answers remain unverified with AI off. |
| CW-08 | Partially addressed locally; deployment not verified | Current local library is built: 19 documents, build `lib-4c319211a4b2`. A pump query retrieves ECAM methodology p.162 and a training slide with caveats. Offline retrieval and absent-library tests pass. A missing deployed corpus is a build/deployment issue, not evidence that local retrieval is broken. Deployment contents, source approval/licensing and claim support still need review. |
| CW-09 | Reproduced | Current browser still says both “We use the 2024 ... Guidelines” and that the GCF structure is a placeholder. Not changed in this batch. |
| CW-10 | Partially addressed | Freshness restrictions, review warnings and working-draft labels exist. Assessment validity is now enforced at export. A complete reviewed/submission-ready state and human evidence checks remain outstanding. |
| CW-11 | Addressed locally for the declared selected-project scope; uncommitted | Server scopes ZIP and Word by outputs' source assessment ID, including nested companion/backup state. Mixed checkpoints, chat, recovery and foreign/unbound versions are excluded; full workspace recovery remains separate with an explicit count/scope label. Real A/B UI downloads and selected-backup restore pass deep inspection, as do stale/mismatched rejection and offline regressions. Exact scope, exclusions and limitations: [CW-11 handoff](cw11-project-export-scope.md). |
| CW-12 | Partially addressed | ECAM computations reproduce Case B under AR5-CCF and AR4; 1200 L converts to 1.2 m³ in ECAM base units. ZIP now includes existing provenance/IDs and GWP index in an application companion, plus recalculated settings/results. Native ECAM JSON still cannot restore those settings alone; no companion import/full-backup round trip is claimed. |
| CW-13 | Partially addressed | Existing origin/confirmation records are reused, form entry now records all inputs, duplication remaps those records, and ZIP preserves them. Free-text source/year/period notes per input and supported companion restoration remain incomplete. |
| CW-14 | Partially addressed | Existing ECAM unit conversion/help is retained. Malformed or ambiguous number strings remain visible with an error. Factor source-year hints and a concentration/load calculator are not implemented. |
| CW-15 | Partially addressed | Covered biogas-utilization output is not applicable when the process answer is No; server status and fixture regression verify this. Other zero-denominator indicators need a full dependency review. |
| CW-16 | Partially addressed before this batch | Offline integrity tests verify assessment ownership, stale outputs and recovery. Browser Case A stayed linked across all four stages. Full multi-project usability remains unverified. |
| CW-17 | Partially addressed before this batch | ECAM-first start page and optional details exist. The disabled profile workflow stays disabled. Separate guide-derived fixtures are added; complete onboarding/role readiness remains outside scope. |
| CW-18 | Partially addressed | Existing cards show trigger, assumption, evidence and conditions. Water-loss labels and pump warning are corrected. Scenario assumption keys and limited rule coverage still need product review. |
| CW-19 | Partially addressed before this batch | EN/ID key parity, generated headings, locale formatting and saved-language behavior pass offline tests. New validity messages include English detail; bilingual wording and terminology still require Silvia's review. |
| CW-20 | Reproduced; partially addressed | Validation inputs have error states, field messages and summary navigation. Browser snapshots still show unnamed plan/proposal text boxes. Those controls and full keyboard/screen-reader/WCAG checks were not repaired or certified. |
| CW-21 | Partially addressed | Browser draft/checkpoint save and reload preserved malformed values; pagehide now flushes pending edits. Existing storage failure/recovery tests pass. Checkpoint restore UI, backup restoration and multi-tab behavior still need work. |
| CW-22 | Reproduced in part | The final browser screenshot confirms collapsed chat still occupies the wide column. No complete progress/duplicate-request audit in this batch; existing general generation messages remain. |
| CW-23 | Partially addressed before this batch | Existing native Word structure/Markdown cleanup passes tests; Case A Word was downloaded in the browser and generated Word/ZIP contents checked programmatically. Current Word/LibreOffice visual pagination, complete narrative review and live-provider output remain unverified. |

## Implemented validity contract

`public/js/assessment-validity.js` is shared by the form and `engine/assessment-validity.js`. Vendored ECAM code and equations are unchanged. Bounds come from ECAM `Info`, `Tables`, question/input metadata and the review's stated physical constraints. Negative elevations or scientific coefficients are not assigned invented universal bounds.

The minimum is a **computational floor for entered processes**, not scientific approval of an inventory:

| Process | Base inputs required (ECAM base units, totals for the assessment period) |
|---|---|
| Water abstraction | abstracted volume, grid electricity, grid factor |
| Drinking-water treatment | treated volume, grid electricity, grid factor |
| Water distribution | distributed volume, grid electricity, grid factor |
| Wastewater collection | collected/treated/untreated collected volumes, BOD and TN loads, grid electricity/factor, collection and overflow CH4/N2O factors |
| Wastewater treatment | treated/discharged volume, influent/effluent BOD and TN loads, BOD removed as sludge, grid electricity/factor, treatment and discharge CH4/N2O factors |
| Onsite sanitation | population, containment BOD/factor, emptying share, BOD removed, grid electricity/factor |

Enabled optional questions require their actual numeric/option input fields. An entered zero satisfies presence when physically permitted. Untouched zero defaults in a newly created assessment do not count as an entry. Existing imported numbers remain identifiable as **provenance unconfirmed**; they are not silently relabeled measured. The existence of a water/wastewater process identifies its service type. No assumption that water operators also manage sanitation is introduced.

Checks use the same process and period: billed ≤ authorized ≤ distributed; pumping electricity ≤ total electricity; adequate-pressure connections ≤ service connections; passed tests ≤ tests performed; effluent loads ≤ influent loads for this modeled boundary; and collected treated plus untreated volume ≤ collected volume. No cross-facility mass balance is invented. Different plants, added loads, changing boundaries or nonstandard processes require scientific review.

Draft text/blank/null and invalid numbers survive local persistence and remain editable. Imports reject malformed structure/nonfinite JSON numbers transactionally; ordinary invalid inputs can load as drafts. Absent imported fields are set to null before ECAM hydration, preserving absence instead of inventing constructor-zero observations. Invalid assessments cannot finish. A conservative gate withholds the assessment results and actions until correction, rather than presenting a partial inventory as a valid total. Summary links navigate to the field and focus it.

Server routes `/api/actions`, `/api/actions/explain`, `/api/actions/alternatives`, `/api/plan`, `/api/proposal`, `/api/export` and `/api/export/docx` enforce validity. Existing ownership/freshness conflicts may be reported before validity (409); validity failures return 422. `/api/calculate` returns unavailable results plus structured issues for invalid drafts. Chat can still explain a draft, but receives unavailable numerical results/actions and the reasons. Financing taxonomy and document parsing remain independent of inventory calculations.

## Missing-data coverage and migration limits

The existing `state.inputStatus[assessmentId].s[substageId][code]` is retained. No conflicting second provenance system is introduced. Availability is a derived result; the optional `availability: 'not_applicable'` input record is recognized only for the matching current value. Ordinary process applicability comes from ECAM's existing question settings. Legacy question settings do not prove when a person answered them.

Explicit per-result dependency/status coverage currently includes NRW, water loss, water-loss volume per kilometre, the application NRW-per-kilometre companion, and wastewater/onsite biogas utilization. The inventory/downstream gate uses the declared base/optional input lists. This **does not** establish a complete dependency graph for every ECAM equation, chemical/sludge route or scenario re-run. Historical numeric zero values cannot be reliably reclassified as “not entered” without evidence. They remain imported/legacy-unconfirmed, and an all-default empty process is blocked.

A larger follow-up must agree the per-process inventory boundaries, map each remaining output/scenario to all inputs, decide zero-denominator meanings, track explicit question answers, and design a versioned companion/backup importer with migration and recovery tests. In particular, an onsite inventory may include containment, open defecation, emptied-sludge treatment/discharge and disposal: the present minimum is not a claim of completeness. Costs, funding, eligibility and combined benefits remain uncomputed. CW-03 stays partial; this batch's protection is enforced downstream gating, not merely a display label.

ZIP exports add `ecam/application-metadata.json` (same provenance records, IDs, GWP index and version) and `ecam/availability-and-water-balance.json`; recalculated `results.json` also carries statuses. Native valid ECAM inputs retain their original format. Companion restoration is explicitly not implemented. Existing saved action text using the old NRW label, or missing a required pump warning, must be refreshed; user narrative is not silently rewritten.

## Scientific decisions still required

1. **Chimdi — water loss:** approve whether the action is intended to measure physical/authorized-consumption water loss, NRW, or a different measure; approve its 15% trigger and 5-percentage-point energy/benefit assumption. This batch uses the existing authorized-consumption equation with corrected wording, never billed consumption in the action trigger.
2. **Chimdi — pump boundary:** approve ECAM's total-stage-energy saving basis or specify/enforce a pump-only boundary. For total 900000 and pump 850000 kWh, the unchanged equation yields new pump energy 597003.375 and saving 302996.625 kWh. A pump-only subtraction would be 252996.625 kWh (~171278.715 kgCO2eq), but that alternative is documented only. The action remains provisional and is not scientifically validated.
3. **Chimdi/team — minimum data and missingness:** approve each process's scientific sufficiency, imported/default confirmation policy, applicability/zero-denominator behavior and unusual mass-balance boundaries. No new treatment/sludge factors or pump-saving formula is approved here.
4. **Silvia — language:** review new validation and water-loss wording in both languages. Current detailed error text is English.

## Reproducible fixtures and guide mismatches

Run `node scripts/make-review-fixtures.js`. Separate `test/fixtures/review/case-a.json` and `case-b.json` use fictional data only. Their `.context.json` companions record exact constructor defaults, all settings, guide-supplied values/provenance, GWP factors, period, assumptions and model version. These companions are test support, not an implemented app import format.

Both use 2025-01-01 to 2026-01-01, 365 days, Indonesia/IDR, AR5-CCF (index 0; CH4 34, N2O 298), grid factor 0.677, and the supplied protein/BOD/household factors. The factor is an example default, not verified current Indonesian evidence. ECAM storage conversions: 100 L/s → 0.1 m³/s; 5 km → 5000 m; 1200 L diesel → 1.2 m³. The pump-size choice is index 3 (>96 kW), treatment C/F/S/Filt/Des is index 3, diesel index 0.

| Independent guide check | Reproduced local result |
|---|---|
| Case A electricity / emissions | 1800000 kWh / 1218600 kgCO2eq |
| Case A NRW / water loss | 28.57142857% / 25% |
| Case A NRW / water loss per km | 160000 / 140000 m³/km for the annual period |
| Case A 70% pump scenario | 267878.778934 kWh / ~181353.933 kgCO2eq saved |
| Case B electricity / emissions | 498000 kWh / 951308.552211 kgCO2eq |
| Case B AR4 | about 899.5 tCO2eq |
| Case B electricity-only aeration scenario | 453000 kWh, reduction 30465 kgCO2eq |

Case B's 300000 × 15% = 45000 kWh aeration saving, 30.465 tCO2eq, budget and 16-week schedule are **user-supplied fictional assumptions**. They are recorded in fixture context; no aeration action-card benefit is generated or approved. The scenario changes treatment electricity only, preserving process loads/factors/sludge.

The guide asks for a profile workflow that is currently disabled: use the existing **Optional details** for name, location, service and responsibilities/capacity; operating quantities stay in ECAM. The profile has not been restored. The guide's narrative budget/schedules are not automatic model inputs. Case A's untouched task template totals 100 weeks including 52-week monitoring; its 16-week illustrative implementation schedule requires deliberate editing. The compost-N field has the guide's acknowledged misleading stored-sludge wording. No expected value was adjusted to force agreement.

## Verification and local review steps

- Initial offline suite passed on the pre-existing working tree (14 files). Final `npm test` covers the same suite plus `assessment-validity.test.js` (15 files), with `test/helpers/offline.js` preloaded in every process. AI keys are deleted; all external fetches are refused. Provider tests use injected synthetic responses.
- New regressions cover dates, empty/default-zero assessments, missing required and enabled inputs, numeric bounds/types, same-boundary inconsistencies, explicit zero, imported/unconfirmed and not-applicable states, malformed imports, invalid calculate/chat contexts, API gates, independent PDF figures, pump warning and Case A through real Word/ZIP generation. ZIP provenance and Word contents are inspected programmatically.
- Existing integrity test's unrelated assessment had 10 kWh total but a larger pumping value. Its pumping value is now also 10 kWh so it remains a valid **freshness/ownership** fixture; its assertions and the guide's expected outputs were not relaxed.
- Browser: a dedicated in-app browser origin `http://127.0.0.1:38741` isolated storage from normal/live work. Checked empty draft, reversed/equal dates, linked field errors, negative and malformed values, checkpoint/reload preservation, blank versus explicit zero, duplication, Case A import/results/finish, pump and water-loss cards, saved selection, plan, proposal and Word download. The browser download was `/Users/noah/Downloads/proposal (5).docx`. ZIP generation is verified by the API regression. Drafts remain unfinished and are not marked reviewed.
- Current local library retrieval returns `ecam-methodology-guide#p162-1` for a pump query. Live deployment, real AI completion, Word/LibreOffice visual pagination, mobile/cross-browser, full accessibility/security/load/recovery and multi-tab behavior were not verified.

To review locally:

1. `npm test` (requires local listener permission in a restricted sandbox).
2. `PORT=38741 node --require ./test/helpers/offline.js server.js` and open `http://127.0.0.1:38741` in a fresh browser profile/origin. Do not clear existing user storage.
3. Start a new assessment. Try equal/reversed dates, an empty process, -100 kWh, 30 service hours and 120% target efficiency. Inspect summary links and field errors, save a checkpoint and reload. Change a blank energy field to an explicit 0.
4. Load **only** `test/fixtures/review/case-a.json`; check 365 days, 1218.6 tCO2eq, 28.57% NRW and 25% water loss. Finish, choose only the distribution pump, save selections, generate/save a plan, choose General, generate the working proposal and download Word/ZIP.
5. In a separate fresh workspace, load `case-b.json`. Check the baseline and no-biogas applicability. For the narrative scenario duplicate B and change treatment electricity to 393000; retain all other values. Treat budgets, savings narrative and schedule as assumptions.
6. Review `ecam/results.json`, `application-metadata.json` and `availability-and-water-balance.json` in the ZIP. Companion import and selected-project-only export remain separate work.

Logs, initial preservation copies, PDF renders and generated browser evidence are under `.cache/assessment-validity/`. Changes are left uncommitted. Stop after this validity batch; no live-site fix or scientific approval is implied.

Final verification: the complete 15-file offline suite exited 0 after the last code changes; `git diff --check` is clean. The source PDFs retain the SHA-256 values above. Browser proof: `.cache/assessment-validity/case-a-browser.png`.
