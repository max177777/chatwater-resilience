# Max integration handoff

2026-10-24 · Branch `noah/document-review-status` · CW-10 checkpoint **`e20bb91`**. This note is a separate documentation-only follow-up. No push, merge, rebase, deployment or external model call occurred.

## Main comparison and integration order

Fetch succeeded: `origin/main` is `7ea984fca7fc44fdb3af99ab4e49c211146c77e2`, the common ancestor. CW-10 is **4 ahead / 0 behind**; this documentation follow-up makes the final branch **5 ahead / 0 behind**. No main-only commits or divergent-main conflicts exist. There are 72 changed implementation/documentation paths, plus this new handoff. Vendored `public/ecam` equations are unchanged.

Review the dependent history in order; do not cherry-pick CW-10 alone:

| Order | Commit | Completed local changes |
|---|---|---|
| 1 | `37aef3d` | Preserved prior demo/language/export and assessment-validity baseline; substantial existing work, not disposable setup. |
| 2 | `bc8d316` | CW-03: input status/provenance, dependency propagation, partial totals, freshness, duplication and bound transfer. |
| 3 | `fc85013` | CW-11: server-scoped selected-project Word/ZIP, nested backup filtering, manifest and separate full-workspace recovery. |
| 4 | `e20bb91` | CW-10: shared document review, content-bound confirmations/notes, linked issues, generation race protection, accurate export status and reconciled checklist. |

Shared hotspots: `public/js/app.js`, `public/js/i18n.js`, `server.js`, `engine/export.js`, `test/run.js`, checklist. CW-03/CW-11 also overlap in integrity/forms/transfer tests; CW-03/CW-10 in `cw-core.js`, script loading and Word tests; CW-11/CW-10 in `engine/project-export.js`. Preserve validity, freshness and ownership gates when integrating later team edits. These are overlaps, not current conflicts.

## Migration and evidence

Take a **full workspace backup** before upgrading saved work. Ambiguous legacy zeros remain unconfirmed; confirming defaults does not make them measured. Missing/mismatched companions cannot silently apply metadata; imported values are unconfirmed and edited recovery text remains recoverable. Native ECAM stays compatible. Scoped sharing omits other projects, chat/recovery, mixed checkpoints and unbound versions; full backup retains them. Profile/GWP remain global, with one active plan/proposal pair.

Legacy review ticks preserve text but require review again. Version-1 human-review records bind content/language/evidence/dependencies; edits/regeneration reopen review and source changes remain outdated. Reviewed is editorial attestation, not authenticated identity, scientific certification or funder approval.

Recorded **local** verification: 18 offline test files passed with/without corpus; absent-library check passed; real synthetic A/B downloads and full/scoped restores inspected; draft/reviewed screen, manifest and Word statuses agreed; all three rendered sample pages inspected. This checkpoint reused that evidence and reviewed the diff, without broadening tests. No deployed behavior or live model output is verified. Details: [CW-03](cw03-missing-data-continuity.md), [CW-11](cw11-project-export-scope.md), [CW-10](cw10-document-review-status.md).

## Corpus and remaining launch gates

Ignored `knowledge/library/` is absent from fresh checkouts. Local inspection: `lib-4c319211a4b2`, 19 indexed sources, 3,139 passages. Render currently runs `npm ci && npm test`, **not** corpus provisioning; tests can pass without corpus. `autoDeploy: true` means a future main push can deploy.

After licensing/distribution approval, provision the exact inputs in `scripts/library/sources.json`: `Revised Framework Stages 2-4.docx`, `Sources-20261018T185625Z-1-001.zip`, `Examples-20261018T185556Z-1-001.zip`.

```sh
npm ci
node scripts/library/build.js --input-dir /path/to/approved-inputs
node scripts/library/eval.js
```

DAK OCR needs macOS Swift/PDFKit and Tesseract `ind`/`eng`; `--no-ocr` leaves uncached scanned material unavailable. Keep private inputs, caches and generated corpus outside Git. Max must arrange approved hosting artifacts, then verify `/api/health` library/build/source count and `/api/knowledge/search?stage=2&q=pump%20efficiency`. See [build instructions](../knowledge/README.md); retrieval scores do not verify claims.

Remaining owner decisions:

- **Chimdi/scientific:** computational sufficiency/inventory boundaries, water-loss measure/scenario (CW-04), pump-only energy methodology (CW-05), onsite responsibility/classification, remaining zero-denominator/dependency semantics.
- **Framework/evidence:** resolve GCF 2024 versus placeholder wording (CW-09); approve source qualifications/licensing and deploy corpus (CW-08). Eligibility remains uncomputed.
- **Product/QA:** Silvia's terminology review, remaining input/onboarding guidance, chat/progress layout, broader accessibility, multi-tab and Word-client/large-document checks.

The [23-ticket checklist](assessment-validity-review.md) identifies partial overlap: CW-12/13 transfer/provenance, CW-16/21 ownership/recovery, and CW-06/19/20/23 review/accessibility/export already receive CW-03/CW-10/CW-11 coverage. Complete only their remaining scopes. Proposed next order: review stack, resolve owner gates, provision approved corpus, rerun documented checks on the chosen target, then separately authorize preview/integration/release. Nothing here authorizes deployment.
