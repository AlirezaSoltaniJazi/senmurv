# TypeScript Code Style — senmurv

> Import order, TypeScript conventions, naming, and formatting rules with full examples.

---

## Import Order

Four groups, separated by blank lines. Auto-sorted within each group:

```typescript
// 1. Node/Chrome built-ins (rare in extension code)
import type { Runtime } from 'chrome';

// 2. External packages
import { crx } from '@crxjs/vite-plugin';

// 3. Path alias imports (@/)
import { sendRuntimeMessage } from '@/shared/messages';
import { buildLocatorSet } from '@/shared/locators';
import type { SavedScript, LocatorSuggestion } from '@/shared/types';
import { MESSAGE_TYPES, STORAGE_KEYS } from '@/shared/constants';

// 4. Relative imports (only within same feature directory)
import { ScriptsTab } from './components/ScriptsTab';
```

**Rules**:

- `@/` maps to `src/` — use for all cross-directory imports
- Relative imports (`./`) only within the same feature directory
- Never deep relative imports (`../../`) — use `@/` alias
- Type-only imports use `import type { X }` — never mix value and type imports
- Never use wildcard imports (`import * as X`)

---

## TypeScript Strictness

`tsconfig.json` must include:

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "forceConsistentCasingInFileNames": true,
    "exactOptionalPropertyTypes": true
  }
}
```

---

## Type Patterns

```typescript
// ✅ Correct — explicit return types on exports
export async function getScripts(): Promise<SavedScript[]> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.SCRIPTS);
  return result[STORAGE_KEYS.SCRIPTS] ?? [];
}

// ✅ Correct — discriminated union for messages
export interface RunScriptMessage {
  type: 'RUN_SCRIPT';
  payload: { code: string };
}

// ✅ Correct — result type for fallible operations (the project's actual shape,
// src/shared/types.ts)
export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

// ❌ Wrong — any type
function handleMessage(message: any): any { ... }

// ❌ Wrong — no return type on export
export async function getScripts() { ... }

// ❌ Wrong — non-discriminated union
type Message = { script?: SavedScript; scriptId?: string; status?: string };
```

---

## Naming Conventions

| Category           | Style                   | Examples                                                  |
| ------------------ | ----------------------- | --------------------------------------------------------- |
| Files (modules)    | `kebab-case.ts`         | `faker-data.ts`, `cookie-url.ts`, `service-worker.ts`     |
| Files (components) | `PascalCase.tsx`        | `GenerateDataTab.tsx`, `LocatorTab.tsx`, `ScriptsTab.tsx` |
| Interfaces         | `PascalCase`            | `SavedScript`, `GeneratedData`, `LocatorSuggestion`       |
| Type aliases       | `PascalCase`            | `Locale`, `LocatorStrategy`, `MessageType`                |
| Enums              | `PascalCase`            | rarely used — prefer `as const` unions                    |
| Enum values        | `SCREAMING_SNAKE`       | when an enum is needed, `SCREAMING_SNAKE` members         |
| Functions          | `camelCase`             | `generateTestData`, `handleMessage`, `buildLocatorSet`    |
| Private funcs      | `camelCase` (no prefix) | Internal to module — not exported = private               |
| Constants          | `SCREAMING_SNAKE_CASE`  | `STORAGE_KEYS`, `MESSAGE_TYPES`, `LOCATOR_PRIORITY`       |
| Variables          | `camelCase`             | `scriptCount`, `isPicking`, `currentTab`                  |
| Boolean vars       | `is/has/should` prefix  | `isPicking`, `hasTabId`, `shouldHighlight`                |

---

## Export Style

```typescript
// ✅ Correct — named exports
export function saveScript(input: SavedScriptInput): Promise<Result<SavedScript>> { ... }
export type { SavedScript, LocatorSuggestion };
export { STORAGE_KEYS, MESSAGE_TYPES };

// ❌ Wrong — default exports
export default function saveScript() { ... }
export default class ScriptStore { ... }
```

---

## Error Handling

```typescript
// ✅ Correct — Result type, specific errors
export async function saveScript(
  input: SavedScriptInput,
): Promise<Result<SavedScript>> {
  try {
    const scripts = await getScripts();

    if (!input.name.trim()) {
      return { ok: false, error: 'Script name is required' };
    }

    const newScript: SavedScript = { id: newId('scr_'), ...input };
    await saveScripts([...scripts, newScript]);
    return { ok: true, value: newScript };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ❌ Wrong — throwing for expected failures
export async function saveScript(input: SavedScriptInput): Promise<SavedScript> {
  if (!input.name.trim()) {
    throw new Error('Name required'); // DON'T THROW
  }
  ...
}
```

---

## File Organization

Each module follows this structure:

```typescript
/**
 * One-line module description.
 */

// Type imports
import type { SavedScript, Result } from '@/shared/types';

// Value imports
import { STORAGE_KEYS } from '@/shared/constants';
import { newId } from '@/utils/id';

// Constants
const MAX_SCRIPT_BYTES = 64 * 1024;

// Types (local to this module)
interface ScriptStoreState {
  scripts: SavedScript[];
  loading: boolean;
}

// Exported functions (public API)
export async function saveScript(input: SavedScriptInput): Promise<Result<SavedScript>> {
  ...
}

export async function deleteScript(scriptId: string): Promise<Result<void>> {
  ...
}

// Internal helpers (not exported)
function validateScript(input: SavedScriptInput): string | null {
  ...
}
```

---

## Formatting (Prettier)

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "es5",
  "printWidth": 100,
  "tabWidth": 2,
  "arrowParens": "always"
}
```
