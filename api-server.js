import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { sendEmailDirect } from './smtp-client.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LOG_FILE_PATH = path.join(__dirname, 'mail-logs.json');

// Initialize logs store
let mailLogs = [];
try {
  if (fs.existsSync(LOG_FILE_PATH)) {
    const rawData = fs.readFileSync(LOG_FILE_PATH, 'utf8');
    mailLogs = JSON.parse(rawData);
  }
} catch (e) {
  console.error('Failed to parse logs file, starting fresh:', e.message);
  mailLogs = [];
}

function saveLogs() {
  try {
    fs.writeFileSync(LOG_FILE_PATH, JSON.stringify(mailLogs, null, 2), 'utf8');
  } catch (e) {
    console.error('Failed to write logs to disk:', e.message);
  }
}

export function startApiServer({ port, smtpPort, smtpHost, smtpDomain }) {
  const app = express();

  app.use(cors());
  app.use(express.json());
  app.use(express.static(path.join(__dirname, 'public')));

  // Add a received message helper (called by SMTP Server)
  app.addReceivedLog = (emailRecord) => {
    mailLogs.unshift(emailRecord);
    // Limit to 500 logs to prevent memory leaks
    if (mailLogs.length > 500) mailLogs.pop();
    saveLogs();
  };

  // 1. GET Server status
  app.get('/api/status', (req, res) => {
    res.json({
      status: 'online',
      uptime: process.uptime(),
      smtp: {
        host: smtpHost,
        port: smtpPort,
        domain: smtpDomain
      },
      api: {
        port: port
      },
      stats: {
        totalSent: mailLogs.filter(m => m.type === 'sent' && m.status === 'success').length,
        totalFailed: mailLogs.filter(m => m.type === 'sent' && m.status === 'failed').length,
        totalReceived: mailLogs.filter(m => m.type === 'received').length,
      }
    });
  });

  // 2. GET Email Logs
  app.get('/api/logs', (req, res) => {
    res.json(mailLogs);
  });

  // 3. DELETE Clear Logs
  app.delete('/api/logs', (req, res) => {
    mailLogs = [];
    saveLogs();
    res.json({ success: true, message: 'Logs cleared successfully' });
  });

  // 4. POST send email
  app.post('/api/send', async (req, res) => {
    const { to, subject, html, text, from, simulate = true } = req.body;

    if (!to || !subject || !html) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: to, subject, and html are required.'
      });
    }

    // Parse recipients
    let recipients = [];
    if (Array.isArray(to)) {
      recipients = to;
    } else if (typeof to === 'string') {
      recipients = to.split(',').map(email => email.trim()).filter(Boolean);
    }

    if (recipients.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid recipient email address found.'
      });
    }

    const sender = from || `noreply@${smtpDomain}`;
    const results = [];
    
    // Process sending to all recipients asynchronously
    for (const recipient of recipients) {
      const emailRecord = {
        id: 'snd_' + Math.random().toString(36).substr(2, 9),
        type: 'sent',
        timestamp: new Date().toISOString(),
        from: sender,
        to: recipient,
        subject: subject,
        body: html,
        status: 'pending',
        log: '',
        mx: ''
      };

      try {
        const response = await sendEmailDirect({
          from: sender,
          to: recipient,
          subject,
          html,
          text,
          simulate
        });

        emailRecord.status = 'success';
        emailRecord.log = response.log;
        emailRecord.mx = response.mx;
      } catch (err) {
        emailRecord.status = 'failed';
        emailRecord.log = err.message;
      }

      mailLogs.unshift(emailRecord);
      results.push(emailRecord);
    }

    // Limit to 500 logs to prevent memory leaks
    if (mailLogs.length > 500) {
      mailLogs = mailLogs.slice(0, 500);
    }
    saveLogs();

    const successCount = results.filter(r => r.status === 'success').length;
    const failureCount = results.filter(r => r.status === 'failed').length;

    res.json({
      success: true,
      summary: {
        total: recipients.length,
        success: successCount,
        failed: failureCount
      },
      results
    });
  });

  const server = app.listen(port, '0.0.0.0', () => {
    console.log(`API Server running on http://0.0.0.0:${port}`);
  });

  return { app, server };
}
