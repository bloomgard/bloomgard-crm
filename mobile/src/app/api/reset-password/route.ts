import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://dummy.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy_key'; 
const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

export async function POST(request: Request) {
  try {
    const { userId, tenantId, requesterId } = await request.json();

    if (!userId || !tenantId || !requesterId) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 });
    }

    // Verify requester is an Admin or Manager for the same tenant
    const { data: requester, error: reqErr } = await supabaseAdmin
      .from('profiles')
      .select('role, tenant_id')
      .eq('id', requesterId)
      .single();

    if (reqErr || !requester) {
      return NextResponse.json({ success: false, error: 'Unauthorized requester' }, { status: 401 });
    }
    
    if (requester.tenant_id !== tenantId || (requester.role !== 'admin' && requester.role !== 'manager')) {
      return NextResponse.json({ success: false, error: 'Permission denied' }, { status: 403 });
    }

    // Verify target user is in the same tenant
    const { data: targetUser, error: targetErr } = await supabaseAdmin
      .from('profiles')
      .select('tenant_id')
      .eq('id', userId)
      .single();

    if (targetErr || !targetUser || targetUser.tenant_id !== tenantId) {
      return NextResponse.json({ success: false, error: 'Target user not found in this workspace' }, { status: 404 });
    }

    // Generate a secure random password
    const newPassword = crypto.randomBytes(8).toString('hex') + "X!"; 

    // Reset password using Admin Auth API
    const { data: updateData, error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      password: newPassword,
    });

    if (updateError) {
      throw updateError;
    }

    return NextResponse.json({ success: true, newPassword });

  } catch (error: any) {
    console.error('Password Reset Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
