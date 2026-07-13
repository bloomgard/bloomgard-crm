import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://dummy.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy_key'; 
const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

export async function POST(request: Request) {
  try {
    const { email, password, role, tenantId } = await request.json();

    if (!email || !password || !tenantId) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 });
    }

    // 1. Create user in Supabase Auth
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    });

    let userId = authData?.user?.id;

    if (authError) {
      if (authError.message.includes("already registered") || authError.message.includes("already exists")) {
        // Fetch existing user from profiles table
        const { data: existingUser } = await supabaseAdmin
          .from('profiles')
          .select('id')
          .eq('email', email)
          .single();
          
        if (existingUser) {
          userId = existingUser.id;
          
          // Optionally update the user's password since they are being re-onboarded
          await supabaseAdmin.auth.admin.updateUserById(userId, { password });
        } else {
           throw new Error("User registered in auth but profile not found.");
        }
      } else {
        throw authError;
      }
    }

    if (!userId) {
      throw new Error("Could not create or retrieve User ID.");
    }

    // 2. Update/Insert Profile
    const { error: pErr } = await supabaseAdmin
      .from("profiles")
      .upsert({ 
        id: userId, 
        email: email, 
        tenant_id: tenantId, 
        role: role 
      }, { onConflict: 'id' });
    
    if (pErr) throw pErr;

    return NextResponse.json({ success: true, userId });

  } catch (error: any) {
    console.error('Create User Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
