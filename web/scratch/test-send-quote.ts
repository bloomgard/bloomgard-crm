import { getDynamicSender, sendEmail } from './lib/postal';

async function test() {
  const companyName = 'Test Company';
  const customSender = 'test@example.com';
  
  const fromString = getDynamicSender(companyName, customSender, undefined);
  console.log('Sending from:', fromString);
  
  try {
    const result = await sendEmail({
      from: fromString,
      to: 'anshag239@gmail.com',
      subject: 'Test Custom Sender with Resend',
      text: 'Testing if native Resend implementation and fallback work properly'
    });
    console.log('Result with fallback:', result);
  } catch (err: any) {
    console.error('Error with fallback:', err.message);
  }
}

test();
