"use client";

import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { useEffect, useMemo, useState } from "react";

import { useGovernor } from "@karn_lat/protocol-sdk-solana/react";

import styles from "./karn.module.css";

type ActionKind =
  | "pause_credit"
  | "resume_credit"
  | "treasury_transfer"
  | "fund_lab"
  | "approve_scholarship";

type LoadedProposal = {
  id: number;
  proposal: {
    description: string;
    forVotes: { toString(): string };
    againstVotes: { toString(): string };
  };
  state: string;
};

function buildAction(kind: ActionKind, fields: Record<string, string>) {
  switch (kind) {
    case "pause_credit":
      return { valocracyPauseCredit: {} } as any;
    case "resume_credit":
      return { valocracyResumeCredit: {} } as any;
    case "treasury_transfer":
      return {
        treasuryTransfer: {
          receiver: fields.receiver ? new PublicKey(fields.receiver) : PublicKey.default,
          amount: new anchor.BN(fields.amount || "0"),
        },
      } as any;
    case "fund_lab":
      return {
        treasuryFundLab: {
          totalAmount: new anchor.BN(fields.totalAmount || "0"),
          scholarshipPerMember: new anchor.BN(fields.scholarshipPerMember || "0"),
        },
      } as any;
    case "approve_scholarship":
      return {
        treasuryApproveScholarship: {
          labId: Number(fields.labId || "0"),
          member: fields.member ? new PublicKey(fields.member) : PublicKey.default,
        },
      } as any;
  }
}

function stateClass(state: string) {
  const s = state.toLowerCase();
  if (s.includes("pending")) return styles.proposalStatePending;
  if (s.includes("active")) return styles.proposalStateActive;
  if (s.includes("succeed")) return styles.proposalStateSucceeded;
  if (s.includes("defeat")) return styles.proposalStateDefeated;
  if (s.includes("executed")) return styles.proposalStateExecuted;
  return "";
}

export function ProposalsPanel() {
  const { config, propose, vote, execute, getProposal, computeProposalState, refresh } = useGovernor();
  const [actionKind, setActionKind] = useState<ActionKind>("pause_credit");
  const [description, setDescription] = useState("Pause activity credit while governance recalibrates.");
  const [fields, setFields] = useState<Record<string, string>>({
    receiver: "",
    amount: "1000",
    totalAmount: "500000",
    scholarshipPerMember: "100000",
    labId: "0",
    member: "",
    receiverAta: "",
    vaultAta: "",
  });
  const [proposalId, setProposalId] = useState("0");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<LoadedProposal[]>([]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const load = async () => {
      if (!config) return;
      const count = Number(config.proposalCount.toString());
      const ids = Array.from({ length: count }, (_, idx) => idx).reverse().slice(0, 5);
      const proposals = await Promise.all(
        ids.map(async (id) => {
          const proposal = await getProposal(id);
          if (!proposal) return null;
          return {
            id,
            proposal,
            state: computeProposalState(proposal),
          };
        }),
      );
      setLoaded(proposals.filter(Boolean) as LoadedProposal[]);
    };

    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config?.proposalCount?.toString?.()]);

  const action = useMemo(() => buildAction(actionKind, fields), [actionKind, fields]);

  const onCreate = async () => {
    try {
      setError(null);
      setStatusMessage(null);
      await propose({ description, action });
      setStatusMessage("Proposal submitted.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const onVote = async (support: boolean) => {
    try {
      setError(null);
      setStatusMessage(null);
      await vote({ proposalId: BigInt(proposalId), support });
      setStatusMessage(`Vote ${support ? "FOR" : "AGAINST"} submitted.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const onExecute = async () => {
    try {
      setError(null);
      setStatusMessage(null);
      await execute({
        proposalId: BigInt(proposalId),
        action,
        extraAccounts:
          fields.receiverAta && fields.vaultAta
            ? {
                receiverAta: new PublicKey(fields.receiverAta),
                vaultAta: new PublicKey(fields.vaultAta),
              }
            : undefined,
      });
      setStatusMessage("Execute submitted.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const proposalCount = config ? Number(config.proposalCount.toString()) : 0;

  return (
    <article className={styles.panel}>
      <header className={styles.panelHead}>
        <div>
          <h3 className={styles.panelHeadTitle}>Governance</h3>
        </div>
        <div className={styles.panelHeadMeta}>
          <span className={styles.techBadge}>
            <span className={styles.techDot} />
            {proposalCount} proposal{proposalCount === 1 ? "" : "s"}
          </span>
        </div>
      </header>

      {/* List */}
      {loaded.length ? (
        <div>
          {loaded.map(({ id, proposal, state }) => {
            const fv = Number(proposal.forVotes.toString());
            const av = Number(proposal.againstVotes.toString());
            const total = fv + av;
            const forPct = total ? (fv / total) * 100 : 0;
            const againstPct = total ? (av / total) * 100 : 0;
            return (
              <div className={styles.proposalRow} key={id}>
                <span className={styles.proposalIdx}>#{id}</span>
                <div className={styles.proposalBody}>
                  <h4>Proposal {id}</h4>
                  <p>{proposal.description}</p>
                </div>
                <div className={styles.proposalRowVotes}>
                  <div className={styles.voteCounts}>
                    <span className="for">For {fv}</span>
                    <span className="against">Against {av}</span>
                  </div>
                  <div className={styles.voteBar}>
                    <div className={styles.voteBarFor} style={{ width: `${forPct}%` }} />
                    <div className={styles.voteBarAgainst} style={{ width: `${againstPct}%` }} />
                  </div>
                </div>
                <span className={`${styles.proposalState} ${stateClass(state)}`}>{state}</span>
              </div>
            );
          })}
        </div>
      ) : (
        <div className={styles.emptyHint}>No proposals yet. Create the first one below.</div>
      )}

      <div className={styles.subdivider} />

      {/* Compose */}
      <div className={styles.fieldStack}>
        <label className={styles.fieldLabel}>
          Description
          <textarea
            className={styles.fieldTextarea}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>

        <div className={`${styles.fieldRow} ${styles.fieldRowTwo}`}>
          <label className={styles.fieldLabel}>
            Action variant
            <select
              className={styles.fieldSelect}
              value={actionKind}
              onChange={(e) => setActionKind(e.target.value as ActionKind)}
            >
              <option value="pause_credit">ValocracyPauseCredit</option>
              <option value="resume_credit">ValocracyResumeCredit</option>
              <option value="treasury_transfer">TreasuryTransfer</option>
              <option value="fund_lab">TreasuryFundLab</option>
              <option value="approve_scholarship">TreasuryApproveScholarship</option>
            </select>
          </label>

          <label className={styles.fieldLabel}>
            Proposal id (vote / execute)
            <input
              className={styles.fieldInput}
              value={proposalId}
              onChange={(e) => setProposalId(e.target.value)}
            />
          </label>
        </div>

        {actionKind === "treasury_transfer" ? (
          <div className={`${styles.fieldRow} ${styles.fieldRowTwo}`}>
            <label className={styles.fieldLabel}>
              Receiver
              <input
                className={styles.fieldInput}
                value={fields.receiver}
                onChange={(e) => setFields((s) => ({ ...s, receiver: e.target.value }))}
              />
            </label>
            <label className={styles.fieldLabel}>
              Amount
              <input
                className={styles.fieldInput}
                value={fields.amount}
                onChange={(e) => setFields((s) => ({ ...s, amount: e.target.value }))}
              />
            </label>
          </div>
        ) : null}

        {actionKind === "fund_lab" ? (
          <div className={`${styles.fieldRow} ${styles.fieldRowTwo}`}>
            <label className={styles.fieldLabel}>
              Total amount
              <input
                className={styles.fieldInput}
                value={fields.totalAmount}
                onChange={(e) => setFields((s) => ({ ...s, totalAmount: e.target.value }))}
              />
            </label>
            <label className={styles.fieldLabel}>
              Per member
              <input
                className={styles.fieldInput}
                value={fields.scholarshipPerMember}
                onChange={(e) =>
                  setFields((s) => ({ ...s, scholarshipPerMember: e.target.value }))
                }
              />
            </label>
          </div>
        ) : null}

        {actionKind === "approve_scholarship" ? (
          <div className={`${styles.fieldRow} ${styles.fieldRowTwo}`}>
            <label className={styles.fieldLabel}>
              Lab id
              <input
                className={styles.fieldInput}
                value={fields.labId}
                onChange={(e) => setFields((s) => ({ ...s, labId: e.target.value }))}
              />
            </label>
            <label className={styles.fieldLabel}>
              Member
              <input
                className={styles.fieldInput}
                value={fields.member}
                onChange={(e) => setFields((s) => ({ ...s, member: e.target.value }))}
              />
            </label>
          </div>
        ) : null}

        <div className={styles.btnRow}>
          <button type="button" className={styles.btn} onClick={() => void onCreate()}>
            Create proposal
          </button>
          <button type="button" className={`${styles.btn} ${styles.btnSecondary}`} onClick={() => void onVote(true)}>
            Vote for
          </button>
          <button type="button" className={`${styles.btn} ${styles.btnSecondary}`} onClick={() => void onVote(false)}>
            Vote against
          </button>
          <button type="button" className={`${styles.btn} ${styles.btnDanger}`} onClick={() => void onExecute()}>
            Execute
          </button>
        </div>
      </div>

      {statusMessage ? <div className={styles.feedbackOk}>{statusMessage}</div> : null}
      {error ? <div className={styles.feedbackErr}>{error}</div> : null}
    </article>
  );
}
