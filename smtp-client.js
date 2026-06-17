import dns from 'dns';
import net from 'net';
import { promisify } from 'util';

const resolveMx = promisify(dns.resolveMx);

// Simple function to extract domain from email
function getDomain(email) {
  const parts = email.split('@');
  return parts.length > 1 ? parts[1] : null;
}

// SMTP client execution
export async function sendEmailDirect({ from, to, subject, html, text, simulate = false }) {
  const domain = getDomain(to);
  if (!domain) {
    throw new Error(`Invalid recipient email domain: ${to}`);
  }

  // Generate mail content
  const textBody = text || html.replace(/<[^>]*>/g, '');
  const boundary = '----=_Part_' + Math.random().toString(36).substring(2);
  
  const rawMail = [
    `From: <${from}>`,
    `To: <${to}>`,
    `Subject: ${subject}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${Math.random().toString(36).substring(2)}@smtp.local>`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    `Content-Type: text/plain; charset="utf-8"`,
    `Content-Transfer-Encoding: 7bit`,
    '',
    textBody,
    '',
    `--${boundary}`,
    `Content-Type: text/html; charset="utf-8"`,
    `Content-Transfer-Encoding: 7bit`,
    '',
    html,
    '',
    `--${boundary}--`,
    '.'
  ].join('\r\n');

  if (simulate) {
    return {
      success: true,
      log: `Simulation mode active: Message accepted for delivery to ${to} (Simulated).`,
      mx: 'smtp.simulated.local'
    };
  }

  try {
    // 1. Resolve MX records
    console.log(`Resolving MX records for ${domain}...`);
    const mxRecords = await resolveMx(domain).catch(() => []);
    if (mxRecords.length === 0) {
      throw new Error(`No MX records found for domain: ${domain}`);
    }

    // Sort by priority (lowest priority value is highest priority)
    mxRecords.sort((a, b) => a.priority - b.priority);
    const mxHost = mxRecords[0].exchange;
    console.log(`Found MX record: ${mxHost} (Priority: ${mxRecords[0].priority})`);

    // 2. Connect to the MX Server
    return new Promise((resolve, reject) => {
      const socket = net.createConnection(25, mxHost);
      socket.setTimeout(10000); // 10s timeout
      
      let step = 0;
      let logBuffer = '';

      const sendCmd = (cmd) => {
        logBuffer += `CLIENT: ${cmd.trim()}\n`;
        socket.write(cmd + '\r\n');
      };

      socket.on('connect', () => {
        logBuffer += `Connected to MX host: ${mxHost}:25\n`;
      });

      socket.on('data', (data) => {
        const response = data.toString();
        logBuffer += `SERVER: ${response}`;
        
        const code = parseInt(response.substring(0, 3), 10);

        if (step === 0) {
          // Waiting for 220 Greeting
          if (code === 220) {
            step = 1;
            sendCmd(`EHLO smtp.local`);
          } else {
            socket.destroy(new Error(`Unexpected greeting: ${response}`));
          }
        } else if (step === 1) {
          // Waiting for 250 EHLO response
          if (code === 250) {
            step = 2;
            sendCmd(`MAIL FROM:<${from}>`);
          } else {
            socket.destroy(new Error(`EHLO failed: ${response}`));
          }
        } else if (step === 2) {
          // Waiting for 250 MAIL FROM response
          if (code === 250) {
            step = 3;
            sendCmd(`RCPT TO:<${to}>`);
          } else {
            socket.destroy(new Error(`MAIL FROM failed: ${response}`));
          }
        } else if (step === 3) {
          // Waiting for 250 RCPT TO response
          if (code === 250) {
            step = 4;
            sendCmd(`DATA`);
          } else {
            socket.destroy(new Error(`RCPT TO failed: ${response}`));
          }
        } else if (step === 4) {
          // Waiting for 354 Start Mail Input
          if (code === 354) {
            step = 5;
            sendCmd(rawMail);
          } else {
            socket.destroy(new Error(`DATA invitation failed: ${response}`));
          }
        } else if (step === 5) {
          // Waiting for 250 Delivery OK response
          if (code === 250) {
            step = 6;
            sendCmd(`QUIT`);
          } else {
            socket.destroy(new Error(`Message delivery failed: ${response}`));
          }
        } else if (step === 6) {
          // Bye
          socket.end();
          resolve({
            success: true,
            log: logBuffer,
            mx: mxHost
          });
        }
      });

      socket.on('timeout', () => {
        socket.destroy(new Error('Connection timeout (likely outbound port 25 blocked by ISP)'));
      });

      socket.on('error', (err) => {
        reject(new Error(`SMTP Delivery error on host ${mxHost}: ${err.message}. Connection Logs:\n${logBuffer}`));
      });
    });

  } catch (error) {
    throw new Error(`SMTP Direct Delivery Failed: ${error.message}`);
  }
}
