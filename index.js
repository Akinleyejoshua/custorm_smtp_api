import dotenv from 'dotenv';
import { startSmtpServer } from './smtp-server.js';
import { startApiServer } from './api-server.js';

dotenv.config();

const API_PORT = process.env.PORT || 3030;
const SMTP_PORT = process.env.SMTP_PORT || 2525;
const SMTP_HOST = process.env.SMTP_HOST || '0.0.0.0';
const SMTP_DOMAIN = process.env.SMTP_DOMAIN || 'smtp.local';
const NODE_ENV = process.env.NODE_ENV || 'development';
const ENABLE_SMTP = process.env.ENABLE_SMTP !== 'false' && NODE_ENV !== 'production';

console.log('Initializing Custom SMTP Protocol Service and REST API...');

// 1. Initialize API Server
const { app, server: apiServer } = startApiServer({
  port: API_PORT,
  smtpPort: SMTP_PORT,
  smtpHost: SMTP_HOST,
  smtpDomain: SMTP_DOMAIN
});

// 2. Initialize SMTP Server (only in development — Render only exposes one HTTP port)
if (ENABLE_SMTP) {
  const smtpServer = startSmtpServer({
    port: SMTP_PORT,
    host: SMTP_HOST,
    onMessageReceived: (emailRecord) => {
      console.log(`[SMTP Server] Received new email from ${emailRecord.from} to ${emailRecord.to.join(', ')}`);
      app.addReceivedLog(emailRecord);
    }
  });
  console.log('--------------------------------------------------');
  console.log(`🚀 API Testing UI: http://localhost:${API_PORT}`);
  console.log(`📧 SMTP Server URI: smtp://localhost:${SMTP_PORT}`);
  console.log('--------------------------------------------------');
} else {
  console.log('--------------------------------------------------');
  console.log(`🚀 API Testing UI: http://localhost:${API_PORT}`);
  console.log(`📧 SMTP Server: disabled (production mode)`);
  console.log('--------------------------------------------------');
}
