// Static, best-effort 4-byte selector dictionary. Unknown selectors fall
// back to "sign" — see Phase C-2 design spec, "Verdict packet
// normalization → Decoded fields".
export const SELECTORS = Object.freeze({
  // ERC-20
  "0x095ea7b3": "approve",       // approve(address,uint256)
  "0xa9059cbb": "sign",          // transfer(address,uint256)
  "0x23b872dd": "sign",          // transferFrom(address,address,uint256)

  // Bridges (Hop, Across, Stargate, LayerZero)
  "0xeb672419": "bridge",        // sendToL2 (Hop)
  "0x7dc20382": "bridge",        // bridgeToken (Hop variant)
  "0x9a1d09c0": "bridge",        // depositV3 (Across)
  "0x9fbf10fc": "bridge",        // swap (Stargate)
  "0xc73f7c3a": "bridge",        // sendFrom (LayerZero OFT)

  // Claim / mint patterns
  "0x4e71d92d": "claim",         // claim()
  "0x379607f5": "claim",         // claim(uint256)
  "0xae169a50": "claim",         // claimReward
  "0x1249c58b": "claim",         // mint()
  "0x6a627842": "claim",         // mint(address)
  "0xa0712d68": "claim",         // mint(uint256)
});

export function actionTypeForSelector(selector) {
  if (typeof selector !== "string") return "sign";
  const normalized = selector.toLowerCase();
  return SELECTORS[normalized] ?? "sign";
}
