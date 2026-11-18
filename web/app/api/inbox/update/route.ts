import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { guard } from '@/lib/requireTenant';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const g = await guard(request, body?.tenantId || null);
    if (!g.ok) return g.response;
    const tenantId = g.tenantId;
    const emailId = body?.emailId;
    if (!emailId) return NextResponse.json({ error: 'Missing emailId' }, { status: 400 });
    // only the flags a person can set from the inbox, never other columns
    const updates = Object.fromEntries(Object.entries(body?.updates || {}).filter(([k]) => ['is_read', 'is_starred', 'is_deleted'].includes(k)).map(([k, v]) => [k, !!v]));
    if (!Object.keys(updates).length) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });

    const { error } = await supabase
      .from('inbound_emails')
      .update(updates)
      .eq('id', emailId)
      .eq('tenant_id', tenantId);

    if (error) {
      console.error("Inbox Update Error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: any) {
    console.error("Inbox Update Route Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
