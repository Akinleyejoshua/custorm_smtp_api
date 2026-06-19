import net from 'net';

export function parseRawEmail(raw) {
  // Split headers and body
  const boundaryIndex = raw.indexOf('\r\n\r\n');
  let headerSection = '';
  let bodySection = '';

  if (boundaryIndex !== -1) {
    headerSection = raw.substring(0, boundaryIndex);
    bodySection = raw.substring(boundaryIndex + 4);
  } else {
    headerSection = raw;
  }

  const headers = {};
  const headerLines = headerSection.split('\r\n');
  let lastKey = null;

  for (const line of headerLines) {
    if (line.startsWith(' ') || line.startsWith('\t')) {
      if (lastKey) {
        headers[lastKey] += ' ' + line.trim();
      }
    } else {
      const colonIdx = line.indexOf(':');
      if (colonIdx !== -1) {
        const key = line.slice(0, colonIdx).trim().toLowerCase();
        const value = line.slice(colonIdx + 1).trim();
        headers[key] = value;
        lastKey = key;
      }
    }
  }

  return {
    headers,
    subject: headers['subject'] || '(No Subject)',
    from: headers['from'] || '',
    to: headers['to'] || '',
    body: bodySection.trim()
  };
}

export function startSmtpServer({ port, host, onMessageReceived }) {
  const server = net.createServer((socket) => {
    let state = 'INIT';
    let mailFrom = '';
    const rcptTo = [];
    let dataBuffer = '';

    socket.setEncoding('utf8');

    // Welcome message
    socket.write('220 smtp.local ESMTP Custom Node.js SMTP Server Ready\r\n');

    let incomingData = '';

    socket.on('data', (chunk) => {
      incomingData += chunk;
      
      while (incomingData.includes('\r\n')) {
        const lineEndIdx = incomingData.indexOf('\r\n');
        const line = incomingData.substring(0, lineEndIdx);
        incomingData = incomingData.substring(lineEndIdx + 2);

        if (state === 'DATA') {
          // In DATA mode, look for lone '.' on a line to end the transaction
          if (line === '.') {
            state = 'INIT';
            const parsed = parseRawEmail(dataBuffer);
            
            const emailRecord = {
              id: 'rcv_' + Math.random().toString(36).substr(2, 9),
              type: 'received',
              timestamp: new Date().toISOString(),
              from: mailFrom || parsed.from,
              to: rcptTo.length > 0 ? rcptTo : [parsed.to],
              subject: parsed.subject,
              body: parsed.body,
              raw: dataBuffer
            };

            onMessageReceived(emailRecord);

            socket.write('250 2.0.0 OK: Message accepted for delivery\r\n');
            dataBuffer = '';
            mailFrom = '';
            rcptTo.length = 0;
          } else {
            // Un-escape leading dot (SMTP transparent dot stuffing)
            let cleanLine = line;
            if (line.startsWith('..')) {
              cleanLine = line.substring(1);
            }
            dataBuffer += cleanLine + '\r\n';
          }
        } else {
          // Parse standard SMTP commands
          const upperLine = line.toUpperCase().trim();
          const cmd = upperLine.split(' ')[0];

          if (cmd === 'EHLO' || cmd === 'HELO') {
            socket.write('250-smtp.local greets you\r\n250-8BITMIME\r\n250 HELP\r\n');
          } else if (cmd === 'MAIL') {
            // Format: MAIL FROM:<sender@domain.com>
            const match = line.match(/FROM:\s*<([^>]+)>/i);
            if (match) {
              mailFrom = match[1];
              socket.write('250 2.1.0 OK\r\n');
            } else {
              socket.write('501 5.5.4 Syntax error in parameters\r\n');
            }
          } else if (cmd === 'RCPT') {
            // Format: RCPT TO:<recipient@domain.com>
            const match = line.match(/TO:\s*<([^>]+)>/i);
            if (match) {
              rcptTo.push(match[1]);
              socket.write('250 2.1.5 OK\r\n');
            } else {
              socket.write('501 5.5.4 Syntax error in parameters\r\n');
            }
          } else if (cmd === 'DATA') {
            state = 'DATA';
            socket.write('354 Start mail input; end with <CRLF>.<CRLF>\r\n');
          } else if (cmd === 'RSET') {
            mailFrom = '';
            rcptTo.length = 0;
            dataBuffer = '';
            state = 'INIT';
            socket.write('250 2.0.0 OK\r\n');
          } else if (cmd === 'QUIT') {
            socket.write('221 2.0.0 Bye\r\n');
            socket.end();
            return;
          } else if (cmd === 'NOOP') {
            socket.write('250 2.0.0 OK\r\n');
          } else {
            socket.write('500 5.5.1 Command unrecognized\r\n');
          }
        }
      }
    });

    socket.on('error', (err) => {
      console.error('SMTP Socket Error:', err.message);
    });
  });

  server.listen(port, host || '0.0.0.0', () => {
    console.log(`SMTP Server running on smtp://${host || '0.0.0.0'}:${port}`);
  });

  return server;
}
