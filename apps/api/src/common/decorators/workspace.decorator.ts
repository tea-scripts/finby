import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { WorkspaceContext } from '../context';

/** Injects the resolved workspace context (set by WorkspaceMemberGuard). */
export const Workspace = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): WorkspaceContext | undefined => {
    return ctx.switchToHttp().getRequest<{ workspace?: WorkspaceContext }>().workspace;
  },
);
