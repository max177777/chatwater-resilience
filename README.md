# ChatWater Resilience

Web app that takes a water or wastewater utility from an **ECAM greenhouse-gas assessment** to **improvement options**, a **project plan** and a **financing proposal** (Word + ZIP). First release: Indonesia (Bahasa Indonesia / English).

Live: https://supermaxtest.com (Render)

| Stage | What the user does | What the app does |
|---|---|---|
| 1 Assess | Saves the utility profile once, enters ECAM data (or loads an ECAM file) | Runs the **original ECAM v3 formulas** live; shows results by stage and gas |
| 2 Identify actions | Picks a saved assessment, reviews options, adds notes | Rule-based options with numbers from ECAM outputs or ECAM re-runs; AI explains them |
| 3 Project plan | Edits owners and durations | Builds tasks and dependencies from `frameworks/project-plan.json`; drafts the summary |
| 4 Financing | Chooses General, Funding guide (upload PDF/Word) or GCF | Drafts each section of the chosen framework; exports Word and a ZIP of all files |

The ChatWater Help panel is available on every page. Chat, the plan summary and every proposal section retrieve passages from the knowledge base (`knowledge/`, plus ECAM's variable documentation) and must cite them as `[S1]`, `[S2]`. Utility numbers always come from the ECAM calculation; facts about Indonesia, funders and regulations must come from a cited document, otherwise the draft leaves a `[To be provided: …]` placeholder.

## How the ECAM calculation is reproduced

The ECAM v3 backend (`vendor/ecam/backend/*.js`, from [icra/ecam](https://github.com/icra/ecam) commit `3b6aab1`) is used **unmodified**:

- **Browser:** the same scripts load in the page (as in ECAM itself), so results update as you type.
- **Server:** `engine/ecam-engine.js` runs the same files inside a Node `vm` sandbox. Every number sent to the AI or written into exports is recalculated there.
- **Files:** values are stored in ECAM's own JSON format and base units, so files move both ways between this app and climatesmartwater.org/ecam.

`npm test` checks the engine against hand calculations of the IPCC equations: grid electricity, diesel engines, WWTP CH₄/N₂O, GWP switching, the desludging scenario, and stage sums.

Updating ECAM: copy a newer `backend/` and `languages/en.json` into `vendor/ecam/`, then run `npm run build:id` and `npm test`.

## Run locally

```bash
npm install
npm start                       # http://localhost:3000
ANTHROPIC_API_KEY=sk-... npm start   # with AI chat and drafting
npm test
```

Without `ANTHROPIC_API_KEY`, everything still works. Chat returns the matching ECAM guidance, and drafts use structured templates filled with the calculated numbers.

## Deploy on Render with supermaxtest.com

1. In Render, go to **New → Blueprint**, connect GitHub, and pick `max177777/chatwater-resilience`. `render.yaml` sets up the service.
2. When prompted, enter `ANTHROPIC_API_KEY` (optional; it can be added later under Environment).
3. Once deployed, open the service's **Settings → Custom Domains**. `supermaxtest.com` is already listed from the Blueprint.
4. At your domain registrar's DNS settings:
   - `A` record, host `@`, value `216.24.57.1`
   - `CNAME` record, host `www`, value `chatwater-resilience.onrender.com` (use the exact `.onrender.com` name Render shows)
   - Delete any `AAAA` records for the domain.
   - On Cloudflare, use a CNAME for `@` pointing to the `.onrender.com` name instead of the A record.
5. Click **Verify** in Render. HTTPS is issued automatically.

Every push to `main` redeploys. On the free plan the service sleeps after inactivity, so the first visit takes ~30 s.

## Where the team edits things

| You want to change… | Edit |
|---|---|
| Stage 2 rules and scenario assumptions | `engine/actions.js` (`RULES`, `ASSUMPTIONS`) |
| Project-plan phases, durations, owners | `frameworks/project-plan.json` |
| Proposal sections (General, GCF) | `frameworks/financing/*.json` — **`gcf.json` is a placeholder** built on the six GCF investment criteria; replace it with the 2024 GCF Water/Sanitation guideline framework |
| AI prompts | `frameworks/prompts/*.md` |
| Knowledge base (RAG) for chat, plan and proposal | Add PDF/Word/Markdown files to `knowledge/financing`, `knowledge/plan` or `knowledge/indonesia` — see [`knowledge/README.md`](knowledge/README.md). Check what was loaded at `/api/knowledge` |
| Interface text EN / ID | `public/js/i18n.js` |
| ECAM labels in Bahasa | `scripts/ecam-id-terms.json`, then run `npm run build:id` |

## Structure

```
server.js                 Express API + static hosting
engine/ecam-engine.js     ECAM in a Node sandbox: calculate, re-run scenarios
engine/actions.js         Stage 2 options
engine/plan.js            Stage 3 tasks
engine/proposal.js        AI drafting with template fallback
engine/export.js          Word (.docx) and ZIP
engine/knowledge.js       Knowledge base: reads knowledge/ (PDF, Word, MD), retrieval + citations
public/                   Front end (no build step)
vendor/ecam/              Unmodified ECAM v3 (CC BY-SA 4.0) — see NOTICE.md
```

## Known gaps in this first version

- Data is saved in the browser (localStorage), plus file download/upload. There are no user accounts or server database yet.
- ECAM's long explanations ("more info") are in English. All field labels, questions and options are in Bahasa.
- Stage 2 rules cover pumps, NRW, septic desludging, untreated discharge, biogas, diesel and solar. Sludge-management and reuse options are still to be added.
- The sample utility (`public/samples`) is hypothetical.

## License and attribution

ECAM is © ICRA, IWA and GIZ (WaCCliM project) and Cobalt Water, licensed CC BY-SA 4.0. This project redistributes it unmodified and is shared under the same license.
