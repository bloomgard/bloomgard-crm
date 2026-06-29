import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import nodemailer from 'nodemailer';

const resend = new Resend(process.env.RESEND_API_KEY || 'dummy_key');

// Define headers that allow Android WebView to communicate with the server
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept',
};

// 1. The Preflight Handler (Android needs this)
export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { to, cc, bcc, subject, message, attachments, agentEmail, companyName, customSender, provider } = body;

    if (!to || !subject || !message) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400, headers: corsHeaders });
    }

    const fallbackSender = 'bloomgarderp@gmail.com'; 
    const senderAddress = customSender || fallbackSender;
    const fromString = `${companyName || 'Bloomgard System'} <${senderAddress}>`;

    const formattedAttachments = attachments?.map((att: any) => ({
      filename: att.filename,
      content: att.base64.includes(',') ? att.base64.split(',')[1] : att.base64,
      encoding: 'base64'
    })) || [];

    const emailPayload: any = {
      from: fromString,
      to: to.split(',').map((s: string)=>s.trim()),
      replyTo: agentEmail,
      subject: subject,
      text: message, 
      attachments: formattedAttachments,
    };
    
    if (cc && cc.trim()) emailPayload.cc = cc.split(',').map((s: string)=>s.trim());
    if (bcc && bcc.trim()) emailPayload.bcc = bcc.split(',').map((s: string)=>s.trim());

    let data;
    const isPostal = provider === 'postal' || process.env.EMAIL_PROVIDER === 'postal';

    if (isPostal) {
      const transporter = nodemailer.createTransport({
        host: process.env.POSTAL_SMTP_HOST,
        port: parseInt(process.env.POSTAL_SMTP_PORT || '2525'),
        auth: { 
          user: process.env.POSTAL_SMTP_USER || '', 
          pass: process.env.POSTAL_SMTP_PASS || '' 
        }
      });
      data = await transporter.sendMail(emailPayload);
    } else {
      const result = await resend.emails.send(emailPayload);
      if (result.error) {
        console.error('Resend API Rejection:', result.error);
        return NextResponse.json({ success: false, error: result.error.message }, { status: 400, headers: corsHeaders });
      }
      data = result.data;
    }

    return NextResponse.json({ success: true, data }, { status: 200, headers: corsHeaders });

  } catch (error: any) {
    console.error('Server Crash:', error);
    return NextResponse.json({ success: false, error: error.message || 'Internal Server Error' }, { status: 500, headers: corsHeaders });
  }
}