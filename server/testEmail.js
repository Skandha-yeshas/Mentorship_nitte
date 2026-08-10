import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
dotenv.config();

const user = (process.env.GMAIL_USER || 'skandhayashu2906@gmail.com').trim();
const rawPass = process.env.GMAIL_APP_PASS || '';
const pass = rawPass.replace(/[\s"']/g, '').trim();

console.log('--- NITTE Mentorship Gmail Sender Diagnostic ---');
console.log(`Sender Gmail: ${user}`);
console.log(`Raw App Password Length: ${rawPass.length} chars`);
console.log(`Sanitized App Password Length: ${pass.length} chars (spaces/quotes removed)`);

if (!pass) {
  console.log('\n❌ GMAIL_APP_PASS is empty in server/.env.');
  process.exit(0);
}

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: { user, pass },
  tls: { rejectUnauthorized: false }
});

async function sendTest() {
  try {
    console.log('\nConnecting to smtp.gmail.com:465...');
    await transporter.verify();
    console.log('✅ SMTP Connection & Authentication Successful!');

    console.log('Sending real test email to RO Officer (skandhayashu2906@gmail.com)...');
    let info1 = await transporter.sendMail({
      from: `"NITTE Student Support" <${user}>`,
      to: 'skandhayashu2906@gmail.com',
      subject: '[TEST ALERT] New Student Issue Received',
      html: '<h3>Test Issue Alert for RO Officer</h3><p>Student from skandhayashas2906@gmail.com submitted an issue.</p>'
    });
    console.log('🎉 REAL EMAIL DELIVERED to skandhayashu2906@gmail.com! Message ID:', info1.messageId);

    console.log('Sending real test email to Student (skandhayashas2906@gmail.com)...');
    let info2 = await transporter.sendMail({
      from: `"NITTE Student Support" <${user}>`,
      to: 'skandhayashas2906@gmail.com',
      subject: '[TEST CONFIRMATION] Ticket Submitted',
      html: '<h3>Test Ticket Confirmation for Student</h3><p>Your issue has been forwarded to RO Officer at skandhayashu2906@gmail.com.</p>'
    });
    console.log('🎉 REAL EMAIL DELIVERED to skandhayashas2906@gmail.com! Message ID:', info2.messageId);

  } catch (err) {
    console.error('\n❌ SMTP Auth/Delivery Error:', err.message);
    if (err.message.includes('535') || err.message.includes('BadCredentials')) {
      console.log('\n💡 HOW TO FIX 535 Bad Credentials Error:');
      console.log('1. Ensure 2-Step Verification is turned ON for skandhayashu2906@gmail.com');
      console.log('   Go to: https://myaccount.google.com/signinoptions/two-step-verification');
      console.log('2. Generate a fresh App Password at: https://myaccount.google.com/apppasswords');
      console.log('3. Paste the 16-character app password into server/.env: GMAIL_APP_PASS=your_16_char_password');
    }
  }
}

sendTest();
