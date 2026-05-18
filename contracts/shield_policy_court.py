# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

from dataclasses import dataclass
import typing
from urllib.parse import urlparse

from genlayer import *


@allow_storage
@dataclass
class ActionCheck:
    check_id: u32
    requester: Address
    claimed_requester: Address
    action_type: str
    protocol: str
    website: str
    summary: str
    raw_signals: str
    verdict: str
    risk_score_bps: u32
    confidence_bps: u32
    created_epoch: u32
    last_review_epoch: u32
    coverage_status: str
    loss_report_tx_hash: str
    note: str
    challenge_count: u32


class ShieldPolicyCourt(gl.Contract):
    current_epoch: u32
    next_check_id: u32
    checks: DynArray[ActionCheck]

    def __init__(self):
        self.current_epoch = u32(0)
        self.next_check_id = u32(1)

    @gl.public.write
    def submit_action_check(
        self,
        action_type: str,
        protocol: str,
        website: str,
        summary: str,
        raw_signals: str,
    ) -> u32:
        action_check = ActionCheck(
            check_id=self.next_check_id,
            requester=gl.message.sender_address,
            claimed_requester=gl.message.sender_address,
            action_type=action_type,
            protocol=protocol,
            website=website,
            summary=summary,
            raw_signals=raw_signals,
            verdict="pending",
            risk_score_bps=u32(0),
            confidence_bps=u32(0),
            created_epoch=self.current_epoch,
            last_review_epoch=self.current_epoch,
            coverage_status="none",
            loss_report_tx_hash="",
            note="Check submitted.",
            challenge_count=u32(0),
        )
        self.checks.append(action_check)

        check_id = self.next_check_id
        self.next_check_id += u32(1)
        self._resolve_check(len(self.checks) - 1)
        return check_id

    @gl.public.write
    def submit_action_check_for(
        self,
        claimed_requester: Address,
        action_type: str,
        protocol: str,
        website: str,
        summary: str,
        raw_signals: str,
    ) -> u32:
        action_check = ActionCheck(
            check_id=self.next_check_id,
            requester=gl.message.sender_address,
            claimed_requester=claimed_requester,
            action_type=action_type,
            protocol=protocol,
            website=website,
            summary=summary,
            raw_signals=raw_signals,
            verdict="pending",
            risk_score_bps=u32(0),
            confidence_bps=u32(0),
            created_epoch=self.current_epoch,
            last_review_epoch=self.current_epoch,
            coverage_status="none",
            loss_report_tx_hash="",
            note="Check submitted.",
            challenge_count=u32(0),
        )
        self.checks.append(action_check)

        check_id = self.next_check_id
        self.next_check_id += u32(1)
        self._resolve_check(len(self.checks) - 1)
        return check_id

    @gl.public.write
    def challenge_verdict(self, check_id: u32, rationale: str) -> None:
        check_index = self._find_check_index(check_id)
        check = self.checks[check_index]
        check.challenge_count += u32(1)
        check.coverage_status = "challenged"
        check.note = f"Verdict challenged and reopened: {rationale}"
        self._resolve_check(check_index)

    @gl.public.write
    def report_loss(self, check_id: u32, tx_hash: typing.Any, loss_summary: str) -> None:
        check_index = self._find_check_index(check_id)
        check = self.checks[check_index]
        tx_hash_text = self._normalize_tx_hash(tx_hash)

        if check.requester != gl.message.sender_address:
            raise gl.vm.UserError("Only the requester can report loss")
        if tx_hash_text == "":
            raise gl.vm.UserError("Transaction hash is required")

        check.loss_report_tx_hash = tx_hash_text

        if check.verdict == "safe":
            check.coverage_status = "payout_review"
            check.note = f"Loss reported for a safe-pass action: {loss_summary}"
        else:
            check.coverage_status = "denied"
            check.note = "Loss report denied because the original verdict was not safe."

    @gl.public.write
    def advance_epoch(self, steps: u32) -> None:
        self.current_epoch += steps

    @gl.public.view
    def get_check(self, check_id: u32) -> typing.Any:
        check_index = self._find_check_index(check_id)
        return self._check_to_dict(self.checks[check_index])

    @gl.public.view
    def get_safe_passes(self) -> typing.Any:
        safe_passes = []
        for check in self.checks:
            if check.verdict == "safe":
                safe_passes.append(self._check_to_dict(check))
        return safe_passes

    @gl.public.view
    def get_checks_for(self, claimed_requester: Address, limit: u32) -> typing.Any:
        results = []
        capped_limit = int(limit)
        if capped_limit <= 0:
            return results
        if capped_limit > 100:
            capped_limit = 100

        for index in range(len(self.checks) - 1, -1, -1):
            if len(results) >= capped_limit:
                break
            check = self.checks[index]
            if check.claimed_requester == claimed_requester:
                results.append(self._check_to_dict(check))

        return results

    @gl.public.view
    def get_overview(self) -> typing.Any:
        safe_count = 0
        weird_count = 0
        dangerous_count = 0
        for check in self.checks:
            if check.verdict == "safe":
                safe_count += 1
            elif check.verdict == "weird":
                weird_count += 1
            elif check.verdict == "dangerous":
                dangerous_count += 1

        return {
            "current_epoch": int(self.current_epoch),
            "check_count": len(self.checks),
            "safe": safe_count,
            "weird": weird_count,
            "dangerous": dangerous_count,
        }

    def _resolve_check(self, check_index: int) -> None:
        check = self.checks[check_index]
        memory_check = gl.storage.copy_to_memory(check)

        ai_verdict = self._judge_action(memory_check)
        heuristic_score = self._heuristic_score(memory_check)

        final_verdict = ai_verdict
        if heuristic_score >= 7400:
            final_verdict = "dangerous"
        elif heuristic_score >= 4500 and final_verdict == "safe":
            final_verdict = "weird"

        if memory_check.challenge_count > 0 and final_verdict == "safe":
            final_verdict = "weird"

        check.verdict = final_verdict
        check.risk_score_bps = u32(heuristic_score)
        check.confidence_bps = u32(self._confidence_from_score(heuristic_score))
        check.last_review_epoch = self.current_epoch
        check.coverage_status = self._derive_coverage_status(check, final_verdict)
        check.note = f"Resolved as {final_verdict}."

    def _judge_action(self, check: ActionCheck) -> str:
        def build_packet() -> str:
            fetched_context = ""
            if check.website != "":
                try:
                    response = gl.nondet.web.get(check.website)
                    fetched_context = response.body.decode("utf-8", errors="ignore")[:1800]
                except Exception as error:
                    fetched_context = f"FETCH_ERROR: {error}"

            return "\n".join(
                [
                    "SHIELD ACTION PACKET",
                    f"action_type: {check.action_type}",
                    f"protocol: {check.protocol}",
                    f"website: {check.website}",
                    f"summary: {check.summary}",
                    f"raw_signals: {check.raw_signals}",
                    f"challenge_count: {int(check.challenge_count)}",
                    "fetched_context:",
                    fetched_context,
                ]
            )

        verdict = gl.eq_principle.prompt_non_comparative(
            build_packet,
            task="""
Review the onchain action packet and return exactly one lowercase token:
safe
weird
dangerous
""",
            criteria="""
Output must be exactly one token from the allowed set.
Choose safe when the action appears standard, specific, and aligned with a credible host.
Choose weird when the action is not obviously malicious but has enough ambiguity that a wallet should escalate confirmation.
Choose dangerous when the action has strong phishing, approval-trap, or suspicious-domain signals.
No explanation. No punctuation. No extra text.
""",
        )
        return self._normalize_verdict(verdict)

    def _heuristic_score(self, check: ActionCheck) -> int:
        hostname = self._extract_hostname(check.website)
        combined_text = f"{check.website} {check.summary} {check.raw_signals}".lower()
        score = 2200

        if check.action_type not in ("sign", "approve", "bridge", "claim"):
            score += 2400
        if check.summary.strip() == "":
            score += 2200
        if hostname == "":
            score += 1800

        if hostname.endswith(".xyz") or hostname.endswith(".click"):
            score += 2800
        if "claim" in combined_text or "bonus" in combined_text:
            score += 1200
        if "wallet sync" in combined_text or "verify wallet" in combined_text:
            score += 1800
        if check.action_type == "approve" and (
            "unlimited" in combined_text or "max" in combined_text or "all" in combined_text
        ):
            score += 3000
        if check.action_type == "bridge" and (
            "discord" in combined_text or "custom route" in combined_text
        ):
            score += 2000

        if hostname in ("app.uniswap.org", "app.aave.com"):
            score -= 1400

        return self._clamp(score, 800, 9600)

    def _confidence_from_score(self, score: int) -> int:
        return self._clamp(6200 + score // 3, 6200, 9700)

    def _check_to_dict(self, check: ActionCheck) -> typing.Any:
        return {
            "check_id": int(check.check_id),
            "requester": str(check.requester),
            "claimed_requester": str(check.claimed_requester),
            "action_type": check.action_type,
            "protocol": check.protocol,
            "website": check.website,
            "summary": check.summary,
            "raw_signals": check.raw_signals,
            "verdict": check.verdict,
            "risk_score_bps": int(check.risk_score_bps),
            "confidence_bps": int(check.confidence_bps),
            "created_epoch": int(check.created_epoch),
            "last_review_epoch": int(check.last_review_epoch),
            "coverage_status": check.coverage_status,
            "loss_report_tx_hash": check.loss_report_tx_hash,
            "note": check.note,
            "challenge_count": int(check.challenge_count),
            "challenges": [],
        }

    def _find_check_index(self, check_id: u32) -> int:
        for index, check in enumerate(self.checks):
            if check.check_id == check_id:
                return index
        raise gl.vm.UserError("Check not found")

    def _normalize_verdict(self, verdict: str) -> str:
        cleaned = verdict.strip().lower()
        if cleaned == "safe":
            return "safe"
        if cleaned == "dangerous":
            return "dangerous"
        return "weird"

    def _normalize_tx_hash(self, tx_hash: typing.Any) -> str:
        if isinstance(tx_hash, int):
            return hex(tx_hash)
        return str(tx_hash).strip()

    def _derive_coverage_status(self, check: ActionCheck, final_verdict: str) -> str:
        if check.coverage_status == "payout_review":
            return "payout_review"
        if check.coverage_status == "denied":
            return "denied"
        if check.challenge_count > 0 and final_verdict in ("safe", "weird"):
            return "challenged"
        if final_verdict in ("safe", "weird"):
            return "eligible"
        return "none"

    def _extract_hostname(self, website: str) -> str:
        candidate = website.strip().lower()
        if candidate == "":
            return ""

        if "://" not in candidate:
            candidate = f"https://{candidate}"

        try:
            hostname = urlparse(candidate).hostname
            return hostname.lower() if hostname is not None else ""
        except Exception:
            return ""

    def _clamp(self, value: int, minimum: int, maximum: int) -> int:
        if value < minimum:
            return minimum
        if value > maximum:
            return maximum
        return value
