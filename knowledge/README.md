# ChatWater knowledge base: how to add documents

All AI assistance now quotes the curated **document library** in `knowledge/library/` (see [Document library](#document-library-knowledgelibrary) below), through one retrieval service (`engine/retrieval.js`). It is used by:

- the context chat
- **Explain with AI** (stage 2)
- the **project summary** (stage 3)
- **every proposal section** (stage 4)

Each request gets at most five passages, never the whole library. The AI is told to state facts about Indonesia, funders, regulations, costs and programmes **only if they appear in those passages**, and to cite them as `[S1]`, `[S2]`. Anything not covered becomes a `[To be provided: …]` placeholder. With AI off, templates cite nothing and list the retrieved passages as related reading.

Utility numbers (emissions, energy, savings) never come from documents. They always come from the ECAM calculation, and a project-data question is answered even when no passage matches.

The topic folders below (`financing/`, `plan/`, `indonesia/`, `ecam/`) are the **legacy** corpus. Drafts no longer read them; they remain searchable at `/api/knowledge/search?legacy=1&q=…`. New documents should go through the library build instead.

## Where to put files

The **folder decides the topic**. Each kind of draft searches its own topics first.

| Folder | Put here | Used most by |
|---|---|---|
| `financing/` | Funder guidelines and criteria, e.g. GCF (incl. the 2024 Water/Sanitation design guidelines), ADB, World Bank, KfW; national financing schemes, PPP/KPBU guides, blended-finance examples | Stage 4 proposal sections |
| `plan/` | How projects are prepared and approved in Indonesia: feasibility study requirements, procurement rules, permits and approvals, typical durations and roles | Stage 3 plan summary, Explain with AI |
| `indonesia/` | National and sector context: NDC and climate targets, water and sanitation targets, sector regulations, PDAM performance reports, grid emission factors, case studies of Indonesian utilities | All drafts and chat |
| `ecam/` | ECAM guidance and methodology notes | Chat |
| (top level) | Anything else | All, with no preference |

## Formats

- **PDF, Word (.docx), Markdown (.md) or plain text (.txt).**
- PDFs must contain real text. Scanned PDFs (pictures of pages) cannot be read, so run OCR first. To check, open the PDF and try to select a sentence: if you can, it's fine.
- English and Bahasa Indonesia both work. Avoid mixing many languages in one file.
- **Prefer the relevant chapter over a 400-page report.** Shorter, focused files give better answers. Split a long report into its useful chapters.
- **Don't upload confidential documents.** Utility-internal data should be entered in the app instead.

## Give each file a proper citation (`sources.json`)

Without an entry, the file name is used as the title. Add an entry so the citation in the proposal looks right:

```json
{
  "financing/gcf-water-sanitation-guidelines-2024.pdf": {
    "title": "Water and Sanitation Project Design Guidelines",
    "publisher": "Green Climate Fund",
    "year": 2024,
    "url": "https://www.greenclimate.fund/...",
    "language": "en"
  }
}
```

The key is the path inside `knowledge/`. Use short lowercase file names with dashes, e.g. `indonesia/pdam-performance-2024.pdf`.

## How to add files

- **Easiest:** put them in the team Google Drive folder with the same subfolders. Max adds them to the app.
- **Directly:** on GitHub, open `knowledge/<folder>` → **Add file → Upload files** → commit. The site redeploys in a few minutes.

## Check that a file was read

After the deploy, open:

- `/api/knowledge`: lists every file with its topic and number of passages. Files that could not be read appear under `errors`.
- `/api/knowledge/search?q=gcf co-financing` (or `?q=...&topic=financing`): shows which passages the AI would receive for that question. If the right passage doesn't come up for an obvious question, the document is probably a scan, too long, or in the wrong folder.

## Document library (`knowledge/library/`)

The chat, Explain with AI, the plan summary and proposal sections quote this curated library. It is built from the team's supplied files by a reproducible script; the originals are not copied or changed.

**`knowledge/library/` is git-ignored** until the team decides whether the extracted source text may be distributed. A fresh checkout does not have it; rebuild it locally.

### Rebuilding the library

1. Put these three files, exactly as downloaded from the team Drive, in one folder (the names are listed under `inputs` in `scripts/library/sources.json`):
   - `Revised Framework Stages 2-4.docx`
   - `Sources-20261018T185625Z-1-001.zip`
   - `Examples-20261018T185556Z-1-001.zip`
2. `npm install` (the build uses `jszip`, `mammoth` and `pdf-parse`, already in `package.json`).
3. Optional, for the scanned DAK drinking-water excerpt: macOS (`swift`, which renders pages with PDFKit) and `tesseract` with the `ind` and `eng` languages (`brew install tesseract tesseract-lang`).
4. Run:

```bash
node scripts/library/build.js --input-dir <folder>    # default folder: ~/Downloads
node scripts/library/build.js --input-dir <folder> --no-ocr   # no new OCR; without cached OCR the DAK excerpt is marked unavailable
```

5. Check `/api/health` (or `node scripts/library/eval.js`): the library shows `loaded: true` with a build ID.

Extraction happens in `.cache/ingest/` (git-ignored). OCR results are cached in `.cache/ingest/ocr/` and reused by later builds; delete that source's folder there to redo its OCR. Rebuilding from the same inputs and the same `tesseract` version gives identical output and the same build ID. All curation (titles, roles, review status, caveats, sector, relationships, exclusions) lives in `scripts/library/sources.json`, not in the generated manifest. The evaluation sets refer to source IDs, so they survive a rebuild.

Limits of the build:

- PDF headings are detected from the text layer only (no font information). Numbered sections, `Bab`/`Pasal`, and table/box captions are recognised; table-of-contents entries and numbered list items are rejected. Unnumbered subheadings are not seen, so some passages carry their chapter heading over many pages (e.g. WHO 6.2.2, IPCC 6.4.4, World Bank "XI. Moving Forward"). Page locators are exact.
- Passage IDs (`<source>#p<page>-<n>`) are positional and can change when extraction changes. Saved outputs keep the build ID they were made with, so the passages they cite can be traced to that build.

### Without the library

The app still works. `/api/health` shows `library.loaded: false` with the reason. Chat and drafts say **"Library not built"** (no documents were searched), which is different from "No supporting passage found" (the library was searched and nothing matched). Project-data questions are still answered from the ECAM calculation, and templates still work.

- `node test/run.js` passes without the library. Tests that need indexed passages use a small synthetic library (`test/helpers/synthetic-library.js`, invented one-line texts marked `SYNTHETIC TEST TEXT`, no source text). Evaluations on the real corpus print `NOT RUN` / `SKIPPED` and report no result.
- `node scripts/library/eval.js` prints `NOT RUN — prerequisite missing` and exits with code 2.
- `CHATWATER_LIBRARY_DIR=<folder>` points the app and tests at another library folder. To simulate a checkout without the library, point it at a folder that does not exist.

Outputs:

- `knowledge/library/manifest.json`: one entry per supplied file with title, publisher, date, **role** (team framework, methodology, guidance, regulation, derived synthesis, training example), language, stages, **review status**, caveats, extraction method and quality, input checksums, and relationships (near-duplicate, translation, synthesis of, part of).
- `knowledge/library/passages/<source>.json`: exact extracted text with locators (PDF page, slide, section). Contact details are redacted. Wording that looks like instructions is flagged and is only ever shown as quoted text.
- `frameworks/stage-guidance.json`: the team framework (Stages 2–4) as structured rows. It is guidance only; rules, calculations and storage do not read it.

Curation (in `scripts/library/sources.json`):

- Exact or near-duplicate passages are indexed once. The two GCF Part 3 files are near-duplicates, and the EN/ID climate-finance guidelines are translations, so neither pair counts as independent corroboration.
- The energy-efficiency synthesis is linked to its four slide decks. Its Appendix A qualifications travel with every passage they affect.
- Examples are training material. They do not establish current regulatory status or fund eligibility.
- The DAK drinking-water excerpt is local OCR of a document whose parent is unidentified. Its text has not been proofread.
- The "related websites" file is a link list. It is excluded, and its links are recorded in the manifest.

Each build has an ID (`lib-` plus a hash of the manifest and passage files), shown in `/api/health` and `/api/knowledge`. Generated outputs store it with what was searched, the retrieved passages (source ID, passage ID, locator, role) and the cited tags. Exports include these in `evidence/library-provenance.json`. Three checks are kept apart: a citation tag exists in the request; the passage shares words with the sentence; the passage actually supports the claim. Only the first two are automated. Word overlap is not verification.

To inspect retrieval, open `/api/knowledge/search?stage=2&q=pump efficiency`.

Evaluation (internal, not practitioner validation):

- `test/eval/chat-questions.json`: development set. The thresholds and EN↔ID glossary in `engine/library.js` were tuned on it.
- `test/eval/library-eval.json`: EN/ID paraphrases, custom-action descriptions, proposal sections, missing evidence, qualified guidance and training examples. `test/eval/library-eval-runs.json` keeps every recorded run. Only the first run ("before tuning") is a held-out result; heading fixes and scoping were then made while looking at these questions, so **every later run is a development result**.
- Annotation corrections are recorded in the file (`annotation_corrections`, with the original `expect_original`), and each run reports the result under both the corrected and the original annotation.
- `node scripts/library/eval.js` prints the scores; `--record LABEL` appends a run (labelled `development` after the first). `node test/run.js` runs both sets offline.

Re-check thresholds (`SCOPED_MIN_SHARE`, sector words), the glossary and `sector` tags when documents are added, and record a run on new questions before tuning on them.

Open decisions: whether the extracted library text (3.3 MB) may be committed, given the source licences; and review of the Bahasa Indonesia interface wording for the chat.

## What the drafts need most

Use this as a collection checklist. Each item is filled from `financing/`, `plan/` or `indonesia/`:

1. **Eligibility and requirements** for each funder you want to support (GCF, plus 1–2 others relevant to Indonesian water utilities)
2. **Co-financing** options and typical structures for PDAMs and local governments
3. **National alignment**: climate targets (NDC), water/sanitation targets and plans the proposal should refer to
4. **Regulations and approvals** a utility project needs: feasibility study, procurement, environmental permits
5. **Typical costs and durations** for the actions in stage 2: pump replacement, NRW programmes, scheduled desludging (LLTT) and IPLT, solar PV, biogas. Include the source year and currency.
6. **Indonesian case studies** of similar projects: what was done, cost, result, who funded it

## Prepared reproducible deployment release

The versioned, approval-gated GCF starter release is documented in [the preliminary concept handoff](../docs/gcf-preliminary-concept.md). It pins two verified guide files and a deterministic build ID/count lock; it does not imply that the larger local corpus is approved for deployment. `npm run build:library:release` requires a protected artifact descriptor and source-owner approval records. It never uses `~/Downloads`. The prepared Render build fails closed when these inputs are absent or mismatched. No source PDF, extracted text or credentials are tracked, and deployment/provisioning remains a separate authorized step.
