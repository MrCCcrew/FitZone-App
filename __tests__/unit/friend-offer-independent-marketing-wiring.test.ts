import {describe, expect, it} from "vitest";
import {readFileSync} from "node:fs";
const src=(f:string)=>readFileSync(f,"utf8");
describe("independent friend offer marketing conversion",()=>{
  it("closes frozen marketing attribution without linking UserMembership",()=>{
    const s=src("src/lib/marketing-conversion-service.ts");
    const start=s.indexOf("export async function accrueIndependentFriendMarketingConversionTx");
    expect(start).toBeGreaterThan(0);
    const only=s.slice(start);
    expect(only).toContain('friendOfferParticipantId: participantId');
    expect(only).toContain('userMembershipId: null');
    expect(only).toContain('status: "converted"');
    expect(only).toContain('activeKey: null');
    expect(only).not.toContain("userMembership.create");
  });
});
