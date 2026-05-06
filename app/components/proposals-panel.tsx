"use client";

import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { useEffect, useMemo, useState } from "react";

import { useGovernor } from "@karn_lat/protocol-sdk-solana/react";

type ActionKind =
  | "pause_credit"
  | "resume_credit"
  | "treasury_transfer"
  | "fund_lab"
  | "approve_scholarship";

function buildAction(kind: ActionKind, fields: Record<string, string>) {
  switch (kind) {
    case "pause_credit":
      return { valocracyPauseCredit: {} } as any;
    case "resume_credit":
      return { valocracyResumeCredit: {} } as any;
    case "treasury_transfer":
      return {
        treasuryTransfer: {
          receiver: new PublicKey(fields.receiver),
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
          member: new PublicKey(fields.member),
        },
      } as any;
  }
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
  const [loaded, setLoaded] = useState<any[]>([]);

  useEffect(() => {
    void refresh();
  }, []);

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
      setLoaded(proposals.filter(Boolean) as any[]);
    };

    void load();
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
        extraAccounts: fields.receiverAta && fields.vaultAta
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

  return (
    <div className="panel stack-lg">
      <div>
        <h2>Governance</h2>
        <p>
          Create, inspect, vote and execute proposals using the Governor program and the React hooks from M16.
        </p>
      </div>

      <div className="proposal-list">
        {loaded.length ? loaded.map(({ id, proposal, state }) => (
          <div className="proposal-item" key={id}>
            <strong>Proposal #{id}</strong>
            <div className="row">
              <span className="tag accent">{state}</span>
              <span className="tag">For {proposal.forVotes.toString()}</span>
              <span className="tag">Against {proposal.againstVotes.toString()}</span>
            </div>
            <p>{proposal.description}</p>
          </div>
        )) : (
          <div className="metric">
            <span className="microcopy">No proposals loaded yet.</span>
          </div>
        )}
      </div>

      <div className="divider" />

      <div className="field-grid">
        <div className="field">
          <label>Description</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="field-grid two">
          <div className="field">
            <label>Action Variant</label>
            <select value={actionKind} onChange={(e) => setActionKind(e.target.value as ActionKind)}>
              <option value="pause_credit">ValocracyPauseCredit</option>
              <option value="resume_credit">ValocracyResumeCredit</option>
              <option value="treasury_transfer">TreasuryTransfer</option>
              <option value="fund_lab">TreasuryFundLab</option>
              <option value="approve_scholarship">TreasuryApproveScholarship</option>
            </select>
          </div>
          <div className="field">
            <label>Proposal Id</label>
            <input value={proposalId} onChange={(e) => setProposalId(e.target.value)} />
          </div>
        </div>

        {actionKind === "treasury_transfer" ? (
          <div className="field-grid two">
            <div className="field">
              <label>Receiver</label>
              <input value={fields.receiver} onChange={(e) => setFields((s) => ({ ...s, receiver: e.target.value }))} />
            </div>
            <div className="field">
              <label>Amount</label>
              <input value={fields.amount} onChange={(e) => setFields((s) => ({ ...s, amount: e.target.value }))} />
            </div>
          </div>
        ) : null}

        {actionKind === "fund_lab" ? (
          <div className="field-grid two">
            <div className="field">
              <label>Total Amount</label>
              <input value={fields.totalAmount} onChange={(e) => setFields((s) => ({ ...s, totalAmount: e.target.value }))} />
            </div>
            <div className="field">
              <label>Scholarship Per Member</label>
              <input value={fields.scholarshipPerMember} onChange={(e) => setFields((s) => ({ ...s, scholarshipPerMember: e.target.value }))} />
            </div>
          </div>
        ) : null}

        {actionKind === "approve_scholarship" ? (
          <div className="field-grid two">
            <div className="field">
              <label>Lab Id</label>
              <input value={fields.labId} onChange={(e) => setFields((s) => ({ ...s, labId: e.target.value }))} />
            </div>
            <div className="field">
              <label>Member</label>
              <input value={fields.member} onChange={(e) => setFields((s) => ({ ...s, member: e.target.value }))} />
            </div>
          </div>
        ) : null}
      </div>

      <div className="row">
        <button className="cta" onClick={() => void onCreate()}>Create Proposal</button>
        <button className="ghost" onClick={() => void onVote(true)}>Vote For</button>
        <button className="ghost" onClick={() => void onVote(false)}>Vote Against</button>
        <button className="danger" onClick={() => void onExecute()}>Execute</button>
      </div>

      {statusMessage ? <div className="success-box">{statusMessage}</div> : null}
      {error ? <div className="error-box">{error}</div> : null}
    </div>
  );
}
