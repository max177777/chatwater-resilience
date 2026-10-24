# Bahasa Indonesia wording awaiting review (Silvia)

The participant interface shows no review annotations. This file lists where the
Indonesian wording lives so it can be reviewed in one pass. Machine keys (JSON keys,
CSV column names, ECAM variable codes, GWP report identifiers) are not translated.

| Area | File | Notes |
| --- | --- | --- |
| Interface labels, messages, empty states | `public/js/i18n.js` (`UI.id`) | Sections marked "perlu ditinjau Silvia" in code comments are the newest. |
| Team framework, Stage 2 rows and Stage 4 lists | `frameworks/stage-guidance.id.json` | Keyed by row id; arrays follow the English order. |
| Team framework, Stage 3 areas | `engine/plan-concept.js` (`TITLES_ID`, `GUIDE_ID`) | Areas 1, 4–8 have no Indonesian questions yet; chat shows the English questions marked as original text. |
| Calculated actions: titles, conditions, scenarios, calculation explanations (`basis_text`) | `engine/actions.js` | `basis` keeps the ECAM codes for traceability; it is shown separately as "Variabel ECAM yang digunakan". |
| Source review statuses, caveats, role notes, extraction notes, date notes, page references | `public/js/source-notes.js` | Source titles and quoted passages stay in their original language. |
| GWP report descriptions | `public/js/cw-core.js` (`GWP_NAMES`) | The ECAM identifier is kept in brackets. |
| Unit words | `public/js/cw-core.js` (`UNIT_WORDS_ID`) | Symbols (kWh, m3, kgCO2eq, L) are unchanged. |
| ECAM variable descriptions | `public/i18n/ecam.id.json` | All 447 descriptions translated; the 447 `_expla` help texts are not, and are shown in English with a label. |
| Export labels and ZIP README | `engine/export.js` (`T.id`, `ZIP_T.id`) | |
| Proposal and concept templates | `engine/proposal.js`, `engine/plan-concept.js` | |

## Still in English for Indonesian users

- ECAM help texts (`_expla`), labelled "Penjelasan ECAM, ditampilkan dalam bahasa Inggris aslinya".
- ECAM country names and option-table entries without an Indonesian entry in `ecam.id.json`.
- Library source titles, publishers and quoted passages (original language, by design).
- Substage names in the sample assessment ("Distribution network"), which are user data.
- Detail text of server errors, shown after the translated message and labelled as English.
- AI answers when AI is on follow the output language; template text is translated.
