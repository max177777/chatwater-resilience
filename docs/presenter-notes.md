# Presenter notes: ChatWater Resilience prototype

Everything shown uses **Utility A (hypothetical)**, a synthetic sample. It contains no real utility data.

## Before the session

- Run `npm start` **without** an API key. The header chip should read "AI drafting: off (templates)". Do not set a key for the demo, because paid API calls have not been authorised.
- Open a fresh browser profile, or clear site data for the app, so no earlier assessments appear in the list.
- Open the app at `http://localhost:3000` (or whatever `PORT` is set to).

## What currently works

- **Assess (Stage 1):** loads the sample or an ECAM file, edits inputs, and calculates emissions and energy with the unmodified ECAM v3 code. "Save ECAM file" writes a file that ECAM itself can open.
- **Identify actions (Stage 2):** suggests options from rule-based checks, such as low pump efficiency or septic tanks that are never emptied. Where possible it re-runs ECAM to estimate the effect. Each option shows its calculation basis and a decision condition.
- **Project plan (Stage 3):** builds a task list from the selected actions. Owners, durations and the summary can be edited.
- **Financing (Stage 4):** produces a sectioned draft for a general proposal route. Sections are editable and exports go to Word or a ZIP. The ZIP holds the Word file, an ECAM-format file, results as JSON and CSV, the actions and the plan.
- **Saved work and freshness:** work is saved in the browser and survives a refresh. Editing an earlier stage marks later outputs as outdated instead of silently changing them, and outdated exports are refused.
- **English and Bahasa Indonesia:** documents stay in the language they were generated in.

## Preliminary or unverified

- **AI drafting is off.** All plan and proposal text is structured template output, labelled "Template — not AI-generated" in the app and stated in the Word file. AI-drafted text has not been reviewed for quality.
- **Supporting evidence is thin.** The knowledge base holds only ChatWater's ECAM method notes. No financing, Indonesian regulation or project-planning documents have been added yet, so drafts cite nothing on funders, costs or timelines. Any "Related reading" links point to the ECAM notes and are not citations.
- **Scientific outputs are unvalidated.** ECAM figures come from the ECAM v3 code. The Stage 2 rules, their scenario assumptions (for example the 33% desludging rate) and the reduction estimates have not been reviewed by a domain expert. Treat every number as indicative. The desludging estimate excludes emissions from treating the emptied sludge.
- **Plan durations and owners are generic defaults**, not based on Indonesian procurement or permitting practice.
- **The Bahasa wording** has not yet been reviewed by a native speaker.
- **Not part of the demo:** the "Tailored to a funding guide" route and the AI chat. Without AI, the chat only returns matching ECAM-note passages.

## Demonstration sequence (about 10 minutes)

1. **Assess:** choose "Load sample utility" and point out the "hypothetical" label in the banner and the name. Show the results chart, where onsite sanitation is about 91% of emissions.
2. **Identify actions:** select A01 (scheduled desludging) and A02 (pump upgrade). Show the calculation basis, the decision conditions and the disabled "Explain with AI" button. Save the actions.
3. **Project plan:** generate the plan. Point out the AI-off and limited-evidence notices. Edit the summary and one task owner, then save.
4. **Financing:** keep the general route and generate the draft. Show the template badges, note that the project summary reuses the edited plan summary, and point out the `[To be completed]` placeholders.
5. Download the Word file and the ZIP, and open both briefly.
6. Refresh the browser and show that the edits and the draft are still there.
7. Optionally, change one Stage 1 input to show the outdated warnings on later stages. Undo the change afterwards.

## Questions for feedback

**Usability**
- Was the four-stage flow clear? Where did you hesitate?
- Are the outdated warnings understandable, and is regenerating easy enough?

**Required inputs**
- Which ECAM inputs would your utility find hard to provide? What would you need help estimating?
- What else should the tool ask for, such as costs, existing projects or constraints?

**Useful outputs**
- Which outputs would you actually use: the Word draft, the plan CSV, the ECAM file?
- Which proposal sections matter most to funders you work with? Which funding routes or templates should come first?

**Supporting evidence**
- Which documents should the knowledge base include first: funder guidelines, Indonesian regulations, cost references, case studies?
- Who can review the Stage 2 rules and assumptions, and what evidence would make you trust the estimates?
- How should the tool show uncertainty in its numbers?
