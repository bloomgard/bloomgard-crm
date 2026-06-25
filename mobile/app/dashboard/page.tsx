"use client";

import dynamic from 'next/dynamic';

// ssr: false prevents Vercel build crash from Supabase/window references
const ClientDashboard = dynamic(() => import('./ClientDashboard'), {
  ssr: false,
  loading: () => (
    <div className="h-screen flex items-center justify-center bg-gray-50">
      <p className="font-semibold text-[12px] tracking-widest text-gray-500 uppercase animate-pulse">
        Initializing Workspace...
      </p>
    </div>
  ),
});

export default function DashboardPage() {
  return <ClientDashboard />;
}
