'use client';
import { useEffect, useState } from 'react';
import type { AdminUserRow, AdminUsersPage } from '@finby/shared';
import { api } from '../lib/api';
import { useAuthStore } from '../lib/auth-store';
import { AdminShell } from './AdminShell';
import { Button } from './ui/button';
import { Dropdown } from './ui/dropdown';
import { Input } from './ui/input';

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/** Compact elapsed duration since an ISO date, e.g. "3mo", "1y 2mo". */
function since(iso: string): string {
  const days = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
  if (days < 1) return 'today';
  if (days < 31) return `${days}d`;
  if (days < 365) return `${Math.floor(days / 30)}mo`;
  return `${Math.floor(days / 365)}y ${Math.floor((days % 365) / 30)}mo`;
}

function PlanCell({ subscription }: { subscription: AdminUserRow['subscription'] }) {
  if (!subscription) return <span className="text-sm text-faint">Free</span>;
  return (
    <span className="inline-flex items-center rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent">
      {subscription.tier}
      {subscription.status !== 'ACTIVE' && (
        <span className="ml-1 text-warn">· {subscription.status}</span>
      )}
    </span>
  );
}

function UserRow({ user }: { user: AdminUserRow }) {
  return (
    <tr>
      <td className="px-4 py-3">
        <p className="font-medium text-ink">{user.displayName}</p>
        <p className="truncate text-xs text-faint">
          {user.email}
          {!user.emailVerified && <span className="ml-1.5 text-xs text-warn">unverified</span>}
        </p>
      </td>
      <td className="px-4 py-3 text-sm text-muted">{shortDate(user.createdAt)}</td>
      <td className="px-4 py-3 text-sm text-muted">
        {user.lastLoginAt ? shortDate(user.lastLoginAt) : <span className="text-faint">—</span>}
      </td>
      <td className="px-4 py-3">
        <PlanCell subscription={user.subscription} />
      </td>
      <td className="px-4 py-3 text-sm text-muted">
        {user.subscription ? (
          <>
            {shortDate(user.subscription.startedAt)}{' '}
            <span className="text-faint">· {since(user.subscription.startedAt)}</span>
          </>
        ) : (
          <span className="text-faint">—</span>
        )}
      </td>
    </tr>
  );
}

const HEADERS = ['User', 'Joined', 'Last active', 'Plan', 'Subscribed'] as const;

type PlanFilter = '' | 'free' | 'PRO' | 'PREMIUM' | 'FAMILY';
type SortOrder = 'newest' | 'oldest';

const PLAN_OPTIONS = [
  { value: '', label: 'All plans' },
  { value: 'free', label: 'Free' },
  { value: 'PRO', label: 'Pro' },
  { value: 'PREMIUM', label: 'Premium' },
  { value: 'FAMILY', label: 'Family' },
];

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
];

export function UsersTable() {
  const setToken = useAuthStore((s) => s.setToken);
  const [data, setData] = useState<AdminUsersPage | null>(null);
  const [err, setErr] = useState(false);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [plan, setPlan] = useState<PlanFilter>('');
  const [sort, setSort] = useState<SortOrder>('newest');

  // Debounce the live input so we don't hammer the (throttled) endpoint per keystroke.
  useEffect(() => {
    const t = setTimeout(() => {
      setQuery(search.trim());
      setPage(1); // new filter → first page
    }, 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    // Guard against out-of-order responses: a slow earlier request must not
    // overwrite the result of a newer one fired while typing.
    let stale = false;
    api
      .users(page, query, plan, sort)
      .then((d) => {
        if (!stale) {
          setData(d);
          setErr(false); // a fresh success clears any earlier transient failure
        }
      })
      .catch(() => {
        if (!stale) setErr(true);
      });
    return () => {
      stale = true;
    };
  }, [page, query, plan, sort]);

  if (err)
    return (
      <AdminShell>
        <div className="flex flex-col items-start gap-4 rounded-2xl border border-line bg-surface p-8 shadow-card">
          <p className="text-ink">Failed to load users.</p>
          <Button variant="ghost" onClick={() => setToken(null)}>
            Sign out
          </Button>
        </div>
      </AdminShell>
    );
  if (!data)
    return (
      <AdminShell>
        <div className="py-24 text-center text-muted">Loading…</div>
      </AdminShell>
    );

  const { users, total, pageSize } = data;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <AdminShell>
      <div className="space-y-4">
        <h1 className="font-display text-xl font-bold tracking-tight text-ink">Users</h1>

        <div className="flex flex-wrap items-center gap-2">
          <Input
            className="min-w-[14rem] flex-1"
            placeholder="Search name or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Dropdown
            aria-label="Filter by plan"
            className="w-40"
            value={plan}
            options={PLAN_OPTIONS}
            onChange={(v) => {
              setPlan(v as PlanFilter);
              setPage(1);
            }}
          />
          <Dropdown
            aria-label="Sort"
            className="w-40"
            value={sort}
            options={SORT_OPTIONS}
            onChange={(v) => {
              setSort(v as SortOrder);
              setPage(1);
            }}
          />
        </div>

        <section className="overflow-hidden rounded-xl border border-line bg-surface shadow-card">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                  {HEADERS.map((h) => (
                    <th key={h} className="px-4 py-3.5 font-semibold">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={HEADERS.length} className="px-4 py-10 text-center text-sm text-muted">
                      No users found.
                    </td>
                  </tr>
                ) : (
                  users.map((user) => <UserRow key={user.id} user={user} />)
                )}
              </tbody>
            </table>
          </div>
        </section>

        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-faint">
            Showing {from}–{to} of {total}
          </p>
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              className="px-3 py-1.5"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Prev
            </Button>
            <span className="text-sm text-muted">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="ghost"
              className="px-3 py-1.5"
              disabled={page * pageSize >= total}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
