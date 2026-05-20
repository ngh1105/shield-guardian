"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type { Address } from "viem";

import { ActivityHistory } from "@/features/shield/components/activity-history";
import { ConfirmationPanel } from "@/features/shield/components/confirmation-panel";
import { OverviewStats } from "@/features/shield/components/overview-stats";
import { VerdictPolicyActions } from "@/features/shield/components/verdict-policy-actions";
import {
  INITIAL_FORM,
  SHIELD_EXAMPLES,
} from "@/features/shield/data/examples";
import { parsePrefill } from "@/features/shield/lib/parse-prefill";
import { requestShieldVerdict } from "@/features/shield/lib/request-verdict";
import { usePolicyCourtActions } from "@/features/shield/lib/use-policy-court-actions";
import { useShieldVerdict } from "@/features/shield/lib/use-shield-verdict";
import styles from "@/features/shield/shield-page.module.css";
import type {
  ActionType,
  ShieldFormState,
  ShieldVerdictRequest,
  ShieldVerdictResponse,
  VerdictLabel,
} from "@/features/shield/types";
import { ConnectButton } from "@/features/wallet/connect-button";
import { useWallet } from "@/features/wallet/wallet-context";

const KERNEL_LOG = [
  "[KERNEL] interceptor online :: policy surface synchronized",
  "[KERNEL] threat feed delta :: 4 new phishing signatures indexed",
  "[SCAN] calldata trace sandbox ready for pre-execution simulation",
  "[STATUS] ready for interception",
];

const TRUST_SIGNALS = ["Audited by CertiK", "Reviewed with OpenZeppelin", "Policy Court Ready"];

const ARCHITECTURE_CARDS = [
  {
    title: "Pre-Execution Simulation",
    copy:
      "Inspect calldata, approvals, signer intent, and protocol host before the wallet prompt becomes final.",
  },
  {
    title: "Real-Time Threat Feeds",
    copy:
      "Continuously fuse malicious-domain patterns, suspicious spender intel, and wallet-specific anomalies.",
  },
  {
    title: "Coverage Mandate Engine",
    copy:
      "Attach verdict history, indemnity status, and post-incident policy review behind every protected action.",
  },
];

const POLICY_CONDITIONS = [
  "Protection applies only to scans executed through verified Shield Guardian interception flows.",
  "Safe and Weird verdicts become coverage candidates when the request includes a valid host, summary, and signal set.",
  "Abort recommendations override policy access when Hidden Drainer Logic or a phishing host pattern is detected.",
];

const READINESS_ITEMS = [
  {
    label: "Verification",
    value: "lint / build / extension / smoke",
    copy: "The demo has automated checks for the app, MV3 manifest, extension packaging, and API verdict packets.",
  },
  {
    label: "Fallback",
    value: "explicit demo mode",
    copy: "Demo mode only works when the server enables it and the client sends the demo header, so mock verdicts are never silent.",
  },
  {
    label: "Boundary",
    value: "no browser secrets",
    copy: "The extension never stores private keys, never signs transactions, and never calls the contract directly.",
  },
];

const COVERAGE_STEPS = [
  {
    title: "1. Protected scan",
    copy: "A wallet or extension action packet receives a verdict before the user signs.",
  },
  {
    title: "2. Challenge window",
    copy: "Safe and Weird verdicts carry enough metadata to be challenged or reviewed later by check id.",
  },
  {
    title: "3. Loss report",
    copy: "If a protected safe-pass action fails, the policy court can record a loss report and move it to payout review.",
  },
];

function verdictTone(verdict: VerdictLabel) {
  if (verdict === "SAFE") return styles.safe;
  if (verdict === "WEIRD") return styles.weird;
  if (verdict === "NOT_WORTH_IT") return styles.weird;
  return styles.dangerous;
}

function formatShortHash(value: string) {
  if (value.length <= 18) {
    return value;
  }

  return `${value.slice(0, 10)}...${value.slice(-6)}`;
}

function getProvenanceRows(result: ShieldVerdictResponse) {
  const provenance = result.provenance;
  if (!provenance) {
    return [];
  }

  return [
    {
      label: "Source",
      value: provenance.source === "genlayer" ? "GenLayer live" : "Demo/mock",
    },
    provenance.checkId
      ? { label: "Check ID", value: `#${provenance.checkId}` }
      : null,
    provenance.coverageStatus
      ? { label: "Coverage", value: provenance.coverageStatus }
      : null,
    provenance.contractAddress
      ? {
          label: "Contract",
          value: formatShortHash(provenance.contractAddress),
          title: provenance.contractAddress,
        }
      : null,
    provenance.transactionHash
      ? {
          label: "Tx",
          value: formatShortHash(provenance.transactionHash),
          title: provenance.transactionHash,
        }
      : null,
  ].filter((row): row is { label: string; value: string; title?: string } =>
    Boolean(row),
  );
}

export function ShieldPage() {
  const [form, setForm] = useState<ShieldFormState>(INITIAL_FORM);
  const [result, setResult] = useState<ShieldVerdictResponse | null>(null);
  const [error, setError] = useState("");
  const [demoMode, setDemoMode] = useState(false);
  const [isPending, startTransition] = useTransition();
  const lastMirroredResultKey = useRef<string | null>(null);
  const wallet = useWallet();
  const verdict = useShieldVerdict();
  const policyActions = usePolicyCourtActions({
    walletAddress: wallet.address,
    status: wallet.status,
    bumpInvalidation: wallet.bumpInvalidation,
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("prefill");
    if (!raw) return;
    const next = parsePrefill(raw);
    if (!next) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setForm(next);
    const url = new URL(window.location.href);
    url.searchParams.delete("prefill");
    window.history.replaceState({}, "", url.toString());
  }, []);

  const provenanceRows = result ? getProvenanceRows(result) : [];

  function updateField<Key extends keyof ShieldFormState>(
    key: Key,
    value: ShieldFormState[Key],
  ) {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function loadExample(values: ShieldFormState) {
    setForm(values);
    setError("");
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const payload: ShieldVerdictRequest = {
      actionType: form.actionType,
      protocol: form.protocol,
      website: form.website,
      summary: form.summary,
      rawSignals: form.rawSignals,
      assetValueUsd: Number(form.assetValueUsd || 0),
      gasCostUsd: Number(form.gasCostUsd || 0),
    };

    if (demoMode) {
      startTransition(async () => {
        try {
          const response = await requestShieldVerdict(payload, { demoMode: true });
          setResult(response);
          wallet.bumpInvalidation();
        } catch {
          setError(
            "Demo analysis unavailable. Confirm SHIELD_ENABLE_DEMO_MODE=1 on the server.",
          );
        }
      });
      return;
    }

    if (!wallet.address || wallet.status !== "connected") {
      setError("Connect your wallet to run a live verdict.");
      return;
    }

    await verdict.beginVerdict(payload);
  }

  async function handleConfirm() {
    if (!wallet.address) return;
    await verdict.confirmVerdict(wallet.address as Address);
  }

  useEffect(() => {
    if (verdict.state.phase === "done" && verdict.state.result) {
      const provenance = verdict.state.result.provenance;
      const resultKey =
        provenance?.transactionHash ??
        (provenance?.checkId
          ? `check:${provenance.checkId}`
          : JSON.stringify(verdict.state.result));
      if (lastMirroredResultKey.current === resultKey) {
        return;
      }
      lastMirroredResultKey.current = resultKey;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- mirror async verdict result into local state for canvas rendering
      setResult(verdict.state.result);
      wallet.bumpInvalidation();
    }
  }, [verdict.state.phase, verdict.state.result, wallet.bumpInvalidation]);

  return (
    <div className={styles.page}>
      <header className={styles.topbar}>
        <div className={styles.brand}>
          <div className={styles.brandMark}>SG</div>
          <div>
            <p>Shield Guardian</p>
            <span>Obsidian Sentinel Interface</span>
          </div>
        </div>
        <nav className={styles.nav}>
          <a href="#analysis">Analysis Engine</a>
          <a href="#history">Audit Trail</a>
          <a href="#coverage">Coverage Mandate</a>
          <a href="#readiness">Demo Readiness</a>
          <ConnectButton />
        </nav>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className={styles.kicker}>Wallet Defense Layer</p>
          <h1>Your Wallet&apos;s Kinetic Shield.</h1>
          <p className={styles.lede}>
            Intercept signatures, approvals, bridges, and claims before the user
            commits. Shield Guardian turns ambiguous onchain risk into an
            immediate verdict surface with policy-grade consequences.
          </p>

          <div className={styles.heroActions}>
            <a className={styles.primaryButton} href="#analysis">
              Protect Your Wallet
            </a>
            <a className={styles.secondaryButton} href="#coverage">
              Review Coverage Mandate
            </a>
          </div>

          <div className={styles.trustRow}>
            {TRUST_SIGNALS.map((signal) => (
              <div key={signal} className={styles.trustPill}>
                {signal}
              </div>
            ))}
          </div>
        </div>

        <div className={styles.heroVisual}>
          <div className={styles.scanFrame}>
            <div className={styles.scanHeader}>
              <span>INTERCEPTION / LIVE</span>
              <span>kernel-scan v2.4</span>
            </div>
            <div className={styles.scanGrid}>
              <div className={styles.scanCard}>
                <span className={styles.metricLabel}>Incoming action</span>
                <strong>Claim bonus drop</strong>
                <p>Retrodrop portal on unverified host</p>
              </div>
              <div className={styles.scanCard}>
                <span className={styles.metricLabel}>Interception state</span>
                <strong>Threat captured</strong>
                <p>Pre-execution simulation halted signer flow</p>
              </div>
            </div>
            <div className={styles.scanRail}>
              <div className={styles.scanBeam} />
              <div className={styles.scanNode} />
              <div className={styles.scanNode} />
              <div className={styles.scanNodeDanger} />
            </div>
            <div className={styles.threatPanel}>
              <div className={styles.threatBadge}>DANGEROUS</div>
              <div>
                <span className={styles.metricLabel}>Interception note</span>
                <p>Transaction intercepted before signer confirmation.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <p className={styles.kicker}>Autonomous Defense Architecture</p>
          <h2>Built for high-trust wallet decisions.</h2>
        </div>
        <div className={styles.architectureGrid}>
          {ARCHITECTURE_CARDS.map((card) => (
            <article key={card.title} className={styles.architectureCard}>
              <span className={styles.metricLabel}>Module</span>
              <h3>{card.title}</h3>
              <p>{card.copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.workspace} id="analysis">
        <div className={styles.sectionHead}>
          <p className={styles.kicker}>Action Analysis Engine</p>
          <h2>Mission control for pre-execution judgment.</h2>
        </div>

        <div className={styles.workspaceGrid}>
          <aside className={styles.inputPanel}>
            <div className={styles.panelHeader}>
              <div>
                <p className={styles.metricLabel}>Input Panel</p>
                <h3>Ready for Interception</h3>
              </div>
              <span className={styles.statusChip}>Armed</span>
            </div>

            <div className={styles.exampleRow}>
              {SHIELD_EXAMPLES.map((example) => (
                <button
                  key={example.name}
                  className={styles.exampleButton}
                  type="button"
                  onClick={() => loadExample(example.values)}
                >
                  <span>{example.name}</span>
                  <strong>{example.description}</strong>
                </button>
              ))}
            </div>

            <label className={styles.demoToggle}>
              <input
                checked={demoMode}
                type="checkbox"
                onChange={(event) => setDemoMode(event.target.checked)}
              />
              <span>
                <strong>Use demo mode</strong>
                Sends an explicit demo header. The server must also set
                SHIELD_ENABLE_DEMO_MODE=1, and mock verdicts are labeled in
                provenance.
              </span>
            </label>

            <form className={styles.form} onSubmit={handleSubmit}>
              <label>
                <span>Website URL</span>
                <input
                  value={form.website}
                  onChange={(event) => updateField("website", event.target.value)}
                  placeholder="https://app.uniswap.org"
                />
              </label>

              <div className={styles.formSplit}>
                <label>
                  <span>Protocol</span>
                  <input
                    value={form.protocol}
                    onChange={(event) => updateField("protocol", event.target.value)}
                    placeholder="Uniswap"
                  />
                </label>

                <label>
                  <span>Action Type</span>
                  <select
                    value={form.actionType}
                    onChange={(event) =>
                      updateField("actionType", event.target.value as ActionType)
                    }
                  >
                    <option value="sign">Sign Message</option>
                    <option value="approve">Approve</option>
                    <option value="bridge">Bridge</option>
                    <option value="claim">Claim</option>
                  </select>
                </label>
              </div>

              <label>
                <span>Action Summary</span>
                <textarea
                  rows={4}
                  value={form.summary}
                  onChange={(event) => updateField("summary", event.target.value)}
                  placeholder="Approve WETH to router for a 240 USD swap."
                />
              </label>

              <label>
                <span>Raw Signals</span>
                <textarea
                  rows={4}
                  value={form.rawSignals}
                  onChange={(event) => updateField("rawSignals", event.target.value)}
                  placeholder="spender visible, exact route, no custom route"
                />
              </label>

              <div className={styles.formSplit}>
                <label>
                  <span>Asset Value (USD)</span>
                  <input
                    value={form.assetValueUsd}
                    onChange={(event) =>
                      updateField("assetValueUsd", event.target.value)
                    }
                    placeholder="240"
                  />
                </label>

                <label>
                  <span>Gas Cost (USD)</span>
                  <input
                    value={form.gasCostUsd}
                    onChange={(event) => updateField("gasCostUsd", event.target.value)}
                    placeholder="3.5"
                  />
                </label>
              </div>

              {error ? <p className={styles.errorText}>{error}</p> : null}

              <div className={styles.formActions}>
                <button
                  className={styles.primaryButton}
                  disabled={
                    isPending ||
                    verdict.state.phase === "preflight" ||
                    verdict.state.phase === "signing" ||
                    verdict.state.phase === "awaiting-receipt"
                  }
                  type="submit"
                >
                  {isPending || verdict.state.phase === "preflight" || verdict.state.phase === "signing" || verdict.state.phase === "awaiting-receipt"
                    ? "Working with wallet..."
                    : "Run Analysis"}
                </button>
                <button
                  className={styles.secondaryButton}
                  type="button"
                  onClick={() => loadExample(INITIAL_FORM)}
                >
                  Reset Packet
                </button>
              </div>
            </form>
          </aside>

          <div className={styles.analysisCanvas}>
            <div className={styles.canvasHeader}>
              <div>
                <p className={styles.metricLabel}>Analysis Canvas</p>
                <h3>Verdict Result</h3>
              </div>
              <div
                className={`${styles.canvasBadge} ${result ? verdictTone(result.verdict) : ""}`}
              >
                {result ? result.verdict : "IDLE"}
              </div>
            </div>

            {verdict.state.phase === "preflight" ? (
              <p className={styles.metricLabel}>Confirming chain in your wallet...</p>
            ) : null}

            {verdict.state.phase === "awaiting-confirm" && verdict.state.request ? (
              <ConfirmationPanel
                walletAddress={wallet.address ?? ""}
                contractAddress={process.env.NEXT_PUBLIC_PHASE_B_CONTRACT ?? ""}
                request={verdict.state.request}
                busy={false}
                onConfirm={handleConfirm}
                onCancel={verdict.cancelVerdict}
              />
            ) : null}

            {verdict.state.phase === "signing" && verdict.state.request ? (
              <ConfirmationPanel
                walletAddress={wallet.address ?? ""}
                contractAddress={process.env.NEXT_PUBLIC_PHASE_B_CONTRACT ?? ""}
                request={verdict.state.request}
                busy
                onConfirm={() => undefined}
                onCancel={verdict.cancelVerdict}
              />
            ) : null}

            {verdict.state.phase === "awaiting-receipt" && verdict.state.request ? (
              <div className={styles.confirmationCard}>
                <p className={styles.metricLabel}>Waiting for consensus</p>
                <h3>Transaction broadcast</h3>
                <p>
                  GenLayer policy court is producing a verdict. This usually
                  takes a few seconds but can take up to two minutes on a
                  slow network.
                </p>
                {verdict.state.transactionHash ? (
                  <p className={styles.confirmationHint}>
                    Tx&nbsp;
                    <code>
                      {verdict.state.transactionHash.slice(0, 10)}...
                      {verdict.state.transactionHash.slice(-6)}
                    </code>
                  </p>
                ) : null}
              </div>
            ) : null}

            {verdict.state.phase === "error" ? (
              <p className={styles.errorText}>
                {verdict.state.error ?? "Verdict failed."}
              </p>
            ) : null}

            {result ? (
              <>
                <div className={styles.verdictHero}>
                  <div>
                    <p className={styles.metricLabel}>Risk level</p>
                    <h4 className={verdictTone(result.verdict)}>
                      {result.verdict}
                    </h4>
                  </div>
                  <div className={styles.scoreBlock}>
                    <span>Risk Score</span>
                    <strong>{result.riskScore}/100</strong>
                    <p>Confidence {result.confidence}%</p>
                  </div>
                </div>

                {provenanceRows.length ? (
                  <div className={styles.provenanceGrid}>
                    {provenanceRows.map((row) => (
                      <div
                        key={row.label}
                        className={styles.provenanceItem}
                      >
                        <span className={styles.metricLabel}>{row.label}</span>
                        <strong title={row.title}>{row.value}</strong>
                      </div>
                    ))}
                  </div>
                ) : null}

                <div className={styles.reasonBlock}>
                  <div className={styles.reasonHeader}>
                    <span className={styles.metricLabel}>Risk Signals</span>
                    <span className={styles.metricLabel}>
                      Coverage {result.coverageEligible ? "Eligible" : "Denied"}
                    </span>
                  </div>
                  <ul className={styles.reasonList}>
                    {result.reasons.map((reason) => (
                      <li key={reason} className={styles.reasonItem}>
                        {reason}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className={styles.briefingCard}>
                  <span className={styles.metricLabel}>Shield Briefing</span>
                  <p>{result.briefing}</p>
                </div>

                {result.provenance?.source === "genlayer" &&
                result.provenance.checkId ? (
                  <VerdictPolicyActions
                    actions={policyActions}
                    result={result}
                    walletAddress={wallet.address}
                    walletStatus={wallet.status}
                  />
                ) : null}

                <div className={styles.verdictActions}>
                  <button className={styles.abortButton} type="button">
                    Abort Transaction
                  </button>
                  <button className={styles.secondaryButton} type="button">
                    Proceed with Caution
                  </button>
                </div>
              </>
            ) : (
              <div className={styles.briefingCard}>
                <span className={styles.metricLabel}>Idle</span>
                <p>
                  Submit an action packet to receive a verdict from the
                  GenLayer policy court.
                </p>
              </div>
            )}

            <div className={styles.kernelLog}>
              <div className={styles.kernelHead}>
                <span>KERNEL LOG</span>
                <span>mission-control / live feed</span>
              </div>
              <div className={styles.kernelBody}>
                {KERNEL_LOG.map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.section} id="readiness">
        <div className={styles.sectionHead}>
          <p className={styles.kicker}>Demo Readiness</p>
          <h2>Built to survive a judging run.</h2>
        </div>

        <div className={styles.webOnlyNote}>
          This demo is web-first. The Chrome extension is optional bonus material
          and not required to demonstrate the product.
        </div>

        <div className={styles.readinessGrid}>
          {READINESS_ITEMS.map((item) => (
            <article key={item.label} className={styles.readinessCard}>
              <span className={styles.metricLabel}>{item.label}</span>
              <strong>{item.value}</strong>
              <p>{item.copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.section} id="history">
        <div className={styles.sectionHead}>
          <p className={styles.kicker}>Activity History</p>
          <h2>Dense, sortable security memory for every intercepted action.</h2>
        </div>

        <OverviewStats />

        <ActivityHistory actions={policyActions} />
      </section>

      <section className={styles.section} id="coverage">
        <div className={styles.sectionHead}>
          <p className={styles.kicker}>Coverage & Policy</p>
          <h2>Coverage Mandate</h2>
        </div>

        <div className={styles.coverageGrid}>
          <div className={styles.blueprintPanel}>
            <div className={styles.panelHeader}>
              <div>
                <p className={styles.metricLabel}>Smart Contract Indemnity</p>
                <h3>Blueprint of current protection</h3>
              </div>
              <span className={styles.statusChip}>Live</span>
            </div>
            <ul className={styles.checkList}>
              <li>Verified host matching and phishing-host rejection</li>
              <li>Pre-execution simulation before wallet confirmation</li>
              <li>Policy court handoff for challenge and post-loss review</li>
            </ul>
          </div>

          <div className={styles.conditionsCard}>
            <span className={styles.metricLabel}>Protection Conditions</span>
            <ol>
              {POLICY_CONDITIONS.map((condition) => (
                <li key={condition}>{condition}</li>
              ))}
            </ol>
          </div>

          <div className={styles.coverageFlowCard}>
            <span className={styles.metricLabel}>Challenge & Loss Flow</span>
            <div className={styles.coverageSteps}>
              {COVERAGE_STEPS.map((step) => (
                <article key={step.title}>
                  <strong>{step.title}</strong>
                  <p>{step.copy}</p>
                </article>
              ))}
            </div>
          </div>

          <div className={styles.docsCard}>
            <span className={styles.metricLabel}>Policy Deep Dive</span>
            <h3>Inspect indemnity logic, appeal flow, and economic conditions.</h3>
            <p>
              Open the technical mandate to inspect exact verdict thresholds,
              challenge semantics, and loss reporting policy.
            </p>
            <a className={styles.primaryButton} href="#analysis">
              Open Docs
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
