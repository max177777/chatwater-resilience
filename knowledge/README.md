# ChatWater knowledge base: how to add documents

The documents in this folder are what the AI is allowed to cite. They are used by:

- the **ChatWater Help** chat
- **Explain with AI** (stage 2)
- the **project summary** (stage 3)
- **every proposal section** (stage 4)

The AI is told to state facts about Indonesia, funders, regulations, costs and programmes **only if they appear in these documents**, and to cite them as `[S1]`, `[S2]`. Anything not covered becomes a `[To be provided: …]` placeholder. So the better this folder is, the more of each draft is filled with real, sourced information.

Utility numbers (emissions, energy, savings) never come from here. They always come from the ECAM calculation.

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

## What the drafts need most

Use this as a collection checklist. Each item is filled from `financing/`, `plan/` or `indonesia/`:

1. **Eligibility and requirements** for each funder you want to support (GCF, plus 1–2 others relevant to Indonesian water utilities)
2. **Co-financing** options and typical structures for PDAMs and local governments
3. **National alignment**: climate targets (NDC), water/sanitation targets and plans the proposal should refer to
4. **Regulations and approvals** a utility project needs: feasibility study, procurement, environmental permits
5. **Typical costs and durations** for the actions in stage 2: pump replacement, NRW programmes, scheduled desludging (LLTT) and IPLT, solar PV, biogas. Include the source year and currency.
6. **Indonesian case studies** of similar projects: what was done, cost, result, who funded it
