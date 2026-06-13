'use client';
import { AuthGate } from '../../components/AuthGate';
import { TicketsTable } from '../../components/TicketsTable';

export default function TicketsPage() {
  return (
    <AuthGate>
      <TicketsTable />
    </AuthGate>
  );
}
