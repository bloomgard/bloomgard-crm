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
