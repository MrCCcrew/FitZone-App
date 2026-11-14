import type { Prisma } from "@prisma/client";
import { calculateCommission, parseMembershipCommissionSnapshot, roundCommissionMoney } from "@/lib/commissions/membership-commission-contract";

type Beneficiary = { beneficiaryType: string; beneficiaryId: string; amount: number };

/** No UserMembership is ever created. All rates and identities are frozen at checkout claim. */
export function calculateIndependentFriendCommissions(frozen: string): Beneficiary[] {
  if (!frozen) throw new Error("FRIEND_INDEPENDENT_COMMISSION_SNAPSHOT_REQUIRED");
  const s = parseMembershipCommissionSnapshot(frozen);
  const result: Beneficiary[] = [];
  const add = (beneficiaryType: string, beneficiaryId: string, amount: number) => {
    if (!beneficiaryId.trim() || !Number.isFinite(amount) || amount < 0)
      throw new Error("FRIEND_INDEPENDENT_COMMISSION_INVALID");
    if (amount > 0) result.push({beneficiaryType, beneficiaryId, amount: roundCommissionMoney(amount)});
  };
  let partnerAmount = 0;
  if (s.partner) {
    partnerAmount = calculateCommission(s.partner.terms);
    add("partner", s.partner.partnerId, partnerAmount);
    if (partnerAmount > 0 && s.partner.manager) {
      const m = s.partner.manager;
      add("manager_partner", m.managerId, m.type === "percentage_of_partner" ? partnerAmount * m.rate / 100 : m.rate);
    }
  }
  if (s.legacyAgent) add("agent_user", s.legacyAgent.agentUserId, calculateCommission(s.legacyAgent.terms));
  if (s.salesAgent) {
    const agent = calculateCommission(s.salesAgent.terms);
    add("sales_agent", s.salesAgent.agentId, agent);
    if (agent > 0 && s.salesAgent.manager) {
      const m = s.salesAgent.manager;
      const amount = m.type === "percentage_of_agents" ? agent * m.rate / 100 :
        m.type === "percentage_of_revenue" ? m.revenueBase * m.rate / 100 : m.rate;
      add("manager", m.managerId, amount);
    }
  }
  if (s.staff) add("staff", s.staff.staffUserId, calculateCommission(s.staff.terms));
  if (s.trainer) add("trainer", s.trainer.trainerUserId, calculateCommission(s.trainer.terms));
  if (s.nutrition) add("nutrition", s.nutrition.nutritionistUserId, calculateCommission(s.nutrition.terms));
  const unique = new Set<string>();
  for (const row of result) {
    const key = `${row.beneficiaryType}:${row.beneficiaryId}`;
    if (unique.has(key)) throw new Error("FRIEND_INDEPENDENT_COMMISSION_DUPLICATE_BENEFICIARY");
    unique.add(key);
  }
  return result;
}

export async function accrueIndependentFriendCommissionsTx(
  tx: Prisma.TransactionClient,
  participantId: string,
  frozen: string,
): Promise<number> {
  const computed = calculateIndependentFriendCommissions(frozen);
  const rows = await tx.friendOfferCommission.findMany({where: {participantId}});
  if (rows.length) {
    if (rows.length !== computed.length || computed.some(item => !rows.some(row =>
        row.beneficiaryType === item.beneficiaryType && row.beneficiaryId === item.beneficiaryId &&
        Math.abs(Number(row.amount) - item.amount) < 0.000001)))
      throw new Error("FRIEND_INDEPENDENT_COMMISSION_LEDGER_MISMATCH");
    return rows.length;
  }
  for (const item of computed) {
    await tx.friendOfferCommission.create({data: {
      participantId, beneficiaryType: item.beneficiaryType,
      beneficiaryId: item.beneficiaryId, amount: item.amount, snapshot: frozen,
      status: "earned",
    }});
  }
  return computed.length;
}
