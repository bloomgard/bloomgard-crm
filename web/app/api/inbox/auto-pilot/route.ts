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
    const { threadId, isAutoPilot } = body;

    if (!tenantId || !threadId || typeof isAutoPilot !== 'boolean') {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const { error } = await supabase
      .from('thread_states')
      .upsert({
        thread_id: threadId,
        tenant_id: tenantId,
        is_auto_pilot: isAutoPilot,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'thread_id' });

    if (error) {
      console.error('Error updating thread state:', error);
      return NextResponse.json({ error: 'Failed to update auto-pilot state' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Auto-Pilot Update Route Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
