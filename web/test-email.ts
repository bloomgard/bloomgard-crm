import { Resend } from 'resend';
import nodemailer from 'nodemailer';

const resend = new Resend('re_YTHzTr5S_5yo7hedSKXA9cBXAgH2ACWPo');

async function testResend() {
  console.log('Testing Resend...');
  try {
    const result = await resend.emails.send({
      from: 'Bloomgard System <info@bloomgard.co>',
      to: ['anshagarwal@example.com'],
      subject: 'Test Resend',
      text: 'This is a test message',
    });
    console.log('Resend Result:', result);
  } catch (error) {
    console.error('Resend Error:', error);
  }
}

async function testPostal() {
  console.log('Testing Postal...');
  try {
    const transporter = nodemailer.createTransport({
      host: 'mail.bloomgard.co',
      port: 2525,
      auth: { 
        user: 'postal', 
        pass: '8a6RLrLoDKmF5oa5dBPHRQaI' 
      }
    });
    const result = await transporter.sendMail({
      from: 'Bloomgard System <info@bloomgard.co>',
      to: 'anshagarwal@example.com',
      subject: 'Test Postal',
      text: 'This is a test message',
    });
    console.log('Postal Result:', result);
  } catch (error) {
    console.error('Postal Error:', error);
  }
}

async function main() {
  await testResend();
  await testPostal();
}

main();
