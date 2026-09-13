import { prisma } from "../db";

export async function writeAudit(params: {
  userId?: string; action: string; entity: string; entityId?: string;
  before?: unknown; after?: unknown;
}) {
  await prisma.auditLog.create({
    data: {
      userId: params.userId,
      action: params.action,
      entity: params.entity,
      entityId: params.entityId,
      beforeJson: params.before ? JSON.stringify(params.before) : null,
      afterJson: params.after ? JSON.stringify(params.after) : null,
    },
  });
}
