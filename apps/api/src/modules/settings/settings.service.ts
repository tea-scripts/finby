import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TIER_LIMITS, isCurrencyCode, type SubscriptionTier } from '@finby/shared';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async updateCurrencies(
    workspaceId: string,
    tier: SubscriptionTier,
    currencies: string[],
  ): Promise<{ preferredCurrencies: string[] }> {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { baseCurrency: true },
    });
    if (!workspace) throw new NotFoundException('Workspace not found.');
    const base = workspace.baseCurrency.toUpperCase();

    const unique = Array.from(new Set(currencies.map((c) => c.toUpperCase())));
    for (const code of unique) {
      if (!isCurrencyCode(code)) throw new BadRequestException(`Unknown currency: ${code}`);
    }
    if (!unique.includes(base)) {
      throw new BadRequestException(`Base currency (${base}) must be included.`);
    }
    // Tier gate: FREE (currencies cap !== null) is single-currency → must be exactly [base].
    const cap = TIER_LIMITS[tier].currencies;
    if (cap !== null && !(unique.length === 1 && unique[0] === base)) {
      throw new ForbiddenException({ error: 'tier_limit', message: 'Multiple currencies require Pro.' });
    }
    const updated = await this.prisma.workspace.update({
      where: { id: workspaceId },
      data: { preferredCurrencies: unique },
      select: { preferredCurrencies: true },
    });
    return { preferredCurrencies: updated.preferredCurrencies };
  }
}
