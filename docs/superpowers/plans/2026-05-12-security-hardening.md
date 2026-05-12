# Security Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove server-side eval risk, constrain GenLayer account selection, and prevent the browser extension from capturing sensitive form values.

**Architecture:** Keep changes localized to the two affected boundaries: GenLayer CLI output parsing/account config in `src/lib/genlayer-client.ts`, and DOM context capture in `extension/content.js`. Fail closed when CLI output cannot be safely parsed, and redact input values before they leave the page context.

**Tech Stack:** Next.js App Router, TypeScript, Node.js `child_process.execFile`, Chrome MV3 extension JavaScript.

---

## File Structure

- Modify `src/lib/genlayer-client.ts`: replace `Function()` parsing with safe JSON/object-literal normalization, and validate `GENLAYER_ACCOUNT_NAME`.
- Modify `extension/content.js`: redact sensitive active-element values and avoid reading freeform input values by default.
- Run `npm run lint` after implementation.

---

### Task 1: Replace unsafe CLI output eval

**Files:**
- Modify: `src/lib/genlayer-client.ts:121-186`

- [ ] **Step 1: Add safe literal parsing helpers**

In `src/lib/genlayer-client.ts`, replace the existing `parseObjectLiteral<T>()` implementation with helpers that never call `Function` or `eval`:

```ts
function quoteObjectKeys(value: string) {
  return value.replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*:)/g, '$1"$2"$3');
}

function normalizePythonJsonLiterals(value: string) {
  return value
    .replace(/\bNone\b/g, "null")
    .replace(/\bTrue\b/g, "true")
    .replace(/\bFalse\b/g, "false");
}

function parseObjectLiteral<T>(output: string): T {
  const raw = extractResultBlock(output);

  try {
    return JSON.parse(raw) as T;
  } catch {
    const normalized = quoteObjectKeys(normalizePythonJsonLiterals(raw));
    return JSON.parse(normalized) as T;
  }
}
```

- [ ] **Step 2: Confirm no dynamic code execution remains**

Run:

```powershell
git diff -- src/lib/genlayer-client.ts
```

Expected: `parseObjectLiteral` uses `JSON.parse`; no `Function(` or `eval(` remains.

---

### Task 2: Validate GenLayer account name

**Files:**
- Modify: `src/lib/genlayer-client.ts:106-108`

- [ ] **Step 1: Replace `getAccountName()` with strict validation**

In `src/lib/genlayer-client.ts`, replace `getAccountName()` with:

```ts
function getAccountName() {
  const accountName = process.env.GENLAYER_ACCOUNT_NAME?.trim() || "shieldtest";
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(accountName)) {
    throw new Error("GENLAYER_ACCOUNT_NAME must contain only letters, numbers, underscores, or hyphens.");
  }
  return accountName;
}
```

- [ ] **Step 2: Confirm the CLI invocation still receives one argument**

Inspect `submitVerdictRequest()` and keep this call unchanged:

```ts
await runGenLayerCommand(["account", "use", accountName]);
```

Expected: `accountName` is validated before this call and still passed via `execFile`, not shell concatenation.

---

### Task 3: Redact extension active-element capture

**Files:**
- Modify: `extension/content.js:11-28`

- [ ] **Step 1: Add active-element summarization helpers**

In `extension/content.js`, inside the IIFE and before `captureContext()`, add:

```js
  function getAttributeSummary(element) {
    const parts = [];
    const inputType = element.getAttribute("type");
    const name = element.getAttribute("name");
    const autocomplete = element.getAttribute("autocomplete");
    const placeholder = element.getAttribute("placeholder");

    if (inputType) {
      parts.push(`type=${inputType}`);
    }
    if (name) {
      parts.push(`name=${name.slice(0, 60)}`);
    }
    if (autocomplete) {
      parts.push(`autocomplete=${autocomplete.slice(0, 60)}`);
    }
    if (placeholder) {
      parts.push(`placeholder=${placeholder.slice(0, 80)}`);
    }

    return parts.length ? ` (${parts.join(", ")})` : "";
  }

  function summarizeActiveElement(activeElement) {
    if (!activeElement || !activeElement.tagName) {
      return "";
    }

    const activeTag = activeElement.tagName.toLowerCase();
    if (
      activeTag === "input" ||
      activeTag === "textarea" ||
      activeElement.isContentEditable
    ) {
      return `${activeTag}${getAttributeSummary(activeElement)}: [redacted]`;
    }

    return activeTag;
  }
```

- [ ] **Step 2: Use the redacted summary in `captureContext()`**

Replace the current `activeTag`, `activeValue`, and `activeElement` return logic with:

```js
    const activeElement = document.activeElement;

    return {
      pageUrl: location.href,
      pageOrigin: location.origin,
      pageTitle: document.title ?? "",
      selectedText: selection.slice(0, 500),
      activeElement: summarizeActiveElement(activeElement),
    };
```

Expected: no code reads `activeElement.value` anymore.

---

### Task 4: Verify the hardening changes

**Files:**
- Verify: `src/lib/genlayer-client.ts`
- Verify: `extension/content.js`

- [ ] **Step 1: Search for forbidden parser patterns**

Run:

```powershell
git grep -n "Function(\|eval(" -- src extension
```

Expected: no matches.

- [ ] **Step 2: Search for sensitive active element value capture**

Run:

```powershell
git grep -n "activeElement\.value" -- extension
```

Expected: no matches.

- [ ] **Step 3: Run lint**

Run:

```powershell
npm run lint
```

Expected: lint exits successfully.

- [ ] **Step 4: Review final diff**

Run:

```powershell
git diff -- src/lib/genlayer-client.ts extension/content.js
```

Expected: only the safe parser, account validation, and active-element redaction changes are present.
