import { Injectable, NotFoundException } from '@nestjs/common';
import type { Account } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { CreateAccountInput, UpdateAccountInput } from './dto/accounts.schemas';
import type { AccountView } from './accounts.types';

function toView(account: Account): AccountView {
  return {
    id: account.id,
    name: account.name,
    currency: account.currency,
    accountType: account.accountType,
    balance: account.balance.toString(),
    color: account.color,
    icon: account.icon,
    isArchived: account.isArchived,
  };
}

@Injectable()
export class AccountsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(workspaceId: string): Promise<AccountView[]> {
    const accounts = await this.prisma.account.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'asc' },
    });
    return accounts.map(toView);
  }

  async create(workspaceId: string, input: CreateAccountInput): Promise<AccountView> {
    const account = await this.prisma.account.create({
      data: {
        workspaceId,
        name: input.name,
        currency: input.currency,
        accountType: input.accountType,
        balance: input.initialBalance,
        color: input.color,
        icon: input.icon,
      },
    });
    return toView(account);
  }

  async update(
    workspaceId: string,
    accountId: string,
    input: UpdateAccountInput,
  ): Promise<AccountView> {
    const existing = await this.prisma.account.findFirst({
      where: { id: accountId, workspaceId },
    });
    if (!existing) {
      throw new NotFoundException('Account not found.');
    }

    const account = await this.prisma.account.update({
      where: { id: accountId },
      data: {
        name: input.name,
        color: input.color,
        icon: input.icon,
        isArchived: input.isArchived,
      },
    });
    return toView(account);
  }

  /** Resolve an account by (case-insensitive) name within a workspace. Used by chat tools. */
  async findByName(workspaceId: string, name: string): Promise<Account | null> {
    return this.prisma.account.findFirst({
      where: { workspaceId, name: { equals: name, mode: 'insensitive' }, isArchived: false },
    });
  }
}
