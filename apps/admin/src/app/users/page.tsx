'use client';
import { AuthGate } from '../../components/AuthGate';
import { UsersTable } from '../../components/UsersTable';

export default function UsersPage() {
  return (
    <AuthGate>
      <UsersTable />
    </AuthGate>
  );
}
