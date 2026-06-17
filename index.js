import dotenv from 'dotenv';
import { startSmtpServer } from './smtp-server.js';
import { startApiServer } from './api-server.js';

dotenv.config();

const API_PORT = process.env.PORT;
const SMTP_PORT = process.env.SMTP_PORT;
const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_DOMAIN = process.env.SMTP_DOMAIN;

console.log('Initializing Custom SMTP Protocol Service and REST API...');

// 1. Initialize API Server
const { app, server: apiServer } = startApiServer({
  port: API_PORT,
  smtpPort: SMTP_PORT,
  smtpHost: SMTP_HOST,
  smtpDomain: SMTP_DOMAIN
});

// 2. Initialize SMTP Server (listening for incoming SMTP connections)
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
console.log(`📧 SMTP Server URI: smtp://${SMTP_HOST}:${SMTP_PORT}`);
console.log('--------------------------------------------------');
