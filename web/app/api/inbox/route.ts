import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { guard } from '@/lib/requireTenant';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || '', process.env.SUPABASE_SERVICE_ROLE_KEY || '');

/** The signed-in user's workspace inbox, newest first. */
export async function GET(request: Request) {
  const g = await guard(request, new URL(request.url).searchParams.get('tenantId'));
  if (!g.ok) return g.response;
  try {
    const { data, error } = await supabase.from('inbound_emails').select('*')
      .eq('tenant_id', g.tenantId).order('created_at', { ascending: false }).limit(100);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data }, { status: 200 });
  } catch (error: any) {
    console.error('Inbox Fetch Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
