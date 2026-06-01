import { PrismaClient } from '@prisma/client';
import { DEFAULT_CATEGORIES } from '@budgy/shared';

const prisma = new PrismaClient();

const DEMO_WORKSPACE_SLUG = 'budgy-demo';

/**
 * Local-dev seed only. Creates one idempotent demo workspace so the
 * default categories can be inspected in Prisma Studio / psql.
 *
 * In the running app, the SAME DEFAULT_CATEGORIES are seeded per workspace
 * inside the POST /auth/register transaction (STEP 4) — this script does not
 * own that behaviour, it only mirrors it for a throwaway demo workspace.
 */
async function main(): Promise<void> {
  const workspace = await prisma.workspace.upsert({
    where: { slug: DEMO_WORKSPACE_SLUG },
    update: {},
    create: {
      name: 'Budgy Demo',
      slug: DEMO_WORKSPACE_SLUG,
      baseCurrency: 'USD',
    },
  });

  await prisma.category.createMany({
    data: DEFAULT_CATEGORIES.map((c) => ({
      workspaceId: workspace.id,
      name: c.name,
      color: c.color,
      icon: c.icon,
      isDefault: true,
    })),
    skipDuplicates: true,
  });

  const count = await prisma.category.count({ where: { workspaceId: workspace.id } });
  console.log(
    `Seeded workspace "${workspace.name}" (${workspace.slug}) with ${count} default categories.`,
  );
}

main()
  .catch((e: unknown) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
