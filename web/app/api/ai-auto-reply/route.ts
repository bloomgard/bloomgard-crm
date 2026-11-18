import { NextResponse } from 'next/server';
import { guard } from '@/lib/requireTenant';
import { createClient } from '@supabase/supabase-js';
import { sendEmail } from '@/lib/email';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

const AI_API_KEY = process.env.OPENROUTER_API_KEY || '';
const AI_MODEL = 'openai/gpt-4o-mini';

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    // the workspace comes from the caller's session (or an in-process server call), never from the body
    const g = await guard(request, body?.tenantId || body?.parsedTenantId || null);
    if (!g.ok) return g.response;
    body.tenantId = g.tenantId;
    const { threadId, tenantId } = body;

    if (!threadId || !tenantId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const { processAiAutoReply } = require('@/lib/ai-reply');
    const result = await processAiAutoReply(threadId, tenantId);

    if (result.success) {
      return NextResponse.json(result, { status: 200 });
    } else {
      return NextResponse.json(result, { status: 500 });
    }
  } catch (error: any) {
    console.error('Auto-Pilot Engine Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
