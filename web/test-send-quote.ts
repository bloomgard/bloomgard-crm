import { getMailTransporter, getDynamicSender, sendMailWithFallback } from './lib/postal';
import nodemailer from 'nodemailer';

async function test() {
  const provider = 'postal';
  const companyName = 'Test Company';
  const customSender = 'test@example.com';
  
  const fromString = getDynamicSender(companyName, customSender, undefined);
  console.log('Sending from:', fromString);
  
  const transporter = getMailTransporter(provider);
  try {
    const result = await sendMailWithFallback(transporter, {
      from: fromString,
      to: 'anshagarwal@example.com',
      subject: 'Test Custom Sender',
      text: 'Testing if custom sender works'
    });
    console.log('Result with fallback:', result);
  } catch (err) {
    console.error('Error with fallback:', err.message);
  }
}

test();
