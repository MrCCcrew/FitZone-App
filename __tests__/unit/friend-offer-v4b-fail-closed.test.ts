import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {join} from "node:path";
const source = readFileSync(join(process.cwd(),"src/lib/payments/friend-offer-finalization.ts"),"utf8");
const prep = readFileSync(join(process.cwd(),"src/lib/payments/friend-offer-independent-preparation.ts"),"utf8");
describe("New independent friend offers fail closed before legacy membership finalization",()=>{
 it("stops modern groups before historic completed and claiming logic",()=>{
  expect(source.indexOf('group.individualInvitesEnabled === true')).toBeGreaterThan(-1);
  expect(source.indexOf('group.individualInvitesEnabled === true')).toBeLessThan(source.indexOf('if (group.status === "completed")'));
 });
 it("does not activate modern groups through legacy finalizer",()=>{
  // V5 routes new groups through independent settlement rather than
  // returning the temporary V4B fail-closed placeholder.
  expect(source).toContain('import { settleIndependentFriendOfferGroup }');
  expect(source).toContain('return settleIndependentFriendOfferGroup(trimmedGroupId);');
  expect(source.indexOf('if (group.individualInvitesEnabled === true)')).toBeLessThan(
    source.indexOf('if (group.status === "completed")'),
  );
  expect(source.indexOf('return settleIndependentFriendOfferGroup(trimmedGroupId);')).toBeLessThan(
    source.indexOf('for (const participantId of claim.participantIds)'),
  );
 });
 it("requires an explicit authoritative provider proof",()=>{
  expect(prep).toContain('getPaymentProvider("paymob")');
  expect(prep).toContain('provider.verifyTransaction');
  expect(prep).toContain('FRIEND_INDEPENDENT_PAYMOB_ORDER_PROOF_REQUIRED');
  expect(prep).not.toContain('confirmedPaymobOrderAndTransaction');
 });
 it("locks group before preparing a right",()=>{
  expect(prep).toContain('FOR UPDATE');
  expect(prep.indexOf('FOR UPDATE')).toBeLessThan(prep.indexOf('const participant = await tx.friendOfferParticipant.findUnique'));
 });
 it("does not grant booking rights or modify membership",()=>{
  expect(prep).toContain('status: "pending_settlement"');
  expect(prep).not.toMatch(/tx\.userMembership\.(create|update|updateMany)/);
  expect(prep).not.toMatch(/tx\.booking\.(create|update|updateMany)/);
 });
});
