import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendEmail } from '@/lib/postal';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

const AI_API_KEY = process.env.OPENROUTER_API_KEY || '';
const AI_MODEL = 'openai/gpt-4o-mini';

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const { threadId, tenantId } = await request.json();

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
