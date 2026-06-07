import { generateAccountNumber, uniqueAccountNumber } from './account-number.util';
import type { PrismaService } from '../../prisma/prisma.service';

const ACCOUNT_NUMBER_PATTERN = /^FB-[1-9]\d{8}$/;

describe('generateAccountNumber', () => {
  it('returns a value matching FB-[1-9]XXXXXXXX on repeated calls', () => {
    for (let i = 0; i < 100; i += 1) {
      expect(generateAccountNumber()).toMatch(ACCOUNT_NUMBER_PATTERN);
    }
  });
});

describe('uniqueAccountNumber', () => {
  it('returns a matching account number and calls findUnique once when no clash', async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
    } as unknown as Pick<PrismaService, 'user'>;

    const result = await uniqueAccountNumber(prisma);

    expect(result).toMatch(ACCOUNT_NUMBER_PATTERN);
    expect(prisma.user.findUnique).toHaveBeenCalledTimes(1);
  });

  it('retries on a clash and returns a value, calling findUnique twice', async () => {
    const prisma = {
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({ id: 'x' })
          .mockResolvedValueOnce(null),
      },
    } as unknown as Pick<PrismaService, 'user'>;

    const result = await uniqueAccountNumber(prisma);

    expect(result).toMatch(ACCOUNT_NUMBER_PATTERN);
    expect(prisma.user.findUnique).toHaveBeenCalledTimes(2);
  });

  it('rejects with an error after exhausting maxTries', async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: 'x' }),
      },
    } as unknown as Pick<PrismaService, 'user'>;

    await expect(uniqueAccountNumber(prisma, 2)).rejects.toThrow(
      'Could not generate a unique account number',
    );
    expect(prisma.user.findUnique).toHaveBeenCalledTimes(2);
  });
});
