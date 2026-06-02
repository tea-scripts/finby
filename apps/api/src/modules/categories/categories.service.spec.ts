import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CategoriesService } from './categories.service';

function buildPrisma() {
  return {
    category: {
      findMany: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
  };
}

describe('CategoriesService', () => {
  it('create maps a P2002 unique violation to ConflictException', async () => {
    const prisma = buildPrisma();
    prisma.category.create.mockRejectedValue(Object.assign(new Error('dup'), { code: 'P2002' }));
    const service = new CategoriesService(prisma as unknown as PrismaService);
    await expect(service.create('w1', { name: 'Groceries' })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('update rejects renaming a default category', async () => {
    const prisma = buildPrisma();
    prisma.category.findFirst.mockResolvedValue({ id: 'c1', name: 'Groceries', isDefault: true });
    const service = new CategoriesService(prisma as unknown as PrismaService);
    await expect(service.update('w1', 'c1', { name: 'Food' })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.category.update).not.toHaveBeenCalled();
  });

  it('update allows archiving a default category', async () => {
    const prisma = buildPrisma();
    prisma.category.findFirst.mockResolvedValue({ id: 'c1', name: 'Groceries', isDefault: true });
    prisma.category.update.mockResolvedValue({
      id: 'c1',
      name: 'Groceries',
      color: null,
      icon: null,
      isDefault: true,
      isArchived: true,
    });
    const service = new CategoriesService(prisma as unknown as PrismaService);
    const result = await service.update('w1', 'c1', { isArchived: true });
    expect(result.isArchived).toBe(true);
    expect(prisma.category.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ name: undefined, isArchived: true }) }),
    );
  });

  it('update throws NotFound when the category is not in the workspace', async () => {
    const prisma = buildPrisma();
    prisma.category.findFirst.mockResolvedValue(null);
    const service = new CategoriesService(prisma as unknown as PrismaService);
    await expect(service.update('w1', 'missing', { color: '#000' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
