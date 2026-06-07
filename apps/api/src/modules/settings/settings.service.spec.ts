import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SettingsService } from './settings.service';

function buildPrisma(baseCurrency = 'USD') {
  return {
    workspace: {
      findUnique: jest.fn().mockResolvedValue({ baseCurrency }),
      update: jest
        .fn()
        .mockImplementation((args: { data: { preferredCurrencies: string[] } }) =>
          Promise.resolve({ preferredCurrencies: args.data.preferredCurrencies }),
        ),
    },
  };
}

function build(prisma = buildPrisma()) {
  const service = new SettingsService(prisma as unknown as PrismaService);
  return { service, prisma };
}

describe('SettingsService.updateCurrencies', () => {
  it('PRO with base + extra stores both and returns them', async () => {
    const { service, prisma } = build();
    const result = await service.updateCurrencies('ws1', 'PRO', ['USD', 'EUR']);
    expect(prisma.workspace.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ws1' },
        data: { preferredCurrencies: ['USD', 'EUR'] },
      }),
    );
    expect(result).toEqual({ preferredCurrencies: ['USD', 'EUR'] });
  });

  it('FREE with multiple currencies throws ForbiddenException and does not update', async () => {
    const { service, prisma } = build();
    await expect(service.updateCurrencies('ws1', 'FREE', ['USD', 'EUR'])).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.workspace.update).not.toHaveBeenCalled();
  });

  it('FREE with only the base currency is allowed', async () => {
    const { service, prisma } = build();
    const result = await service.updateCurrencies('ws1', 'FREE', ['USD']);
    expect(prisma.workspace.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { preferredCurrencies: ['USD'] } }),
    );
    expect(result).toEqual({ preferredCurrencies: ['USD'] });
  });

  it('throws BadRequestException when base currency is missing', async () => {
    const { service, prisma } = build();
    await expect(service.updateCurrencies('ws1', 'PRO', ['EUR'])).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.workspace.update).not.toHaveBeenCalled();
  });

  it('throws BadRequestException for an unknown currency code', async () => {
    const { service, prisma } = build();
    await expect(service.updateCurrencies('ws1', 'PRO', ['USD', 'XXX'])).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.workspace.update).not.toHaveBeenCalled();
  });

  it('de-dupes and uppercases before storing', async () => {
    const { service, prisma } = build();
    const result = await service.updateCurrencies('ws1', 'PRO', ['usd', 'USD', 'eur']);
    expect(prisma.workspace.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { preferredCurrencies: ['USD', 'EUR'] } }),
    );
    expect(result).toEqual({ preferredCurrencies: ['USD', 'EUR'] });
  });
});
