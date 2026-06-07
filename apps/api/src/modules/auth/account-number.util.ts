import type { PrismaService } from '../../prisma/prisma.service';

/** Random per-user account number, brokerage style: FB- + 9 digits (first 1-9). */
export function generateAccountNumber(): string {
  const n = Math.floor(Math.random() * 900_000_000) + 100_000_000; // 100000000..999999999
  return `FB-${n}`;
}

/** Generate a unique account number, retrying on the rare unique-constraint collision. */
export async function uniqueAccountNumber(
  prisma: Pick<PrismaService, 'user'>,
  maxTries = 5,
): Promise<string> {
  for (let i = 0; i < maxTries; i += 1) {
    const candidate = generateAccountNumber();
    const clash = await prisma.user.findUnique({
      where: { accountNumber: candidate },
      select: { id: true },
    });
    if (!clash) return candidate;
  }
  throw new Error('Could not generate a unique account number');
}
