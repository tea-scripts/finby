'use client';
import { AuthGate } from '../../components/AuthGate';
import { AnnouncementsTable } from '../../components/AnnouncementsTable';

export default function AnnouncementsPage() {
  return (
    <AuthGate>
      <AnnouncementsTable />
    </AuthGate>
  );
}
