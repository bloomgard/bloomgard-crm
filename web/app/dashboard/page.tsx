"use client";

import dynamic from 'next/dynamic';
import JaaliLoader from '@/components/JaaliLoader';

// ssr: false prevents Vercel build crash from Supabase/window references
const ClientDashboard = dynamic(() => import('./ClientDashboard'), {
  ssr: false,
  loading: () => <JaaliLoader />,
});

export default function DashboardPage() {
  return <ClientDashboard />;
}
