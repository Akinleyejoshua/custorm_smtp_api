document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const tabButtons = document.querySelectorAll('.nav-item');
  const tabPanes = document.querySelectorAll('.tab-pane');
  const pageTitle = document.getElementById('page-title');
  const refreshBtn = document.getElementById('refresh-btn');
  const clearLogsBtn = document.getElementById('clear-logs-btn');

  // Stats Elements
  const statSent = document.getElementById('stat-sent');
  const statReceived = document.getElementById('stat-received');
  const statFailed = document.getElementById('stat-failed');
  const statUptime = document.getElementById('stat-uptime');
  
  // Status Dots
  const smtpDot = document.getElementById('smtp-dot');
  const apiDot = document.getElementById('api-dot');

  // Server Details
  const valSmtpPort = document.getElementById('val-smtp-port');
  const valSmtpHost = document.getElementById('val-smtp-host');
  const valSmtpDomain = document.getElementById('val-smtp-domain');
  const valApiEndpoint = document.getElementById('val-api-endpoint');

  // Compose Elements
  const composeForm = document.getElementById('compose-form');
  const composeTo = document.getElementById('compose-to');
  const composeFrom = document.getElementById('compose-from');
  const composeSubject = document.getElementById('compose-subject');
  const composeHtml = document.getElementById('compose-html');
  const modeToggle = document.getElementById('mode-toggle');
  const htmlPreview = document.getElementById('html-preview');

  // Logs Elements
  const logsSearch = document.getElementById('logs-search');
  const logsTypeFilter = document.getElementById('logs-type-filter');
  const logsListContainer = document.getElementById('logs-list-container');
  const logDetailViewer = document.getElementById('log-detail-viewer');
  const recentActivityList = document.getElementById('recent-activity-list');

  // App State
  let activeTab = 'status';
  let logsStore = [];
  let selectedLogId = null;

  // Initialize Lucide Icons
  lucide.createIcons();

  // Tab Navigation
  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      const tabName = button.getAttribute('data-tab');
      
      tabButtons.forEach(btn => btn.classList.remove('active'));
      tabPanes.forEach(pane => pane.classList.remove('active'));

      button.classList.add('active');
      const pane = document.getElementById(`tab-${tabName}`);
      if (pane) pane.classList.add('active');

      activeTab = tabName;
      pageTitle.textContent = button.querySelector('span').textContent;
      
      if (tabName === 'logs') {
        fetchLogs();
      }
    });
  });

  // HTML Live Preview updates
  composeHtml.addEventListener('input', () => {
    const htmlContent = composeHtml.value;
    if (htmlContent.trim()) {
      htmlPreview.srcdoc = htmlContent;
    } else {
      htmlPreview.srcdoc = "<p style='color:#718096;text-align:center;padding-top:100px;'>Enter HTML in the editor to see preview</p>";
    }
  });

  // Format uptime string
  function formatUptime(seconds) {
    if (seconds < 60) return `${Math.floor(seconds)}s`;
    const minutes = seconds / 60;
    if (minutes < 60) return `${Math.floor(minutes)}m`;
    const hours = minutes / 60;
    return `${Math.floor(hours)}h ${Math.floor(minutes % 60)}m`;
  }

  // Fetch API Status
  async function fetchStatus() {
    try {
      const res = await fetch('/api/status');
      const data = await res.json();

      smtpDot.className = 'status-dot online';
      apiDot.className = 'status-dot online';

      statSent.textContent = data.stats.totalSent;
      statReceived.textContent = data.stats.totalReceived;
      statFailed.textContent = data.stats.totalFailed;
      statUptime.textContent = formatUptime(data.uptime);

      valSmtpPort.textContent = data.smtp.port;
      valSmtpHost.textContent = data.smtp.host;
      valSmtpDomain.textContent = data.smtp.domain;
      valApiEndpoint.textContent = window.location.origin;
    } catch (e) {
      console.error('Failed to load status:', e);
      smtpDot.className = 'status-dot offline';
      apiDot.className = 'status-dot offline';
    }
  }

  // Fetch Logs from Backend
  async function fetchLogs() {
    try {
      const res = await fetch('/api/logs');
      const data = await res.json();
      logsStore = data;
      renderLogs();
      renderRecentActivity();
    } catch (e) {
      console.error('Failed to load logs:', e);
    }
  }

  // Render logs on the Dashboard Tab
  function renderRecentActivity() {
    if (logsStore.length === 0) {
      recentActivityList.innerHTML = '<div class="empty-state">No recent mail transactions.</div>';
      return;
    }

    recentActivityList.innerHTML = '';
    const slice = logsStore.slice(0, 5);

    slice.forEach(log => {
      const item = document.createElement('div');
      item.className = 'activity-item';

      const isSent = log.type === 'sent';
      const iconName = isSent ? 'send' : 'download';
      const iconClass = isSent ? 'sent' : 'received';
      const timeStr = new Date(log.timestamp).toLocaleTimeString();

      item.innerHTML = `
        <div class="activity-icon ${iconClass}">
          <i data-lucide="${iconName}" style="width: 16px; height: 16px;"></i>
        </div>
        <div class="activity-info">
          <div>
            <strong>${isSent ? 'Sent to' : 'Received from'}:</strong> ${isSent ? log.to : log.from}
          </div>
          <div style="color: var(--text-secondary); margin-top: 0.15rem;">"${log.subject}"</div>
          <div class="activity-meta">${timeStr} &bull; ${log.status || 'received'}</div>
        </div>
      `;
      recentActivityList.appendChild(item);
    });
    lucide.createIcons();
  }

  // Filter and Render Logs list inside the Explorer
  function renderLogs() {
    const query = logsSearch.value.toLowerCase();
    const typeFilter = logsTypeFilter.value;

    const filtered = logsStore.filter(log => {
      // Type matches
      if (typeFilter !== 'all' && log.type !== typeFilter) return false;
      // Search matches
      const fromMatch = log.from.toLowerCase().includes(query);
      const toMatch = Array.isArray(log.to) 
        ? log.to.join(', ').toLowerCase().includes(query) 
        : log.to.toLowerCase().includes(query);
      const subMatch = log.subject.toLowerCase().includes(query);
      return fromMatch || toMatch || subMatch;
    });

    if (filtered.length === 0) {
      logsListContainer.innerHTML = '<div class="empty-state">No matching logs.</div>';
      return;
    }

    logsListContainer.innerHTML = '';
    filtered.forEach(log => {
      const div = document.createElement('div');
      div.className = `log-item ${log.id === selectedLogId ? 'active' : ''}`;
      div.dataset.id = log.id;

      const dateStr = new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const badgeType = log.type;
      const statusClass = log.status === 'failed' ? 'failed' : 'success';
      const statusLabel = log.type === 'received' ? 'received' : log.status;

      div.innerHTML = `
        <div class="log-item-header">
          <span class="badge ${badgeType}">${badgeType}</span>
          <span class="log-item-time">${dateStr}</span>
        </div>
        <div class="log-item-title">${log.type === 'sent' ? log.to : log.from}</div>
        <div class="log-item-subject">${log.subject}</div>
        <div style="margin-top: 0.25rem;"><span class="badge ${statusClass}">${statusLabel}</span></div>
      `;

      div.addEventListener('click', () => {
        selectedLogId = log.id;
        document.querySelectorAll('.log-item').forEach(item => item.classList.remove('active'));
        div.classList.add('active');
        viewLogDetail(log);
      });

      logsListContainer.appendChild(div);
    });
  }

  // Show detailed logs panel
  function viewLogDetail(log) {
    const isSent = log.type === 'sent';
    const isSuccess = log.status !== 'failed';

    let detailHtml = `
      <div class="log-detail-header">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <h2>Email Details</h2>
          <div>
            <span class="badge ${log.type}" style="font-size: 0.85rem; padding: 0.25rem 0.6rem;">${log.type}</span>
            <span class="badge ${isSuccess ? 'success' : 'failed'}" style="font-size: 0.85rem; padding: 0.25rem 0.6rem; margin-left: 0.5rem;">${isSent ? log.status : 'received'}</span>
          </div>
        </div>
        <div class="log-detail-meta-row" style="margin-top: 1rem;">
          <span class="label">From:</span>
          <span class="value">${log.from}</span>
        </div>
        <div class="log-detail-meta-row">
          <span class="label">To:</span>
          <span class="value">${Array.isArray(log.to) ? log.to.join(', ') : log.to}</span>
        </div>
        <div class="log-detail-meta-row">
          <span class="label">Subject:</span>
          <span class="value" style="font-weight: 600;">${log.subject}</span>
        </div>
        <div class="log-detail-meta-row">
          <span class="label">Date:</span>
          <span class="value">${new Date(log.timestamp).toLocaleString()}</span>
        </div>
        ${log.mx ? `
        <div class="log-detail-meta-row">
          <span class="label">MX Host:</span>
          <span class="value code">${log.mx}</span>
        </div>
        ` : ''}
      </div>

      <div class="log-detail-tabs">
        <button class="log-tab-btn active" data-log-tab="preview">Rendered Preview</button>
        <button class="log-tab-btn" data-log-tab="transaction">SMTP Transaction Logs</button>
      </div>

      <div class="log-detail-body-container">
        <div id="log-body-preview" class="preview-iframe-wrapper" style="height: 350px;">
          <iframe id="log-html-frame" style="width:100%; height:100%; border:none; background:#fff;"></iframe>
        </div>
        <div id="log-body-transaction" class="raw-log-block" style="display:none;">
          ${log.log ? escapeHtml(log.log) : (log.raw ? escapeHtml(log.raw) : 'No transaction logs recorded.')}
        </div>
      </div>
    `;

    logDetailViewer.innerHTML = detailHtml;

    // Render HTML in the preview iframe
    const iframe = document.getElementById('log-html-frame');
    if (iframe) {
      // If the body is plain text or raw SMTP DATA, just display it simply. If it's HTML, write it.
      const isHtml = log.body.trim().startsWith('<') || log.body.toLowerCase().includes('<html>');
      if (isHtml) {
        iframe.srcdoc = log.body;
      } else {
        iframe.srcdoc = `<pre style="font-family: sans-serif; white-space: pre-wrap; padding: 20px; color: #333;">${escapeHtml(log.body)}</pre>`;
      }
    }

    // Detail Tabs Switcher
    const logTabBtns = logDetailViewer.querySelectorAll('.log-tab-btn');
    const previewContainer = document.getElementById('log-body-preview');
    const transactionContainer = document.getElementById('log-body-transaction');

    logTabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        logTabBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const tab = btn.getAttribute('data-log-tab');
        if (tab === 'preview') {
          previewContainer.style.display = 'block';
          transactionContainer.style.display = 'none';
        } else {
          previewContainer.style.display = 'none';
          transactionContainer.style.display = 'block';
        }
      });
    });
  }

  function escapeHtml(text) {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // Handle compose mail submission
  composeForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const sendBtn = document.getElementById('send-mail-btn');
    const originalText = sendBtn.innerHTML;
    
    sendBtn.disabled = true;
    sendBtn.innerHTML = '<i data-lucide="loader" class="animate-spin"></i> Dispersing...';
    lucide.createIcons();

    const payload = {
      from: composeFrom.value || undefined,
      to: composeTo.value,
      subject: composeSubject.value,
      html: composeHtml.value,
      simulate: !modeToggle.checked
    };

    try {
      const res = await fetch('/api/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      
      if (data.success) {
        let alertMessage = `Dispatched! Success: ${data.summary.success}, Failed: ${data.summary.failed}`;
        if (data.summary.failed > 0) {
          alertMessage += `\n\nNote: If direct MX delivery failed, it is likely because your local ISP blocks outgoing connections on Port 25. Use Simulation Mode for testing, or run this on a server environment.`;
        }
        alert(alertMessage);
        
        // Refresh view
        fetchStatus();
        fetchLogs();
      } else {
        alert(`Send failed: ${data.error}`);
      }
    } catch (err) {
      alert(`Network/API error: ${err.message}`);
    } finally {
      sendBtn.disabled = false;
      sendBtn.innerHTML = originalText;
      lucide.createIcons();
    }
  });

  // Filter listeners
  logsSearch.addEventListener('input', renderLogs);
  logsTypeFilter.addEventListener('change', renderLogs);

  // Refresh trigger
  refreshBtn.addEventListener('click', () => {
    fetchStatus();
    fetchLogs();
  });

  // Clear Logs trigger
  clearLogsBtn.addEventListener('click', async () => {
    if (confirm('Are you sure you want to clear all mail history?')) {
      try {
        await fetch('/api/logs', { method: 'DELETE' });
        fetchStatus();
        fetchLogs();
        logDetailViewer.innerHTML = `
          <div class="empty-state">
            <i data-lucide="mail" style="width: 48px; height: 48px; opacity: 0.5; margin-bottom: 1rem;"></i>
            <p>Select an email from the list to view its details, headers, SMTP transaction, and rendered body.</p>
          </div>
        `;
        lucide.createIcons();
      } catch (e) {
        console.error(e);
      }
    }
  });

  // Periodically update
  fetchStatus();
  fetchLogs();
  setInterval(fetchStatus, 5000);
  setInterval(fetchLogs, 10000);
});
