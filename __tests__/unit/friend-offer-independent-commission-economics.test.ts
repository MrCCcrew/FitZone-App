import {describe, expect, it} from "vitest";
import {calculateIndependentFriendCommissions} from "@/lib/commissions/friend-offer-independent-commission";
function frozen(values: object) {return JSON.stringify({version:1, capturedAt:"2026-11-11T00:00:00Z", ...values});}
describe("Frozen independent friend commission economics", () => {
  it("posts partner and manager independently at frozen rates", () => {
    expect(calculateIndependentFriendCommissions(frozen({partner: {
      partnerId:"p", source:"affiliate_link", terms:{type:"percentage", rate:12, baseAmount:150},
      manager:{managerId:"m", type:"percentage_of_partner", rate:25}
    }}))).toEqual([
      {beneficiaryType:"partner", beneficiaryId:"p", amount:18},
      {beneficiaryType:"manager_partner", beneficiaryId:"m", amount:4.5},
    ]);
  });
  it("uses fixed sales-agent rate and revenue-based manager share", () => {
    const value=calculateIndependentFriendCommissions(frozen({salesAgent: {
      agentId:"a", referralCode:"REF", trackedSpendAmount:200,
      terms:{type:"fixed",rate:7,baseAmount:200},
      manager:{managerId:"manager",type:"percentage_of_revenue",rate:5,revenueBase:200},
    }}));
    expect(value).toEqual([
      {beneficiaryType:"sales_agent",beneficiaryId:"a",amount:7},
      {beneficiaryType:"manager",beneficiaryId:"manager",amount:10},
    ]);
  });
  it("refuses absent commission snapshots and invalid negative economics", () => {
    expect(() => calculateIndependentFriendCommissions("")).toThrow(/SNAPSHOT_REQUIRED/);
    expect(() => calculateIndependentFriendCommissions(frozen({staff: {
      staffUserId:"u",referralLinkId:"r",referralToken:"k",
      terms:{type:"percentage",rate:-1,baseAmount:100},
    }}))).toThrow();
  });
  it("does not invent commission entries for an un-attributed participant", () => {
    expect(calculateIndependentFriendCommissions(frozen({}))).toEqual([]);
  });
});
