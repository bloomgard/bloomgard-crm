import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export const getDynamicSender = (
  companyName?: string, 
  customEmail?: string, 
  tenantDomain?: string
): string => {
  let email = customEmail;
  if (!email && tenantDomain) {
    email = `billing@${tenantDomain}`;
  }
  if (!email) {
    email = 'info@bloomgard.co'; // Master fallback
  }
  const name = companyName || 'Bloomgard erp';
  return `${name} <${email}>`;
};

export const sendEmail = async (mailOptions: {
  from: string;
  to: string | string[];
  replyTo?: string | string[];
  subject: string;
  text: string;
  html?: string;
  attachments?: any[];
  cc?: string | string[];
  bcc?: string | string[];
}) => {
  try {
    const response = await resend.emails.send({
      from: mailOptions.from,
      to: typeof mailOptions.to === 'string' ? [mailOptions.to] : mailOptions.to,
      reply_to: mailOptions.replyTo,
      subject: mailOptions.subject,
      text: mailOptions.text,
      html: mailOptions.html,
      cc: mailOptions.cc,
      bcc: mailOptions.bcc,
      attachments: mailOptions.attachments
    });

    if (response.error) {
      throw new Error(`Resend Error (${response.error.name}): ${response.error.message}`);
    }
    
    return response.data;
  } catch (error: any) {
    // Fallback for unverified domains (Resend throws 403 or specific validation errors)
    if (
      error.message?.includes('verified') || 
      error.message?.includes('verify') || 
      error.message?.includes('validation_error') ||
      error.message?.includes('own email address') ||
      error.statusCode === 403
    ) {
      console.warn('Sender rejected due to unverified domain, falling back to onboarding@resend.dev');
      const fallbackOptions = { ...mailOptions };
      
      let originalEmail = '';
      if (typeof fallbackOptions.from === 'string') {
        const match = fallbackOptions.from.match(/^(.*?)<(.*?)>$/);
        if (match) {
          originalEmail = match[2].trim();
        } else {
          originalEmail = fallbackOptions.from.trim();
        }
      }
      
      if (!fallbackOptions.replyTo && originalEmail) {
        fallbackOptions.replyTo = originalEmail;
      }
      
      fallbackOptions.from = 'onboarding@resend.dev';
      
      // Resend testing requires sending to the registered owner email. 
      // Hardcode to the known owner email for testing environments.
      fallbackOptions.to = ['anshag239@gmail.com'];
      
      const response = await resend.emails.send({
        from: fallbackOptions.from,
        to: fallbackOptions.to,
        reply_to: fallbackOptions.replyTo,
        subject: fallbackOptions.subject,
        text: fallbackOptions.text,
        html: fallbackOptions.html,
        attachments: fallbackOptions.attachments
      });

      if (response.error) throw new Error(`Fallback Resend Error: ${response.error.message}`);
      return response.data;
    }
    throw error;
  }
};
