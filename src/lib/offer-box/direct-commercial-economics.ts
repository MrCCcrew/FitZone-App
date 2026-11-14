import type { Prisma, OfferBoxPurchase, PaymentTransaction } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { lockMembershipLifecycleUserTx } from "@/lib/membership-lifecycle-lock";

/** The existing priceSnapshot/finalPrice is the external Paymob amount.
 * This versioned, immutable contract separately records total consideration.
 * All monetary fields here are integer piastres, not floating point EGP.
 */
import { readDirectCommercialConsideration, directMoneyMinor, type DirectCommercialConsideration } from "./direct-commercial-consideration";
export { directMoneyMinor } from "./direct-commercial-consideration";


type Tx = Prisma.TransactionClient;
type Purchase = Pick<OfferBoxPurchase, "id" | "userId" | "commercialKind" | "offerSnapshot" | "priceSnapshot" | "status" | "paymentTransactionId" | "paidAt">;
type Payment = Pick<PaymentTransaction, "id" | "userId" | "provider" | "amount" | "status" | "metadata" | "paidAt" | "purpose" | "membershipId" | "orderId">;

type Reservation = {
  version: 1;
  purchaseId: string;
  state: "reserved" | "settled" | "restored";
  walletDebitId: string | null;
  pointsDebitId: string | null;
  discountUsageId: string | null;
};

function object(value: unknown): Record<string, any> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("DIRECT_ECONOMICS_INVALID_OBJECT");
  return value as Record<string, any>;
}
function parse(raw: string | null): Record<string, any> {
  return object(JSON.parse(raw ?? "{}"));
}
function reservation(payment: Payment, purchase: Purchase): Reservation | null {
  const m = parse(payment.metadata);
  if (m.directCommercialEconomics == null) return null;
  const r = object(m.directCommercialEconomics);
  if (r.version !== 1 || r.purchaseId !== purchase.id || m.offerBoxPurchaseId !== purchase.id || !["reserved", "settled", "restored"].includes(r.state)) throw new Error("DIRECT_ECONOMICS_OWNER_MISMATCH");
  return r as Reservation;
}
function validateOwners(purchase: Purchase, payment: Payment) {
  if (!["package", "direct_offer"].includes(purchase.commercialKind) || purchase.paymentTransactionId !== payment.id || purchase.userId !== payment.userId || payment.purpose !== "offer_box" || payment.membershipId !== null || payment.orderId !== null || directMoneyMinor(payment.amount) !== directMoneyMinor(purchase.priceSnapshot)) throw new Error("DIRECT_ECONOMICS_OWNER_MISMATCH");
}

/** Reserve each economic source in the same transaction as the purchase and held seats.
 * Discount usage has an explicit immutable owner: id = purchase.id, and metadata
 * records that exact usage ID. No UserMembership is created or referenced.
 */
export async function reserveDirectCommercialEconomicsTx(tx: Tx, purchaseId: string, paymentId: string) {
  const purchase = await tx.offerBoxPurchase.findUniqueOrThrow({where:{id:purchaseId}});
  const payment = await tx.paymentTransaction.findUniqueOrThrow({where:{id:paymentId}});
  validateOwners(purchase,payment);
  const c = readDirectCommercialConsideration(purchase.offerSnapshot,purchase.priceSnapshot);
  if (!c || purchase.status !== "pending_payment" || payment.status !== "pending" || payment.paidAt || purchase.paidAt) throw new Error("DIRECT_ECONOMICS_RESERVATION_STATE");
  if (reservation(payment,purchase)) throw new Error("DIRECT_ECONOMICS_ALREADY_RESERVED");
  const r: Reservation = {version:1,purchaseId,state:"reserved",walletDebitId:null,pointsDebitId:null,discountUsageId:null};
  if (c.walletMinor > 0) {
    // Direct offers/packages may use ONLY general wallet credit.
    const rows = await tx.$queryRaw<Array<{id:string;balance:number;referralBalance:number}>>`SELECT id,balance,referralBalance FROM Wallet WHERE userId=${purchase.userId} FOR UPDATE`;
    const w=rows[0];
    if (!w || directMoneyMinor(w.balance)-directMoneyMinor(w.referralBalance)<c.walletMinor) throw new Error("DIRECT_ECONOMICS_WALLET_INSUFFICIENT");
    const changed=await tx.wallet.updateMany({where:{id:w.id,userId:purchase.userId,balance:w.balance,referralBalance:w.referralBalance},data:{balance:{decrement:c.walletMinor/100}}});
    if(changed.count!==1) throw new Error("DIRECT_ECONOMICS_WALLET_RACE");
    r.walletDebitId=(await tx.walletTransaction.create({data:{walletId:w.id,amount:c.walletMinor/100,type:"debit",source:"general",description:`commercial:${purchaseId}:wallet`}})).id;
  }
  if(c.pointsCount>0){
    const changed=await tx.rewardPoints.updateMany({where:{userId:purchase.userId,points:{gte:c.pointsCount}},data:{points:{decrement:c.pointsCount}}});
    if(changed.count!==1) throw new Error("DIRECT_ECONOMICS_POINTS_INSUFFICIENT");
    const p=await tx.rewardPoints.findUniqueOrThrow({where:{userId:purchase.userId}});
    r.pointsDebitId=(await tx.rewardHistory.create({data:{rewardId:p.id,points:-c.pointsCount,reason:`commercial:${purchaseId}:points`}})).id;
  }
  if(c.discount){
    const d=c.discount;
    const rows=await tx.$queryRaw<Array<{id:string;isActive:boolean|number;type:string;value:number;minAmount:number|null;maxUses:number|null;usedCount:number;scope:string;expiresAt:Date|null}>>`SELECT id,isActive,type,value,minAmount,maxUses,usedCount,scope,expiresAt FROM DiscountCode WHERE id=${d.codeId} FOR UPDATE`;
    const code=rows[0];
    const expected=code?.type==="percentage"?Math.round(d.beforeDiscountMinor*code.value/100):code?.type==="fixed"?Math.min(d.beforeDiscountMinor,directMoneyMinor(code.value)):-1;
    if(!code||!Number(code.isActive)||!["all","subscriptions"].includes(code.scope)||(code.expiresAt&&code.expiresAt<=new Date())||(code.maxUses!==null&&code.usedCount>=code.maxUses)||(code.minAmount!==null&&d.beforeDiscountMinor<directMoneyMinor(code.minAmount))||expected!==d.amountMinor) throw new Error("DIRECT_ECONOMICS_DISCOUNT_INVALID");
    const used=await tx.$queryRaw<Array<{id:string}>>`SELECT id FROM DiscountCodeUsage WHERE discountCodeId=${d.codeId} AND userId=${purchase.userId} LIMIT 1 FOR UPDATE`;
    if(used.length) throw new Error("DIRECT_ECONOMICS_DISCOUNT_ALREADY_USED");
    await tx.discountCodeUsage.create({data:{id:purchaseId,discountCodeId:d.codeId,userId:purchase.userId,membershipId:null,discountAmount:d.amountMinor/100}});
    const changed=await tx.discountCode.updateMany({where:{id:d.codeId,usedCount:code.usedCount},data:{usedCount:{increment:1}}});
    if(changed.count!==1) throw new Error("DIRECT_ECONOMICS_DISCOUNT_RACE");
    r.discountUsageId=purchaseId;
  }
  await tx.paymentTransaction.update({where:{id:payment.id},data:{metadata:JSON.stringify({...parse(payment.metadata),directCommercialEconomics:r})}});
}

/** Validate persisted debit rows; never trust a request/boolean for internal tender. */
export async function assertDirectCommercialEconomicsTx(tx:Tx,purchase:Purchase,payment:Payment,allowSettled=false){
  const c=readDirectCommercialConsideration(purchase.offerSnapshot,purchase.priceSnapshot);
  if(!c){if(reservation(payment,purchase))throw new Error("DIRECT_ECONOMICS_UNEXPECTED_RESERVATION");return null;}
  validateOwners(purchase,payment);
  const r=reservation(payment,purchase);
  if(!r||(r.state!=="reserved"&&!(allowSettled&&r.state==="settled")))throw new Error("DIRECT_ECONOMICS_RESERVATION_MISSING");
  if(c.walletMinor>0){
    const w= r.walletDebitId?await tx.walletTransaction.findUnique({where:{id:r.walletDebitId},include:{wallet:{select:{userId:true}}}}):null;
    if(!w||w.wallet.userId!==purchase.userId||w.type!=="debit"||w.source!=="general"||directMoneyMinor(w.amount)!==c.walletMinor||w.description!==`commercial:${purchase.id}:wallet`)throw new Error("DIRECT_ECONOMICS_WALLET_PROOF");
  }else if(r.walletDebitId)throw new Error("DIRECT_ECONOMICS_WALLET_UNEXPECTED");
  if(c.pointsCount>0){
    const p=r.pointsDebitId?await tx.rewardHistory.findUnique({where:{id:r.pointsDebitId},include:{reward:{select:{userId:true}}}}):null;
    if(!p||p.reward.userId!==purchase.userId||p.points!==-c.pointsCount||p.reason!==`commercial:${purchase.id}:points`)throw new Error("DIRECT_ECONOMICS_POINTS_PROOF");
  }else if(r.pointsDebitId)throw new Error("DIRECT_ECONOMICS_POINTS_UNEXPECTED");
  if(c.discount){
    const u=r.discountUsageId?await tx.discountCodeUsage.findUnique({where:{id:r.discountUsageId}}):null;
    if(!u||u.id!==purchase.id||u.userId!==purchase.userId||u.membershipId!==null||u.discountCodeId!==c.discount.codeId||directMoneyMinor(u.discountAmount)!==c.discount.amountMinor)throw new Error("DIRECT_ECONOMICS_DISCOUNT_PROOF");
  }else if(r.discountUsageId)throw new Error("DIRECT_ECONOMICS_DISCOUNT_UNEXPECTED");
  return {consideration:c,reservation:r};
}

/** Called only under the existing unstarted-payment expiry lock. */
export async function restoreDirectCommercialEconomicsTx(tx:Tx,purchase:Purchase,payment:Payment):Promise<string|null>{
  const economics=await assertDirectCommercialEconomicsTx(tx,purchase,payment);
  if(!economics)return payment.metadata;
  if(purchase.paidAt||payment.paidAt||payment.status==="paid")throw new Error("DIRECT_ECONOMICS_PAID_RESTORE_FORBIDDEN");
  const {consideration:c,reservation:r}=economics;
  if(c.walletMinor>0){
    const w=await tx.wallet.update({where:{userId:purchase.userId},data:{balance:{increment:c.walletMinor/100}}});
    await tx.walletTransaction.create({data:{walletId:w.id,amount:c.walletMinor/100,type:"credit",source:"general",description:`commercial:${purchase.id}:wallet_restore`}});
  }
  if(c.pointsCount>0){
    const p=await tx.rewardPoints.update({where:{userId:purchase.userId},data:{points:{increment:c.pointsCount}}});
    await tx.rewardHistory.create({data:{rewardId:p.id,points:c.pointsCount,reason:`commercial:${purchase.id}:points_restore`}});
  }
  if(c.discount){
    await tx.$queryRaw`SELECT id FROM DiscountCode WHERE id=${c.discount.codeId} FOR UPDATE`;
    const deleted=await tx.discountCodeUsage.deleteMany({where:{id:purchase.id,userId:purchase.userId,discountCodeId:c.discount.codeId,membershipId:null}});
    const changed=await tx.discountCode.updateMany({where:{id:c.discount.codeId,usedCount:{gt:0}},data:{usedCount:{decrement:1}}});
    if(deleted.count!==1||changed.count!==1)throw new Error("DIRECT_ECONOMICS_DISCOUNT_RESTORE_RACE");
  }
  return JSON.stringify({...parse(payment.metadata),directCommercialEconomics:{...r,state:"restored"}});
}

/** No external provider is called for fully internal consideration. */
export async function createInternalCommercialPaymentTx(tx:Tx,purchaseId:string,userId:string,now:Date){
  const purchase=await tx.offerBoxPurchase.findUniqueOrThrow({where:{id:purchaseId}});
  const c=readDirectCommercialConsideration(purchase.offerSnapshot,purchase.priceSnapshot);
  if(!c||c.externalMinor!==0||purchase.userId!==userId||purchase.status!=="pending_payment"||purchase.paymentTransactionId||purchase.paidAt||!purchase.holdExpiresAt||purchase.holdExpiresAt<=now)throw new Error("DIRECT_INTERNAL_PAYMENT_INVALID");
  const p=await tx.paymentTransaction.create({data:{id:randomUUID(),userId,offerId:purchase.offerId,purpose:"offer_box",businessUnit:"club",provider:"manual",paymentMethod:"internal",amount:0,currency:"EGP",status:"pending",expiresAt:purchase.holdExpiresAt,metadata:JSON.stringify({offerBoxPurchaseId:purchase.id,commercialKind:purchase.commercialKind,catalogMembershipId:purchase.catalogMembershipId,offerBoxSnapshotVersion:purchase.snapshotVersion})}});
  const claim=await tx.offerBoxPurchase.updateMany({where:{id:purchase.id,userId,status:"pending_payment",paymentTransactionId:null,paidAt:null},data:{paymentTransactionId:p.id}});
  if(claim.count!==1)throw new Error("DIRECT_INTERNAL_PAYMENT_RACE");
  await reserveDirectCommercialEconomicsTx(tx,purchase.id,p.id);
  const paid=await tx.paymentTransaction.updateMany({where:{id:p.id,provider:"manual",status:"pending",paidAt:null},data:{status:"paid",paidAt:now}});
  const closed=await tx.offerBoxPurchase.updateMany({where:{id:purchase.id,status:"pending_payment",paymentTransactionId:p.id,paidAt:null},data:{status:"paid_activation_pending",paidAt:now}});
  if(paid.count!==1||closed.count!==1)throw new Error("DIRECT_INTERNAL_SETTLEMENT_RACE");
  return p.id;
}

export type DirectCheckoutResult={commercialCheckout:true;purchaseId:string;endDate:Date;resumedPending:boolean;completedTransactionId:string|null};
/** Look up a pending checkout OR a completed client attempt. Call under user lock. */
export async function findDirectCommercialCheckoutTx(tx:Tx,input:{userId:string;kind:"package"|"direct_offer";offerId:string|null;catalogMembershipId:string|null;fingerprint:object;attemptId:string|null}):Promise<DirectCheckoutResult|null>{
  await lockMembershipLifecycleUserTx(tx,input.userId);
  let attemptId:string|null=null;
  if(input.attemptId){
    const rows=await tx.$queryRaw<Array<{id:string}>>`SELECT id FROM OfferBoxPurchase WHERE userId=${input.userId} AND commercialKind IN ('package','direct_offer') AND JSON_VALID(offerSnapshot) AND JSON_UNQUOTE(JSON_EXTRACT(offerSnapshot,'$.directCheckoutAttemptId'))=${input.attemptId} LIMIT 2 FOR UPDATE`;
    if(rows.length>1)throw new Error("DIRECT_COMMERCIAL_DUPLICATE_ATTEMPT");
    attemptId=rows[0]?.id??null;
  }
  const open=attemptId?[await tx.offerBoxPurchase.findUniqueOrThrow({where:{id:attemptId}})]:await tx.offerBoxPurchase.findMany({where:{userId:input.userId,commercialKind:input.kind,offerId:input.offerId,...(input.kind==="package"?{catalogMembershipId:input.catalogMembershipId}:{}),status:{in:["pending_payment","paid_activation_pending","paid_review"]}},take:2});
  if(open.length>1)throw new Error("DIRECT_COMMERCIAL_MULTIPLE_OPEN_PURCHASES");
  const p=open[0];if(!p)return null;
  const s=parse(p.offerSnapshot);
  if(p.userId!==input.userId||p.commercialKind!==input.kind||p.offerId!==input.offerId||(input.kind==="package"&&p.catalogMembershipId!==input.catalogMembershipId)||JSON.stringify(s.subscribeAttemptFingerprint)!==JSON.stringify(input.fingerprint)||!p.paymentTransactionId)throw new Error("DIRECT_COMMERCIAL_EXISTING_PURCHASE_REQUIRES_REVIEW");
  const right=await tx.offerBoxEntitlement.findUnique({where:{purchaseId:p.id}});
  if(!right||right.userId!==p.userId)throw new Error("DIRECT_COMMERCIAL_PENDING_RIGHT_MISMATCH");
  if(p.status==="redeemed"&&right.status==="active"&&input.attemptId&&s.directCheckoutAttemptId===input.attemptId)return {commercialCheckout:true,purchaseId:p.id,endDate:right.endDate,resumedPending:false,completedTransactionId:p.paymentTransactionId};
  if(p.status!=="pending_payment"||!p.holdExpiresAt||p.holdExpiresAt<=new Date()||right.status!=="pending_payment")throw new Error("DIRECT_COMMERCIAL_EXISTING_PURCHASE_REQUIRES_REVIEW");
  return {commercialCheckout:true,purchaseId:p.id,endDate:right.endDate,resumedPending:true,completedTransactionId:null};
}
