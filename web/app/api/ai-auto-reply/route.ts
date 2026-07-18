import { NextResponse } from 'next/server';
import { processAiAutoReply } from '@/lib/ai-agent';

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const { threadId, tenantId } = await request.json();

    if (!threadId || !tenantId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const success = await processAiAutoReply(threadId, tenantId);

    if (success) {
      return NextResponse.json({ success: true, message: 'Auto-pilot reply sent.' }, { status: 200 });
    } else {
      return NextResponse.json({ error: 'Failed to process AI reply or skipped.' }, { status: 500 });
    }
  } catch (error: any) {
    console.error('Auto-Pilot Engine Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
