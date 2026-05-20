"use client";

import { useEffect, useState } from "react";

import type { GenLayerCheck } from "@/lib/genlayer/types";

export type OverviewSnapshot = {
  current_epoch: number;
  check_count: number;
  safe: number;
  weird: number;
  dangerous: number;
};

export type CheckRow = {
  checkId: number;
  verdict: "SAFE" | "WEIRD" | "DANGEROUS";
  rawVerdict: "safe" | "weird" | "dangerous";
  protocol: string;
  actionType: string;
  summary: string;
  website: string;
  createdEpoch: number;
  requester: string;
  claimedRequester: string;
  coverageStatus: string;
  lossReportTxHash: string;
  note: string;
  challengeCount: number;
};

type FetchState<T> = {
  data: T | null;
  error: string | null;
  loading: boolean;
};

function mapVerdict(value: GenLayerCheck["verdict"]): CheckRow["verdict"] {
  if (value === "safe") return "SAFE";
  if (value === "dangerous") return "DANGEROUS";
  return "WEIRD";
}

function mapCheckRow(check: GenLayerCheck): CheckRow {
  return {
    checkId: check.check_id,
    verdict: mapVerdict(check.verdict),
    rawVerdict: check.verdict,
    protocol: check.protocol || "Unknown",
    actionType: check.action_type,
    summary: check.summary,
    website: check.website,
    createdEpoch: check.created_epoch,
    requester: check.requester,
    claimedRequester: check.claimed_requester,
    coverageStatus: check.coverage_status,
    lossReportTxHash: check.loss_report_tx_hash,
    note: check.note,
    challengeCount: check.challenge_count,
  };
}

export async function fetchOverview(): Promise<OverviewSnapshot> {
  const response = await fetch("/api/overview");
  if (!response.ok) {
    throw new Error(`Overview request failed: ${response.status}`);
  }
  const body = (await response.json()) as { overview: OverviewSnapshot };
  return body.overview;
}

export async function fetchMyChecks(
  address: string,
  limit: number,
): Promise<CheckRow[]> {
  const response = await fetch(
    `/api/checks?address=${encodeURIComponent(address)}&limit=${limit}`,
  );
  if (!response.ok) {
    throw new Error(`Checks request failed: ${response.status}`);
  }
  const body = (await response.json()) as { checks: GenLayerCheck[] };
  return body.checks.map(mapCheckRow);
}

export function useOverview(invalidationKey: number): FetchState<OverviewSnapshot> {
  const [state, setState] = useState<FetchState<OverviewSnapshot>>({
    data: null,
    error: null,
    loading: true,
  });

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- show loading state on each refetch
    setState((current) => ({ ...current, loading: true }));
    fetchOverview()
      .then((data) => {
        if (cancelled) return;
        setState({ data, error: null, loading: false });
      })
      .catch((error) => {
        if (cancelled) return;
        setState({
          data: null,
          error: error instanceof Error ? error.message : "Overview failed.",
          loading: false,
        });
      });
    return () => {
      cancelled = true;
    };
  }, [invalidationKey]);

  return state;
}

export function useMyChecks(
  address: string | null,
  invalidationKey: number,
): FetchState<CheckRow[]> {
  const [state, setState] = useState<FetchState<CheckRow[]>>({
    data: null,
    error: null,
    loading: false,
  });

  useEffect(() => {
    if (!address) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clear stale data when address detaches
      setState({ data: null, error: null, loading: false });
      return;
    }

    let cancelled = false;
    setState((current) => ({ ...current, loading: true }));
    fetchMyChecks(address, 20)
      .then((data) => {
        if (cancelled) return;
        setState({ data, error: null, loading: false });
      })
      .catch((error) => {
        if (cancelled) return;
        setState({
          data: null,
          error: error instanceof Error ? error.message : "Checks failed.",
          loading: false,
        });
      });
    return () => {
      cancelled = true;
    };
  }, [address, invalidationKey]);

  return state;
}
