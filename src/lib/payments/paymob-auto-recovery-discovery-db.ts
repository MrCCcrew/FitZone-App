import "server-only";

import { db } from "@/lib/db";
import { scanPaymobRecoveryCandidates } from "./paymob-auto-recovery-scanner";
import { materializePaymobRecoveryCandidates } from "./paymob-auto-recovery-materializer";
import { savePaymobRecoveryCheckpoint } from "./paymob-auto-recovery-checkpoint";
import { coordinatePaymobRecoveryDiscovery } from "./paymob-auto-recovery-coordinator";

const SCAN_ID = "membership-paymob";

export async function discoverPaymobRecoveryJobs() {
  const state = await db.paymobRecoveryScanState.upsert({
    where: { id: SCAN_ID },
    create: { id: SCAN_ID },
    update: {},
  });

  let initialCursor = null;

  if (state.cursorCreatedAt && state.cursorPaymentId) {
    initialCursor = {
      createdAt: state.cursorCreatedAt,
      id: state.cursorPaymentId,
    };
  } else if (state.cursorCreatedAt || state.cursorPaymentId) {
    throw new Error("INCOMPLETE_PAYMOB_RECOVERY_CURSOR");
  }

  return coordinatePaymobRecoveryDiscovery({
    readCheckpoint: async () => ({
      cursor: initialCursor,
      version: state.version,
    }),

    saveCheckpoint: (version, cursor) =>
      savePaymobRecoveryCheckpoint(db, {
        id: SCAN_ID,
        expectedVersion: version,
        cursor,
      }),

    scan: (limit, cursor) =>
      scanPaymobRecoveryCandidates(db, limit, cursor),

    materialize: (candidates) =>
      materializePaymobRecoveryCandidates(db, candidates, new Date()),

    pageSize: 25,
    maxPages: 4,
  });
}
