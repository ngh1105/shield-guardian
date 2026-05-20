import type { ShieldFormState } from "@/features/shield/types";

import { parsePrefill as parsePrefillImpl } from "./parse-prefill.mjs";

export function parsePrefill(rawParam: string | null): ShieldFormState | null {
  return parsePrefillImpl(rawParam) as ShieldFormState | null;
}
