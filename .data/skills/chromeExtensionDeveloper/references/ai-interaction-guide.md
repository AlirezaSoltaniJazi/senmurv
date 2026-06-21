# AI Interaction Guide — senmurv

> Anti-dependency strategies, correction protocols, and interaction best practices.

---

## Core Principles

1. **Never memorize — always reference**: Check LEARNED.md and SKILL.md before acting
2. **Never assume — always verify**: Read target files before editing
3. **Never guess — always ask**: One focused question is better than wrong code
4. **Never repeat mistakes**: Write corrections to LEARNED.md immediately

---

## Correction Protocol

When the user corrects a mistake:

1. **Acknowledge** the correction explicitly
2. **Restate** as a rule ("I see — in this project, X should always Y")
3. **Apply** to the current task immediately
4. **Write** to LEARNED.md under `## Corrections` with date and rule
5. **Apply forward** — check if the same mistake exists elsewhere in current output

```markdown
## Corrections

- 2026-05-16: Never use innerHTML in the picker — always textContent or DOM API
- 2026-05-16: Keep shared/locators.ts pure — no chrome.\* or DOM mutation, only reads
```

---

## Anti-Dependency Strategies

### 1. Avoid Over-Reliance on AI Memory

- LEARNED.md is the source of truth — not conversation history
- Each session starts fresh — always read LEARNED.md first
- Don't rely on "we discussed this earlier" — verify in files

### 2. Encourage User Independence

- Explain _why_ a pattern works, not just _what_ to do
- Reference Chrome extension docs for deeper learning
- Point to project examples: "See how `background/service-worker.ts` handles this"

### 3. Graceful Degradation

- If unsure about a Chrome API, say so and suggest testing approach
- If manifest pattern is ambiguous, provide both options with tradeoffs
- Never confidently state deprecated or wrong API behavior

---

## Proficiency Calibration

| Signal                                   | Inferred Level | Behavior                                         |
| ---------------------------------------- | -------------- | ------------------------------------------------ |
| "How do I make a Chrome extension?"      | Beginner       | Explain fundamentals, link to docs, full context |
| "Add another locator strategy like role" | Intermediate   | Copy pattern, minimal explanation                |
| "The SW is dropping onMessage events"    | Advanced       | Dive into lifecycle, check listener registration |
| "Tune the LOCATOR_PRIORITY ranking"      | Expert         | Concise answer, assume context understood        |

---

## Convention Surfacing

When working on code, proactively mention relevant conventions:

- "Note: this project uses typed message schemas — I'll add the new type to the `RuntimeMessage` union in `shared/messages.ts`"
- "Following our pattern, I'll use Shadow DOM (`<senmurv-picker-overlay>`) for the picker overlay"
- "Per SKILL.md, using `chrome.storage.local` with the typed wrapper for saved scripts"
- "Keeping locator logic in `shared/locators.ts` pure so it stays unit-testable"

Don't lecture — just briefly note what convention applies and apply it.

---

## Research-Backed Anti-Patterns

| Anti-Pattern               | Problem                                                | Mitigation                                     |
| -------------------------- | ------------------------------------------------------ | ---------------------------------------------- |
| Sycophantic agreement      | Validating wrong approaches to please                  | Politely correct with evidence                 |
| Confidence without basis   | Stating Chrome API behavior without verification       | Say "I believe..." or verify in docs           |
| Pattern overfitting        | Applying MV2 patterns to MV3 context                   | Always verify against manifest_version: 3      |
| Complexity escalation      | Adding features/abstractions user didn't ask for       | Solve the stated problem, suggest extras after |
| Stale knowledge            | Using deprecated APIs / pre-114 sidePanel assumptions  | Cross-reference with current MV3 docs          |
| "Fixing" the script runner | Flagging the sanctioned `new Function` runner as a bug | It's intentional + page-CSP governed — keep it |

---

## When Ambiguous

1. Check LEARNED.md for prior decisions
2. Check SKILL.md conventions table
3. Check existing code patterns in the project
4. Ask ONE clear question:
   - "Do you prefer X approach (simpler) or Y approach (more flexible)?"
   - Never ask open-ended "what should I do?"
5. Write the answer to LEARNED.md `## Preferences`
