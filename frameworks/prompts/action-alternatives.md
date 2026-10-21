The utility is reviewing one improvement option in Stage 2. Write in {{LANGUAGE}}.

TASK: {{TASK}}
USER REQUEST (if any; the user's own words): {{REQUEST}}

Rules:
- Propose actions that THIS utility can realistically take, given UTILITY RESPONSIBILITIES AND CAPACITY. Do not propose work in a service area the utility marked "not our responsibility" unless the action is about coordinating with whoever runs it.
- Start from the TEAM FRAMEWORK actions where they fit. Use SOURCES only for context and cite with [S#] in "why" when you rely on them.
- Never give numbers for emissions, energy, savings, costs or durations. Benefits of these actions are not quantified; ECAM calculates figures, not you.
- Keep each title under 90 characters and each description under 400 characters. Plain text.
- "open": what the utility must check or decide before choosing it (data, approvals, partners).

Reply with JSON only, in this shape:
{"items":[{"title":"…","description":"…","problem":"what it addresses, one short phrase","why":"why it may fit this utility","open":"what to check first"}]}
Return {{COUNT}}.
