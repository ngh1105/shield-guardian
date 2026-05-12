import type {
  ShieldVerdictRequest,
  ShieldVerdictResponse,
} from "@/features/shield/types";

export async function requestShieldVerdict(
  payload: ShieldVerdictRequest,
  options: { demoMode?: boolean } = {},
): Promise<ShieldVerdictResponse> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (options.demoMode) {
    headers["x-shield-demo-mode"] = "1";
  }

  const response = await fetch("/api/verdict", {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error("Verdict API failed");
  }

  const data = (await response.json()) as { verdict: ShieldVerdictResponse };
  return data.verdict;
}
