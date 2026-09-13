import { PrismaClient } from "@prisma/client";

// On Vercel, each serverless function invocation can spin up a fresh module
// context, which would otherwise create a brand-new PrismaClient (and a brand-new
// database connection) on every request — quickly exhausting Postgres's connection
// limit. Caching the client on the global object lets "warm" invocations reuse the
// same connection instead. This is a no-op on Railway/local, where there's only
// ever one long-running process anyway.
declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

export const prisma = global.__prisma || new PrismaClient();
if (process.env.NODE_ENV !== "production") global.__prisma = prisma;
