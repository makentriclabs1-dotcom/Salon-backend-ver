import { prisma } from "../db";

export async function nextSequentialId(prefix: "CLI" | "APT"): Promise<string> {
  const year = new Date().getFullYear();
  const key = `${prefix}_${year}`;

  const counter = await prisma.$transaction(async (tx) => {
    const existing = await tx.counter.findUnique({ where: { key } });
    if (!existing) return tx.counter.create({ data: { key, value: 1 } });
    return tx.counter.update({ where: { key }, data: { value: { increment: 1 } } });
  });

  return `${prefix}-${year}-${String(counter.value).padStart(6, "0")}`;
}
