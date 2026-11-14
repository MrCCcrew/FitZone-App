import {beforeEach,describe,expect,it,vi} from "vitest";
const mocks=vi.hoisted(()=>({candidate:vi.fn(),locked:vi.fn(),provider:vi.fn(),verify:vi.fn(),create:vi.fn(),lock:vi.fn(),transaction:vi.fn()}));
vi.mock("server-only",()=>({}));
vi.mock("@/lib/db",()=>({db:{friendOfferParticipant:{findUnique:mocks.candidate},$transaction:mocks.transaction}}));
vi.mock("@/lib/payments/registry",()=>({getPaymentProvider:mocks.provider}));
import {prepareIndependentFriendEntitlement} from "@/lib/payments/friend-offer-independent-preparation";
const attempt={id:"pay-1",provider:"paymob",status:"paid",userId:"user-1",providerReference:"int-1",externalReference:"ext-1",amount:100,currency:"EGP",metadata:null,providerPayload:null};
function locked(overrides:Record<string,unknown>={}){
 const payment={...attempt,offerId:"offer-1",membershipId:null,paidAt:new Date("2026-11-01T00:00:00Z"),...overrides};
 return {id:"part-1",userId:"user-1",groupId:"group-1",shareAmountMinor:10000,userMembershipId:null,paymentTransactionId:"pay-1",group:{individualInvitesEnabled:true,status:"ready",config:{requiredMembers:2},participants:[{id:"part-1",status:"paid",paymentTransactionId:"pay-1"},{id:"part-2",status:"paid",paymentTransactionId:"pay-2"}],offerTermsSnapshot:JSON.stringify({durationDays:30,sessionsCount:10}),eligibilitySnapshot:"{}"},paymentTransaction:payment,independentEntitlement:null};
}
describe("V4D rejects stale Paymob verification inside group lock",()=>{
 beforeEach(()=>{
  vi.resetAllMocks();
  mocks.candidate.mockResolvedValue({id:"part-1",paymentTransactionId:"pay-1",paymentTransaction:attempt});
  mocks.provider.mockReturnValue({verifyTransaction:mocks.verify});
  mocks.verify.mockResolvedValue({status:"paid"});
  mocks.lock.mockResolvedValue([{id:"group-1"}]);
  mocks.locked.mockResolvedValue(locked());
  mocks.transaction.mockImplementation((callback:(tx:unknown)=>unknown)=>callback({$queryRaw:mocks.lock,friendOfferParticipant:{findUnique:mocks.locked},friendOfferEntitlement:{create:mocks.create}}));
  mocks.create.mockResolvedValue({id:"right-1",status:"pending_settlement"});
 });
 for(const [field,altered] of [["providerReference","int-2"],["externalReference","ext-2"],["amount",101],["currency","USD"],["metadata","{}"],["providerPayload","{}"],["provider","manual"],["userId","user-2"]] as const){
  it(`fails closed when ${field} changes after Paymob verification`,async()=>{
   mocks.locked.mockResolvedValue(locked({[field]:altered}));
   await expect(prepareIndependentFriendEntitlement({participantId:"part-1"})).rejects.toThrow(field === "userId" ? "FRIEND_INDEPENDENT_PAYMENT_IDENTITY_MISMATCH" : "FRIEND_INDEPENDENT_PAYMENT_PROOF_STALE");
   expect(mocks.verify).toHaveBeenCalledTimes(1);
   expect(mocks.create).not.toHaveBeenCalled();
  });
 }
 it("prepares only a non-redeemable record with unchanged proof",async()=>{
  await expect(prepareIndependentFriendEntitlement({participantId:"part-1"})).resolves.toMatchObject({status:"pending_settlement",alreadyPrepared:false});
  expect(mocks.create).toHaveBeenCalledTimes(1);
  expect(mocks.create.mock.calls[0][0].data.status).toBe("pending_settlement");
 });
});
