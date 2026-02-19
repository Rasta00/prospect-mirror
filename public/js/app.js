/* ============================================
   Prospect Mirror — Frontend App (Vanilla JS)
   ============================================ */

(function () {
  'use strict';

  // ---- State ----
  let currentJobId = null;
  let eventSource = null;
  let timerInterval = null;
  let startTime = null;
  let result = null;

  // ---- DOM References ----
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const form = $('#analyze-form');
  const urlInput = $('#url-input');
  const analyzeBtn = $('#analyze-btn');
  const btnText = analyzeBtn.querySelector('.btn-text');
  const btnSpinner = analyzeBtn.querySelector('.btn-spinner');
  const inputError = $('#input-error');

  const inputSection = $('#input-section');
  const progressSection = $('#progress-section');
  const resultsSection = $('#results-section');

  const progressUrl = $('#progress-url');
  const progressTimer = $('#progress-timer');
  const progressPhases = $('#progress-phases');

  // ---- Phase definitions ----
  const PHASES = [
    { id: 'crawl', label: 'Crawling website', icon: '🌐' },
    { id: 'brand', label: 'Extracting brand assets', icon: '🎨' },
    { id: 'techDetect', label: 'Detecting technology stack', icon: '⚙️' },
    { id: 'audit', label: 'Running performance audits', icon: '📊' },
    { id: 'contentAI', label: 'AI content analysis', icon: '🧠' },
    { id: 'competitiveAI', label: 'AI competitive analysis', icon: '🏆' },
    { id: 'drupal', label: 'Populating demo site', icon: '💧' },
    { id: 'report', label: 'Generating report', icon: '📄' },
  ];

  // ---- Form Submit ----
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const url = urlInput.value.trim();
    if (!url) return;

    setLoading(true);
    inputError.hidden = true;

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Request failed');
      }

      currentJobId = data.jobId;
      showProgress(url);
      connectSSE(data.jobId);

    } catch (err) {
      inputError.textContent = err.message;
      inputError.hidden = false;
      setLoading(false);
    }
  });

  function setLoading(on) {
    analyzeBtn.disabled = on;
    btnText.textContent = on ? 'Analyzing...' : 'Analyze';
    btnSpinner.hidden = !on;
  }

  // ---- Progress ----
  function showProgress(url) {
    inputSection.hidden = true;
    progressSection.hidden = false;
    resultsSection.hidden = true;

    try {
      progressUrl.textContent = new URL(url.startsWith('http') ? url : 'https://' + url).hostname;
    } catch {
      progressUrl.textContent = url;
    }

    // Render phase rows
    progressPhases.innerHTML = PHASES.map(p => `
      <div class="phase-row" data-phase="${p.id}">
        <div class="phase-icon"><div class="pending-dot"></div></div>
        <div class="phase-info">
          <div class="phase-label">${p.label}</div>
          <div class="phase-detail"></div>
        </div>
        <div class="phase-summary"></div>
      </div>
    `).join('');

    // Start timer
    startTime = Date.now();
    timerInterval = setInterval(() => {
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      progressTimer.textContent = `${elapsed}s`;
    }, 100);
  }

  function updatePhase(phase, status, detail, summary) {
    const row = progressPhases.querySelector(`[data-phase="${phase}"]`);
    if (!row) return;

    row.className = `phase-row ${status}`;

    const icon = row.querySelector('.phase-icon');
    if (status === 'running') {
      icon.innerHTML = '<div class="spinner"></div>';
    } else if (status === 'done') {
      icon.innerHTML = '<span class="check">✓</span>';
    } else if (status === 'error') {
      icon.innerHTML = '<span class="x-mark">✗</span>';
    }

    if (detail) {
      row.querySelector('.phase-detail').textContent = detail;
    }
    if (summary) {
      const summaryEl = row.querySelector('.phase-summary');
      summaryEl.textContent = typeof summary === 'string' ? summary : formatSummary(summary);
    }
  }

  function formatSummary(obj) {
    if (!obj || typeof obj !== 'object') return '';
    return Object.entries(obj)
      .filter(([, v]) => v !== null && v !== undefined)
      .map(([k, v]) => `${humanize(k)}: ${v}`)
      .join(' · ');
  }

  function humanize(str) {
    return str.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase()).trim();
  }

  // ---- SSE Connection ----
  function connectSSE(jobId) {
    if (eventSource) eventSource.close();

    eventSource = new EventSource(`/api/status/${jobId}`);

    // Handle snapshot — catches up on phases that already fired
    eventSource.addEventListener('snapshot', (e) => {
      const data = JSON.parse(e.data);
      if (data.phases) {
        for (const [phase, info] of Object.entries(data.phases)) {
          if (info.status === 'done') {
            updatePhase(phase, 'done', info.detail);
          } else if (info.status === 'error') {
            updatePhase(phase, 'error', info.error);
          } else if (info.status === 'running') {
            updatePhase(phase, 'running', info.detail || info.label);
          }
        }
      }
    });

    eventSource.addEventListener('phase:start', (e) => {
      const data = JSON.parse(e.data);
      updatePhase(data.phase, 'running', data.label);
    });

    eventSource.addEventListener('phase:progress', (e) => {
      const data = JSON.parse(e.data);
      updatePhase(data.phase, 'running', data.detail);
    });

    eventSource.addEventListener('phase:complete', (e) => {
      const data = JSON.parse(e.data);
      updatePhase(data.phase, 'done', null, data.summary);
    });

    eventSource.addEventListener('phase:error', (e) => {
      const data = JSON.parse(e.data);
      updatePhase(data.phase, 'error', data.error);
    });

    eventSource.addEventListener('job:done', async (e) => {
      eventSource.close();
      clearInterval(timerInterval);
      await fetchAndShowResults(jobId);
    });

    eventSource.addEventListener('job:error', (e) => {
      eventSource.close();
      clearInterval(timerInterval);
      const data = JSON.parse(e.data);
      alert('Analysis failed: ' + (data.error || 'Unknown error'));
      resetUI();
    });

    // Poll as fallback — SSE can miss events on some proxies
    const pollInterval = setInterval(async () => {
      try {
        const res = await fetch(`/api/status/${jobId}`);
        const data = await res.json();
        if (data.phases) {
          for (const [phase, info] of Object.entries(data.phases)) {
            if (info.status === 'done') {
              updatePhase(phase, 'done', info.detail);
            } else if (info.status === 'error') {
              updatePhase(phase, 'error', info.error);
            } else if (info.status === 'running') {
              updatePhase(phase, 'running', info.detail || info.label);
            }
          }
        }
        if (data.status === 'done') {
          clearInterval(pollInterval);
          eventSource.close();
          clearInterval(timerInterval);
          await fetchAndShowResults(jobId);
        } else if (data.status === 'error') {
          clearInterval(pollInterval);
          eventSource.close();
          clearInterval(timerInterval);
          alert('Analysis failed: ' + (data.error || 'Unknown error'));
          resetUI();
        }
      } catch { /* ignore */ }
    }, 2000);

    eventSource.onerror = () => {
      // SSE connection lost — polling fallback will handle it
    };
  }

  // ---- Results ----
  async function fetchAndShowResults(jobId) {
    try {
      const res = await fetch(`/api/result/${jobId}`);
      const data = await res.json();
      if (data.status === 'done') {
        result = data.result;
        showResults(data.url, data.result);
      }
    } catch (err) {
      console.error('Failed to fetch results:', err);
    }
  }

  function showResults(url, r) {
    progressSection.hidden = true;
    resultsSection.hidden = false;

    // Header
    $('#result-site-title').textContent = r.crawl?.title || url;
    $('#result-site-url').textContent = url;
    $('#result-site-url').href = url;

    // Render all panels
    renderOverview(r);
    renderBrand(r.brand);
    renderTech(r.tech);
    renderAudit(r.audit);
    renderCompetitive(r.competitive);
    renderContent(r.content);
    renderDrupal(r.drupal);

    setLoading(false);
  }

  // ---- Tab Navigation ----
  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('tab')) {
      $$('.tab').forEach(t => t.classList.remove('active'));
      $$('.tab-panel').forEach(p => p.classList.remove('active'));
      e.target.classList.add('active');
      $(`#panel-${e.target.dataset.tab}`).classList.add('active');
    }
  });

  // ---- Export PDF ----
  $('#export-pdf-btn').addEventListener('click', () => {
    if (!currentJobId) return;
    window.open(`/api/export/${currentJobId}/pdf`, '_blank');
  });

  // ---- New Analysis ----
  $('#new-analysis-btn').addEventListener('click', resetUI);

  function resetUI() {
    inputSection.hidden = false;
    progressSection.hidden = true;
    resultsSection.hidden = true;
    urlInput.value = '';
    setLoading(false);
    currentJobId = null;
    result = null;
    if (eventSource) eventSource.close();
    clearInterval(timerInterval);
  }

  // ---- Render Functions ----

  function renderOverview(r) {
    // Brand preview
    const brandEl = $('#brand-preview');
    if (r.brand?.colors?.palette?.length) {
      brandEl.innerHTML = `
        <div style="display:flex;gap:4px;margin-bottom:8px">
          ${r.brand.colors.palette.slice(0, 4).map(c =>
            `<div style="width:32px;height:32px;border-radius:4px;background:${c};border:1px solid #e2e8f0"></div>`
          ).join('')}
        </div>
        ${r.brand.logo ? `<img src="${escHtml(r.brand.logo)}" style="max-height:40px" alt="logo">` : ''}
        <div style="font-size:0.85rem;color:var(--text-secondary);margin-top:4px">
          ${r.brand.fonts?.length ? r.brand.fonts.slice(0, 2).join(', ') : 'No custom fonts detected'}
        </div>`;
    } else {
      brandEl.innerHTML = '<p style="color:var(--text-muted)">No brand data available</p>';
    }

    // Tech preview
    const techEl = $('#tech-preview');
    if (r.tech?.detected?.length) {
      techEl.innerHTML = r.tech.detected.slice(0, 4).map(t =>
        `<div class="tag" style="margin-bottom:4px">${escHtml(t.name)}</div>`
      ).join('');
    } else {
      techEl.innerHTML = '<p style="color:var(--text-muted)">No technologies detected</p>';
    }

    // Scores preview
    const scoresEl = $('#scores-preview');
    if (r.audit?.scores) {
      const s = r.audit.scores;
      scoresEl.innerHTML = Object.entries(s).map(([k, v]) =>
        `<div style="display:flex;justify-content:space-between;margin-bottom:4px">
          <span style="font-size:0.85rem">${humanize(k)}</span>
          <span class="gauge-value ${scoreClass(v)}" style="font-size:1.1rem">${v}</span>
        </div>`
      ).join('');
    } else {
      scoresEl.innerHTML = '<p style="color:var(--text-muted)">Audits not yet available</p>';
    }

    // Competitive preview
    const compEl = $('#competitive-preview');
    if (r.competitive?.narrative) {
      compEl.innerHTML = `<p style="font-size:0.9rem;line-height:1.6">${escHtml(r.competitive.narrative).slice(0, 300)}...</p>`;
    } else {
      compEl.innerHTML = '<p style="color:var(--text-muted)">Competitive analysis not yet available</p>';
    }
  }

  function renderBrand(brand) {
    if (!brand) return;

    // Colors
    const colorsEl = $('#brand-colors');
    colorsEl.innerHTML = (brand.colors?.palette || []).map(c =>
      `<div class="color-swatch" style="background:${c}"><span class="color-hex">${c}</span></div>`
    ).join('') || '<span style="color:var(--text-muted)">None detected</span>';

    // Logo
    const logoEl = $('#brand-logo');
    if (brand.logo) {
      logoEl.innerHTML = `<img src="${escHtml(brand.logo)}" alt="Logo">`;
    } else {
      logoEl.innerHTML = '<div class="no-logo">No logo detected</div>';
    }

    // Fonts
    const fontsEl = $('#brand-fonts');
    fontsEl.innerHTML = (brand.fonts || []).map(f =>
      `<div class="font-item" style="font-family:'${escHtml(f)}',sans-serif">${escHtml(f)}</div>`
    ).join('') || '<span style="color:var(--text-muted)">No custom fonts detected</span>';

    // Heroes
    const heroesEl = $('#brand-heroes');
    heroesEl.innerHTML = (brand.heroes || []).map(h =>
      `<img src="${escHtml(h.src)}" alt="Hero image" loading="lazy">`
    ).join('') || '<span style="color:var(--text-muted)">No hero images found</span>';
  }

  function renderTech(tech) {
    if (!tech?.detected?.length) {
      $('#tech-details').innerHTML = '<p style="color:var(--text-muted);padding:20px">No technologies detected</p>';
      return;
    }

    $('#tech-details').innerHTML = tech.detected.map(t => `
      <div class="tech-card">
        <div class="tech-icon">${escHtml(t.name.charAt(0))}</div>
        <div>
          <div class="tech-name">${escHtml(t.name)}</div>
          <div class="tech-category">${escHtml(t.category)}</div>
          <div class="tech-confidence">Confidence: ${t.confidence}%</div>
          <div class="confidence-bar"><div class="confidence-fill" style="width:${t.confidence}%"></div></div>
        </div>
      </div>
    `).join('');
  }

  function renderAudit(audit) {
    const gaugesEl = $('#audit-gauges');
    const detailsEl = $('#audit-details');

    if (!audit?.scores) {
      gaugesEl.innerHTML = '<p style="color:var(--text-muted);padding:20px;grid-column:1/-1">Audit data not yet available</p>';
      detailsEl.innerHTML = '';
      return;
    }

    // Clickable gauge cards
    const categoryKeys = Object.keys(audit.scores);
    gaugesEl.innerHTML = categoryKeys.map(key => `
      <div class="gauge-card gauge-card-clickable" data-category="${key}">
        <h4>${humanize(key)}</h4>
        <div class="gauge-value ${scoreClass(audit.scores[key])}">${audit.scores[key]}</div>
        <div class="gauge-label">${scoreLabel(audit.scores[key])}</div>
        <div class="gauge-hint">Click for details</div>
      </div>
    `).join('');

    // Default: show overview with radar chart
    renderAuditOverview(audit, detailsEl);

    // Click handler for gauge cards
    gaugesEl.addEventListener('click', (e) => {
      const card = e.target.closest('.gauge-card-clickable');
      if (!card) return;

      const category = card.dataset.category;

      // Toggle active state
      $$('.gauge-card-clickable').forEach(c => c.classList.remove('gauge-active'));
      card.classList.add('gauge-active');

      // Render findings for this category
      const findings = audit.categoryDetails?.[category] || [];
      renderCategoryFindings(category, audit.scores[category], findings, detailsEl);
    });
  }

  function renderAuditOverview(audit, container) {
    let html = '';

    // Key metrics
    if (audit.diagnostics) {
      const d = audit.diagnostics;
      const metrics = [
        { label: 'First Contentful Paint', value: d.fcp },
        { label: 'Largest Contentful Paint', value: d.lcp },
        { label: 'Total Blocking Time', value: d.tbt },
        { label: 'Cumulative Layout Shift', value: d.cls },
        { label: 'Speed Index', value: d.speedIndex },
      ].filter(m => m.value);

      if (metrics.length) {
        html += `<div class="content-section"><h3>Key Metrics</h3>
          <div class="metrics-grid">${metrics.map(m =>
            `<div class="metric-item"><span class="metric-label">${m.label}</span><span class="metric-value">${m.value}</span></div>`
          ).join('')}</div></div>`;
      }
    }

    // Quick summary of issues per category
    if (audit.categoryDetails) {
      const summaryRows = Object.entries(audit.categoryDetails).map(([key, findings]) => {
        const fails = findings.filter(f => f.status === 'fail').length;
        const warnings = findings.filter(f => f.status === 'warning').length;
        const passes = findings.filter(f => f.status === 'pass').length;
        return `<tr class="summary-row-clickable" data-category="${key}">
          <td><strong>${humanize(key)}</strong></td>
          <td><span class="gauge-value ${scoreClass(audit.scores[key])}" style="font-size:1.2rem">${audit.scores[key]}</span></td>
          <td>${fails ? `<span class="finding-badge fail">${fails} failed</span>` : ''}</td>
          <td>${warnings ? `<span class="finding-badge warning">${warnings} warnings</span>` : ''}</td>
          <td><span class="finding-badge pass">${passes} passed</span></td>
        </tr>`;
      }).join('');

      html += `<div class="content-section"><h3>Audit Summary</h3>
        <p style="color:var(--text-muted);font-size:0.85rem;margin-bottom:12px">Click a category above or a row below to see detailed findings.</p>
        <table class="comparison-table"><thead><tr><th>Category</th><th>Score</th><th>Failures</th><th>Warnings</th><th>Passed</th></tr></thead>
        <tbody>${summaryRows}</tbody></table></div>`;
    }

    container.innerHTML = html;

    // Radar chart
    if (typeof Chart !== 'undefined' && audit.scores) {
      const canvas = document.createElement('canvas');
      canvas.id = 'radar-chart';
      canvas.style.maxWidth = '400px';
      canvas.style.margin = '20px auto';
      container.prepend(canvas);

      new Chart(canvas, {
        type: 'radar',
        data: {
          labels: Object.keys(audit.scores).map(humanize),
          datasets: [{
            label: 'Score',
            data: Object.values(audit.scores),
            backgroundColor: 'rgba(0, 120, 212, 0.15)',
            borderColor: 'rgba(0, 120, 212, 0.8)',
            pointBackgroundColor: 'rgba(0, 120, 212, 1)',
          }],
        },
        options: {
          scales: { r: { min: 0, max: 100, ticks: { stepSize: 20 } } },
          plugins: { legend: { display: false } },
        },
      });
    }

    // Click handler for summary rows
    container.addEventListener('click', (e) => {
      const row = e.target.closest('.summary-row-clickable');
      if (!row) return;
      const category = row.dataset.category;
      // Activate the gauge card
      $$('.gauge-card-clickable').forEach(c => c.classList.remove('gauge-active'));
      const card = $(`.gauge-card-clickable[data-category="${category}"]`);
      if (card) card.classList.add('gauge-active');
      // Render findings
      const findings = result?.audit?.categoryDetails?.[category] || [];
      renderCategoryFindings(category, result?.audit?.scores?.[category], findings, container);
    });
  }

  function renderCategoryFindings(category, score, findings, container) {
    const fails = findings.filter(f => f.status === 'fail');
    const warnings = findings.filter(f => f.status === 'warning');
    const passes = findings.filter(f => f.status === 'pass');
    const infos = findings.filter(f => f.status === 'info');

    let html = `<div class="findings-header">
      <button class="findings-back" onclick="document.querySelector('.gauge-card-clickable.gauge-active')?.classList.remove('gauge-active')">← Back to Overview</button>
      <h3>${humanize(category)} — <span class="gauge-value ${scoreClass(score)}" style="font-size:1.3rem">${score}/100</span></h3>
      <div class="findings-summary">
        ${fails.length ? `<span class="finding-badge fail">${fails.length} failed</span>` : ''}
        ${warnings.length ? `<span class="finding-badge warning">${warnings.length} warnings</span>` : ''}
        ${passes.length ? `<span class="finding-badge pass">${passes.length} passed</span>` : ''}
      </div>
    </div>`;

    // Back button handler
    setTimeout(() => {
      const backBtn = container.querySelector('.findings-back');
      if (backBtn) {
        backBtn.addEventListener('click', () => {
          renderAuditOverview(result?.audit, container);
        });
      }
    }, 0);

    // Failures
    if (fails.length) {
      html += `<div class="findings-group"><h4 class="findings-group-title fail-title">Failures</h4>`;
      html += fails.map(f => renderFinding(f)).join('');
      html += `</div>`;
    }

    // Warnings
    if (warnings.length) {
      html += `<div class="findings-group"><h4 class="findings-group-title warning-title">Warnings</h4>`;
      html += warnings.map(f => renderFinding(f)).join('');
      html += `</div>`;
    }

    // Info
    if (infos.length) {
      html += `<div class="findings-group"><h4 class="findings-group-title info-title">Diagnostics</h4>`;
      html += infos.map(f => renderFinding(f)).join('');
      html += `</div>`;
    }

    // Passed (collapsed)
    if (passes.length) {
      html += `<details class="findings-group passed-group"><summary class="findings-group-title pass-title">Passed Audits (${passes.length})</summary>`;
      html += passes.map(f => renderFinding(f)).join('');
      html += `</details>`;
    }

    container.innerHTML = html;
  }

  function renderFinding(f) {
    const icon = f.status === 'fail' ? '✗' : f.status === 'warning' ? '⚠' : f.status === 'pass' ? '✓' : 'ℹ';
    const iconClass = f.status;

    let html = `<div class="finding-card ${f.status}">
      <div class="finding-icon ${iconClass}">${icon}</div>
      <div class="finding-content">
        <div class="finding-title">${escHtml(f.title)}${f.displayValue ? ` <span class="finding-value">${escHtml(f.displayValue)}</span>` : ''}</div>
        <div class="finding-desc">${escHtml(f.description)}</div>`;

    if (f.items?.length) {
      html += `<ul class="finding-items">${f.items.map(item =>
        `<li>${escHtml(item)}</li>`
      ).join('')}</ul>`;
    }

    html += `</div></div>`;
    return html;
  }

  function renderCompetitive(comp) {
    const el = $('#competitive-details');
    if (!comp) {
      el.innerHTML = '<p style="color:var(--text-muted);padding:20px">Competitive analysis not yet available</p>';
      return;
    }

    let html = '';

    // Comparison table
    if (comp.comparison) {
      html += `
        <table class="comparison-table">
          <thead>
            <tr>
              <th>Capability</th>
              <th>Current Platform</th>
              <th class="acquia-advantage">Acquia</th>
            </tr>
          </thead>
          <tbody>
            ${comp.comparison.map(row => `
              <tr>
                <td>${escHtml(row.capability)}</td>
                <td>${escHtml(row.current)}</td>
                <td class="acquia-advantage">${escHtml(row.acquia)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>`;
    }

    // Narrative
    if (comp.narrative) {
      html += `<div class="narrative"><h3>Analysis</h3><p>${escHtml(comp.narrative)}</p></div>`;
    }

    // Weaknesses
    if (comp.weaknesses?.length) {
      html += `
        <div class="content-section" style="margin-top:16px">
          <h3>Platform Weaknesses Identified</h3>
          <ul style="padding-left:20px">${comp.weaknesses.map(w => `<li>${escHtml(w)}</li>`).join('')}</ul>
        </div>`;
    }

    // Acquia advantages
    if (comp.acquiaAdvantages?.length) {
      html += `
        <div class="content-section" style="margin-top:16px;border-color:var(--acquia-blue)">
          <h3>Acquia Advantages</h3>
          <ul style="padding-left:20px">${comp.acquiaAdvantages.map(a => `<li>${escHtml(a)}</li>`).join('')}</ul>
        </div>`;
    }

    el.innerHTML = html || '<p style="color:var(--text-muted)">No competitive data</p>';
  }

  function renderContent(content) {
    const el = $('#content-details');
    if (!content) {
      el.innerHTML = '<p style="color:var(--text-muted);padding:20px">Content analysis not yet available</p>';
      return;
    }

    let html = '';

    if (content.industry) {
      html += `<div class="content-section"><h3>Industry</h3><div class="tag">${escHtml(content.industry)}</div></div>`;
    }

    if (content.themes?.length) {
      html += `<div class="content-section"><h3>Key Themes</h3><div class="content-tags">${content.themes.map(t => `<div class="tag">${escHtml(t)}</div>`).join('')}</div></div>`;
    }

    if (content.messaging) {
      html += `<div class="content-section"><h3>Messaging Analysis</h3><p style="font-size:0.9rem;line-height:1.7">${escHtml(content.messaging)}</p></div>`;
    }

    if (content.targetAudience) {
      html += `<div class="content-section"><h3>Target Audience</h3><p style="font-size:0.9rem">${escHtml(content.targetAudience)}</p></div>`;
    }

    if (content.contentTypes?.length) {
      html += `<div class="content-section"><h3>Content Types</h3><div class="content-tags">${content.contentTypes.map(t => `<div class="tag">${escHtml(t)}</div>`).join('')}</div></div>`;
    }

    el.innerHTML = html || '<p style="color:var(--text-muted)">No content analysis data</p>';
  }

  function renderDrupal(drupal) {
    const el = $('#drupal-details');
    if (!drupal) {
      el.innerHTML = '<div class="drupal-link-card"><h3>Demo Site</h3><p style="color:var(--text-muted)">Drupal population is not enabled or not yet complete.</p></div>';
      return;
    }

    el.innerHTML = `
      <div class="drupal-link-card">
        <h3>Your Branded Demo is Ready!</h3>
        <p>Content, media, and theme colors have been pushed to the Acquia demo environment.</p>
        <a href="${escHtml(drupal.siteUrl)}" target="_blank">View Demo Site →</a>
      </div>
      ${drupal.pagesCreated ? `<p style="margin-top:12px;color:var(--text-secondary);font-size:0.85rem">Pages created: ${drupal.pagesCreated} · Media uploaded: ${drupal.mediaUploaded || 0}</p>` : ''}
    `;
  }

  // ---- Helpers ----
  function scoreClass(v) {
    if (v >= 90) return 'good';
    if (v >= 50) return 'ok';
    return 'poor';
  }

  function scoreLabel(v) {
    if (v >= 90) return 'Excellent';
    if (v >= 70) return 'Good';
    if (v >= 50) return 'Needs Work';
    return 'Poor';
  }

  function escHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
  }
})();
