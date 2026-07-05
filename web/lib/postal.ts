import nodemailer from 'nodemailer';

export const getMailTransporter = (providerOverride?: string) => {
  const isPostal = providerOverride === 'postal' || process.env.EMAIL_PROVIDER === 'postal';
  
  return nodemailer.createTransport({
    host: isPostal ? (process.env.POSTAL_SMTP_HOST || 'mail.bloomgard.co') : 'smtp.resend.com',
    port: isPostal ? parseInt(process.env.POSTAL_SMTP_PORT || '2525') : 465,
    // Port 587 and 2525 use standard STARTTLS upgrade, so secure (implicit SSL) is false
    secure: isPostal ? (process.env.POSTAL_SMTP_SECURE === 'true') : true, 
    auth: { 
      user: isPostal ? process.env.POSTAL_SMTP_USER || '' : 'resend', 
      pass: isPostal ? process.env.POSTAL_SMTP_PASS || '' : process.env.RESEND_API_KEY || '' 
    }
  });
};

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

export const sendMailWithFallback = async (transporter: nodemailer.Transporter, mailOptions: any) => {
  try {
    return await transporter.sendMail(mailOptions);
  } catch (error: any) {
    // Handle unverified domain errors (Postal 530, Resend 403)
    if (error.responseCode === 530 || error.statusCode === 403 || error.code === 'EMESSAGE' || error.message?.includes('530')) {
      console.warn('Sender rejected due to unverified domain, falling back to info@bloomgard.co');
      const fallbackOptions = { ...mailOptions };
      
      let namePart = 'Bloomgard erp';
      let originalEmail = '';
      if (typeof fallbackOptions.from === 'string') {
        const match = fallbackOptions.from.match(/^(.*?)<(.*?)>$/);
        if (match) {
          namePart = match[1].trim();
          originalEmail = match[2].trim();
        } else {
          originalEmail = fallbackOptions.from.trim();
        }
      }
      
      if (!fallbackOptions.replyTo && originalEmail) {
        fallbackOptions.replyTo = originalEmail;
      }
      
      fallbackOptions.from = `${namePart} <info@bloomgard.co>`;
      return await transporter.sendMail(fallbackOptions);
    }
    throw error;
  }
};
