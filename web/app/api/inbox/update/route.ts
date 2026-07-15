import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

export async function POST(request: Request) {
  try {
    const { emailId, updates, tenantId } = await request.json();

    if (!emailId || !tenantId) {
      return NextResponse.json({ error: 'Missing emailId or tenantId' }, { status: 400 });
    }

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
