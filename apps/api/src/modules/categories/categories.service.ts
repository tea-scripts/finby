import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Category } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { isUniqueConstraintError } from '../../common/prisma-errors';
import type { CreateCategoryInput, UpdateCategoryInput } from './dto/categories.schemas';
import type { CategoryView } from './categories.types';

function toView(category: Category): CategoryView {
  return {
    id: category.id,
    name: category.name,
    color: category.color,
    icon: category.icon,
    isDefault: category.isDefault,
    isArchived: category.isArchived,
  };
}

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(workspaceId: string): Promise<CategoryView[]> {
    const categories = await this.prisma.category.findMany({
      where: { workspaceId },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });
    return categories.map(toView);
  }

  async create(workspaceId: string, input: CreateCategoryInput): Promise<CategoryView> {
    try {
      const category = await this.prisma.category.create({
        data: {
          workspaceId,
          name: input.name,
          color: input.color,
          icon: input.icon,
          isDefault: false,
        },
      });
      return toView(category);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException('A category with that name already exists.');
      }
      throw error;
    }
  }

  async update(
    workspaceId: string,
    categoryId: string,
    input: UpdateCategoryInput,
  ): Promise<CategoryView> {
    const existing = await this.prisma.category.findFirst({
      where: { id: categoryId, workspaceId },
    });
    if (!existing) {
      throw new NotFoundException('Category not found.');
    }
    if (existing.isDefault && input.name !== undefined && input.name !== existing.name) {
      throw new ForbiddenException('Default categories cannot be renamed.');
    }

    try {
      const category = await this.prisma.category.update({
        where: { id: categoryId },
        data: {
          name: existing.isDefault ? undefined : input.name,
          color: input.color,
          icon: input.icon,
          isArchived: input.isArchived,
        },
      });
      return toView(category);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException('A category with that name already exists.');
      }
      throw error;
    }
  }

  /** Resolve a category by (case-insensitive) name. Used by chat tools. */
  async findByName(workspaceId: string, name: string): Promise<Category | null> {
    return this.prisma.category.findFirst({
      where: { workspaceId, name: { equals: name, mode: 'insensitive' }, isArchived: false },
    });
  }
}
