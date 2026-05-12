import type { ShieldFormState } from "@/features/shield/types";

export const SHIELD_EXAMPLES: Array<{
  name: string;
  description: string;
  values: ShieldFormState;
}> = [
  {
    name: "Safe Swap",
    description: "Approve WETH for a normal swap on a trusted host.",
    values: {
      actionType: "approve",
      protocol: "Uniswap",
      website: "https://app.uniswap.org",
      summary: "Approve WETH to Uniswap router for a 240 USD swap.",
      rawSignals: "Exact spender is visible, router path is standard, no custom route.",
      assetValueUsd: "240",
      gasCostUsd: "3.5",
    },
  },
  {
    name: "Weird Bridge",
    description: "Bridge through a suspicious route shared in Discord.",
    values: {
      actionType: "bridge",
      protocol: "Unknown bridge",
      website: "https://bridge-preview.app",
      summary: "Bridge ETH from Base to Arbitrum through a custom route shared in Discord.",
      rawSignals: "Experimental route, low liquidity, beta status, manual route.",
      assetValueUsd: "500",
      gasCostUsd: "9",
    },
  },
  {
    name: "Bad Claim",
    description: "Claim a phishing-style airdrop.",
    values: {
      actionType: "claim",
      protocol: "Retrodrop portal",
      website: "https://claim-now-bonus.xyz",
      summary: "Claim bonus retrodrop and verify wallet before revealing the amount.",
      rawSignals: "Free mint, verify wallet, claim now, sync wallet, connect first.",
      assetValueUsd: "65",
      gasCostUsd: "14",
    },
  },
];

export const INITIAL_FORM: ShieldFormState = SHIELD_EXAMPLES[0].values;
