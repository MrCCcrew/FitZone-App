import type { Prisma } from "@prisma/client";

export async function lockMembershipLifecycleUserTx(
  tx: Prisma.TransactionClient,
  userId: string,
) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT \`id\`
    FROM \`User\`
    WHERE \`id\` = ${userId}
    FOR UPDATE
  `;

  if (rows.length !== 1) {
    throw new Error(
      `Membership lifecycle lock failed: user ${userId} was not found`,
    );
  }
}
