// popup.js — AI Job Assistant v2 — all feature logic

// ─── Tab routing ──────────────────────────────────────────────────────────────
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(`panel-${tab.dataset.tab}`).classList.add('active');
    if (tab.dataset.tab === 'tracker') renderTracker();
    if (tab.dataset.tab === 'settings') renderPersonaList();
  });
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

function showMsg(id, text, type) {
  const el = $(id);
  el.textContent = text;
  el.className = `msg show ${type}`;
}
function hideMsg(id) { $(id).className = 'msg'; }
function showProg(id) { $(id).classList.add('show'); }
function hideProg(id) { $(id).classList.remove('show'); }

function escapeHtml(str) {
  const d = document.createElement('div');
  d.appendChild(document.createTextNode(str));
  return d.innerHTML;
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function execInTab(tab, func, args = []) {
  const res = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func, args });
  return res[0]?.result;
}

// ─── Status dot ───────────────────────────────────────────────────────────────
async function refreshStatusDot() {
  const { personas = [], activePersonaId, geminiKey } = await chrome.storage.local.get(['personas', 'activePersonaId', 'geminiKey']);
  const dot = $('statusDot');
  const ready = geminiKey && personas.length > 0;
  dot.classList.toggle('ready', ready);
  dot.title = ready ? `Ready — ${personas.length} profile(s) configured` : 'Configure your API key and résumé in Settings';
}
refreshStatusDot();

// ═══════════════════════════════════════════════════════════════════════════════
// FEATURE 2: PERSONA MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

async function getPersonas() {
  const { personas = [] } = await chrome.storage.local.get('personas');
  return personas;
}

async function getActivePersona() {
  const { personas = [], activePersonaId } = await chrome.storage.local.get(['personas', 'activePersonaId']);
  if (!personas.length) return null;
  return personas.find(p => p.id === activePersonaId) || personas[0];
}

async function savePersonas(personas) {
  await chrome.storage.local.set({ personas });
}

// Populate persona dropdown in Autofill panel
async function refreshPersonaDropdown() {
  const personas = await getPersonas();
  const { activePersonaId } = await chrome.storage.local.get('activePersonaId');
  const sel = $('personaSelect');
  sel.innerHTML = '';
  if (!personas.length) {
    sel.innerHTML = '<option value="">— No profiles yet. Add one in Settings —</option>';
    return;
  }
  personas.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.name;
    if (p.id === activePersonaId) opt.selected = true;
    sel.appendChild(opt);
  });
}

$('personaSelect').addEventListener('change', async () => {
  await chrome.storage.local.set({ activePersonaId: $('personaSelect').value });
});

// Persona list in Settings
async function renderPersonaList() {
  const personas = await getPersonas();
  const { activePersonaId } = await chrome.storage.local.get('activePersonaId');
  const list = $('personaList');
  list.innerHTML = '';
  if (!personas.length) {
    list.innerHTML = '<div style="font-size:12px;color:var(--t3);margin-bottom:8px">No profiles yet. Click "+ Add" to create one.</div>';
    return;
  }
  personas.forEach((p, i) => {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:6px';
    const isActive = p.id === activePersonaId || (!activePersonaId && i === 0);
    row.innerHTML = `
      <div class="persona-tag ${isActive ? 'active' : ''}" data-id="${p.id}" style="flex:1;overflow:hidden">
        ${isActive ? '✦ ' : ''}<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(p.name)}</span>
      </div>
      <button class="btn btn-s edit-p" data-i="${i}" style="width:auto;padding:4px 8px;font-size:11px">Edit</button>
      <button class="btn btn-s del-p" data-i="${i}" style="width:auto;padding:4px 8px;font-size:11px;color:var(--err)">×</button>
    `;
    list.appendChild(row);
  });

  list.querySelectorAll('.persona-tag').forEach(tag => {
    tag.addEventListener('click', async () => {
      await chrome.storage.local.set({ activePersonaId: tag.dataset.id });
      renderPersonaList();
      refreshPersonaDropdown();
      refreshStatusDot();
    });
  });

  list.querySelectorAll('.edit-p').forEach(btn => {
    btn.addEventListener('click', () => openPersonaEditor(personas[+btn.dataset.i]));
  });

  list.querySelectorAll('.del-p').forEach(btn => {
    btn.addEventListener('click', async () => {
      personas.splice(+btn.dataset.i, 1);
      await savePersonas(personas);
      renderPersonaList();
      refreshPersonaDropdown();
      refreshStatusDot();
    });
  });
}

let editingPersonaId = null;

$('btnAddPersona').addEventListener('click', () => openPersonaEditor(null));

function openPersonaEditor(persona) {
  editingPersonaId = persona?.id || null;
  $('personaName').value = persona?.name || '';
  $('personaResume').value = persona?.resume || '';
  $('personaEditor').style.display = 'block';
  $('personaName').focus();
  hideMsg('personaMsg');
}

$('btnCancelPersona').addEventListener('click', () => {
  $('personaEditor').style.display = 'none';
  editingPersonaId = null;
});

$('btnSavePersona').addEventListener('click', async () => {
  const name = $('personaName').value.trim();
  const resume = $('personaResume').value.trim();
  if (!name)   { showMsg('personaMsg', 'Give this profile a name.', 'warning'); return; }
  if (!resume) { showMsg('personaMsg', 'Paste a résumé for this profile.', 'warning'); return; }

  const personas = await getPersonas();
  if (editingPersonaId) {
    const idx = personas.findIndex(p => p.id === editingPersonaId);
    if (idx > -1) { personas[idx].name = name; personas[idx].resume = resume; }
  } else {
    personas.push({ id: `p_${Date.now()}`, name, resume });
  }
  await savePersonas(personas);
  if (!editingPersonaId) {
    await chrome.storage.local.set({ activePersonaId: personas[personas.length - 1].id });
  }
  $('personaEditor').style.display = 'none';
  editingPersonaId = null;
  renderPersonaList();
  refreshPersonaDropdown();
  refreshStatusDot();
  showMsg('personaMsg', `✓ Profile "${name}" saved.`, 'success');
  setTimeout(() => hideMsg('personaMsg'), 2000);
});

// Settings: API key
(async () => {
  const { geminiKey } = await chrome.storage.local.get('geminiKey');
  if (geminiKey) $('apiKey').value = geminiKey;
  refreshPersonaDropdown();
  renderPersonaList();
})();

$('toggleKey').addEventListener('click', () => {
  const inp = $('apiKey');
  inp.type = inp.type === 'password' ? 'text' : 'password';
});
$('linkAIStudio').addEventListener('click', () => chrome.tabs.create({ url: 'https://aistudio.google.com/app/apikey' }));

$('apiKey').addEventListener('change', async () => {
  const key = $('apiKey').value.trim();
  if (key) await chrome.storage.local.set({ geminiKey: key });
  refreshStatusDot();
});

// ═══════════════════════════════════════════════════════════════════════════════
// FEATURE 1: JD SCRAPER CHIP
// ═══════════════════════════════════════════════════════════════════════════════

let jdChipEnabled = true;
let scrapedJD = null;

$('jdChip').addEventListener('click', () => {
  jdChipEnabled = !jdChipEnabled;
  $('jdChip').classList.toggle('on', jdChipEnabled);
  if (!jdChipEnabled) { scrapedJD = null; $('jdBadge').style.display = 'none'; }
});

// ═══════════════════════════════════════════════════════════════════════════════
// AUTOFILL: SCAN + FILL WITH INLINE REVIEW (FEATURES 1, 2, 3)
// ═══════════════════════════════════════════════════════════════════════════════

let detectedFields = [];

$('btnScan').addEventListener('click', async () => {
  hideMsg('autofillMsg');
  $('resultsList').innerHTML = '';
  $('btnFill').disabled = true;
  scrapedJD = null;
  $('jdBadge').style.display = 'none';

  const tab = await getActiveTab();

  try {
    // Feature 1: scrape JD first if chip is on
    if (jdChipEnabled) {
      try {
        const jdResult = await chrome.tabs.sendMessage(tab.id, { type: 'SCRAPE_JD' });
        if (jdResult?.jobDesc) {
          scrapedJD = jdResult.jobDesc;
          $('jdBadge').style.display = 'inline-flex';
        }
      } catch (_) {}
    }

    // Scan fields
    const fields = await chrome.tabs.sendMessage(tab.id, { type: 'SCAN_FIELDS' });
    detectedFields = fields || [];

    if (!detectedFields.length) {
      $('fieldCount').textContent = '0 fields';
      $('fieldStatus').textContent = 'Nothing found';
      showMsg('autofillMsg', 'No open-ended text fields found. Navigate to the actual application form.', 'warning');
    } else {
      $('fieldCount').textContent = `${detectedFields.length} field${detectedFields.length !== 1 ? 's' : ''}`;
      $('fieldStatus').textContent = 'Ready to fill';
      $('btnFill').disabled = false;
      const jdNote = scrapedJD ? ' JD detected — answers will be tailored.' : '';
      showMsg('autofillMsg', `Found ${detectedFields.length} question${detectedFields.length !== 1 ? 's' : ''}.${jdNote} Click "Fill + review".`, 'info');
    }
  } catch (err) {
    showMsg('autofillMsg', `Scan failed: ${err.message}. Are you on a supported job site?`, 'error');
  }
});

$('btnFill').addEventListener('click', async () => {
  const persona = await getActivePersona();
  if (!persona) {
    showMsg('autofillMsg', 'No profile selected. Add one in Settings first.', 'warning');
    return;
  }
  const { geminiKey } = await chrome.storage.local.get('geminiKey');
  if (!geminiKey) {
    showMsg('autofillMsg', 'Missing API key. Go to Settings first.', 'warning');
    return;
  }

  hideMsg('autofillMsg');
  $('resultsList').innerHTML = '';
  $('btnFill').disabled = true;
  $('btnScan').disabled = true;
  showProg('autofillProg');
  $('progLbl').textContent = `Generating answers for "${persona.name}"…`;

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'GENERATE_ANSWERS',
      fields: detectedFields,
      resumeText: persona.resume,
      jobDesc: scrapedJD || null,
      geminiKey,
    });

    if (response.error) throw new Error(response.error);

    $('progLbl').textContent = 'Injecting inline review buttons…';

    const tab = await getActiveTab();

    // Feature 3: inject floating draft UI instead of direct injection
    await chrome.tabs.sendMessage(tab.id, {
      type: 'INJECT_DRAFT_UI',
      drafts: response.answers,
      geminiKey,
      resumeText: persona.resume,
      jobDesc: scrapedJD || null,
    });

    // Feature 4: set up submit watcher
    const salaryData = {};
    try {
      const sd = await chrome.tabs.sendMessage(tab.id, { type: 'SCRAPE_SALARY' });
      Object.assign(salaryData, sd || {});
    } catch (_) {}

    await chrome.tabs.sendMessage(tab.id, {
      type: 'WATCH_SUBMIT',
      captureData: {
        company: salaryData.jobTitle ? '' : '',
        jobTitle: salaryData.jobTitle || '',
        answers: response.answers,
      },
    });

    hideProg('autofillProg');
    showMsg('autofillMsg', `✓ ${Object.keys(response.answers).length} AI drafts ready. Click the ✦ sparkle buttons on the page to review each answer.`, 'success');

    // Preview in popup
    const list = $('resultsList');
    for (const [q, a] of Object.entries(response.answers)) {
      const item = document.createElement('div');
      item.className = 'res-item';
      item.innerHTML = `<div class="res-q">${escapeHtml(q)}</div><div class="res-a">${escapeHtml(a.substring(0, 110))}${a.length > 110 ? '…' : ''}</div>`;
      list.appendChild(item);
    }

  } catch (err) {
    hideProg('autofillProg');
    showMsg('autofillMsg', `Error: ${err.message}`, 'error');
  } finally {
    $('btnFill').disabled = false;
    $('btnScan').disabled = false;
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// FEATURE 5: COVER LETTER (PDF + TXT)
// ═══════════════════════════════════════════════════════════════════════════════

async function generateCoverLetter() {
  const jobDesc = $('jobDesc').value.trim();
  if (!jobDesc) { showMsg('coverMsg', 'Paste the job description first.', 'warning'); return null; }

  const persona = await getActivePersona();
  if (!persona) { showMsg('coverMsg', 'No profile configured. Go to Settings.', 'warning'); return null; }

  const { geminiKey } = await chrome.storage.local.get('geminiKey');
  if (!geminiKey) { showMsg('coverMsg', 'Missing API key. Go to Settings.', 'warning'); return null; }

  hideMsg('coverMsg');
  showProg('coverProg');
  $('btnGeneratePDF').disabled = true;
  $('btnDownloadTxt').disabled = true;

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'GENERATE_COVER_LETTER',
      jobDesc,
      resumeText: persona.resume,
      geminiKey,
    });
    if (response.error) throw new Error(response.error);
    return response.coverLetter;
  } catch (err) {
    showMsg('coverMsg', `Error: ${err.message}`, 'error');
    return null;
  } finally {
    hideProg('coverProg');
    $('btnGeneratePDF').disabled = false;
    $('btnDownloadTxt').disabled = false;
  }
}

$('btnGeneratePDF').addEventListener('click', async () => {
  const text = await generateCoverLetter();
  if (!text) return;
  try {
    await buildAndDownloadPDF(text);
    showMsg('coverMsg', '✓ Tailored_Cover_Letter.pdf downloaded.', 'success');
  } catch (err) {
    showMsg('coverMsg', `PDF error: ${err.message}`, 'error');
  }
});

$('btnDownloadTxt').addEventListener('click', async () => {
  const text = await generateCoverLetter();
  if (!text) return;
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'Tailored_Cover_Letter.txt'; a.click();
  URL.revokeObjectURL(url);
  showMsg('coverMsg', '✓ Tailored_Cover_Letter.txt downloaded.', 'success');
});

async function buildAndDownloadPDF(text) {
  await loadScript(chrome.runtime.getURL('jspdf.umd.min.js'));
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const mL = 20, mR = 20, mT = 25;
  const maxW = doc.internal.pageSize.getWidth() - mL - mR;
  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(30, 30, 30);
  const lines = doc.splitTextToSize(text, maxW);
  let y = mT;
  const lh = 6;
  const pH = doc.internal.pageSize.getHeight() - 20;
  for (const line of lines) {
    if (y + lh > pH) { doc.addPage(); y = mT; }
    doc.text(line, mL, y);
    y += lh;
  }
  doc.save('Tailored_Cover_Letter.pdf');
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s = document.createElement('script');
    s.src = src; s.onload = resolve;
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// FEATURE 6: SALARY SUGGESTION
// ═══════════════════════════════════════════════════════════════════════════════

$('btnSalary').addEventListener('click', async () => {
  const persona = await getActivePersona();
  if (!persona) { showMsg('salaryMsg', 'No profile configured. Go to Settings.', 'warning'); return; }

  const { geminiKey } = await chrome.storage.local.get('geminiKey');
  if (!geminiKey) { showMsg('salaryMsg', 'Missing API key. Go to Settings.', 'warning'); return; }

  hideMsg('salaryMsg');
  $('salaryCard').style.display = 'none';
  $('btnSalary').disabled = true;
  showProg('salaryProg');

  try {
    const tab = await getActiveTab();
    let salaryData = {};
    try {
      salaryData = await chrome.tabs.sendMessage(tab.id, { type: 'SCRAPE_SALARY' }) || {};
    } catch (_) {}

    const response = await chrome.runtime.sendMessage({
      type: 'SALARY_SUGGESTION',
      salaryData,
      resumeText: persona.resume,
      geminiKey,
    });

    if (response.error) throw new Error(response.error);

    hideProg('salaryProg');
    $('salaryAns').textContent = response.suggestion;
    const meta = [];
    if (salaryData.listedSalary) meta.push(`Listed: ${salaryData.listedSalary}`);
    if (salaryData.location)     meta.push(`Location: ${salaryData.location}`);
    $('salaryMeta').textContent = meta.join(' · ') || 'No salary data found on page — used résumé context only';
    $('salaryCard').style.display = 'block';

  } catch (err) {
    hideProg('salaryProg');
    showMsg('salaryMsg', `Error: ${err.message}`, 'error');
  } finally {
    $('btnSalary').disabled = false;
  }
});

$('btnCopySalary').addEventListener('click', () => {
  navigator.clipboard.writeText($('salaryAns').textContent).then(() => {
    $('btnCopySalary').textContent = '✓ Copied!';
    setTimeout(() => { $('btnCopySalary').innerHTML = `<svg viewBox="0 0 16 16" fill="none" style="width:13px;height:13px"><rect x="5" y="5" width="8" height="9" rx="1" stroke="currentColor" stroke-width="1.3"/><path d="M3 11V3h8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg> Copy to clipboard`; }, 2000);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// FEATURE 4: APPLICATION TRACKER
// ═══════════════════════════════════════════════════════════════════════════════

const STATUS_CLASSES = {
  Applied:   'st-applied',
  Interview: 'st-interview',
  Offer:     'st-offer',
  Rejected:  'st-rejected',
};

async function renderTracker() {
  const { applications = [] } = await chrome.storage.local.get('applications');
  const list = $('trackerList');
  const count = applications.length;

  $('trackerCount').textContent = `${count} application${count !== 1 ? 's' : ''}`;

  if (!count) {
    list.innerHTML = '<div class="tracker-empty">No applications tracked yet.<br>Applications auto-log when you hit submit on a job form.</div>';
    return;
  }

  list.innerHTML = '';
  applications.forEach((app, i) => {
    const entry = document.createElement('div');
    entry.className = 'app-entry';
    const statusClass = STATUS_CLASSES[app.status] || 'st-applied';
    const ansCount = Object.keys(app.answers || {}).length;

    entry.innerHTML = `
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px">
        <div style="flex:1;min-width:0">
          <div class="app-company">${escapeHtml(app.company || 'Unknown company')}</div>
          <div class="app-meta">${escapeHtml(app.jobTitle || 'Unknown role')} · ${escapeHtml(app.date)}${ansCount ? ` · ${ansCount} answers` : ''}</div>
          ${app.url ? `<a class="app-url" href="${escapeHtml(app.url)}" target="_blank">${escapeHtml(app.url.substring(0, 55))}${app.url.length > 55 ? '…' : ''}</a>` : ''}
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;flex-shrink:0">
          <select class="st-select status-sel" data-i="${i}">
            ${['Applied','Interview','Offer','Rejected'].map(s =>
              `<option value="${s}" ${app.status === s ? 'selected' : ''}>${s}</option>`
            ).join('')}
          </select>
          <button class="btn btn-s del-app" data-i="${i}" style="width:auto;padding:3px 8px;font-size:11px;color:var(--err)">Remove</button>
        </div>
      </div>
    `;
    list.appendChild(entry);
  });

  list.querySelectorAll('.status-sel').forEach(sel => {
    sel.addEventListener('change', async () => {
      const { applications: apps = [] } = await chrome.storage.local.get('applications');
      apps[+sel.dataset.i].status = sel.value;
      await chrome.storage.local.set({ applications: apps });
    });
  });

  list.querySelectorAll('.del-app').forEach(btn => {
    btn.addEventListener('click', async () => {
      const { applications: apps = [] } = await chrome.storage.local.get('applications');
      apps.splice(+btn.dataset.i, 1);
      await chrome.storage.local.set({ applications: apps });
      renderTracker();
    });
  });
}

$('btnExportCSV').addEventListener('click', async () => {
  const { applications = [] } = await chrome.storage.local.get('applications');
  if (!applications.length) return;
  const rows = [['Company', 'Role', 'Date', 'Status', 'URL']];
  applications.forEach(a => rows.push([
    a.company || '', a.jobTitle || '', a.date || '', a.status || '', a.url || ''
  ]));
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'applications.csv'; a.click();
  URL.revokeObjectURL(url);
});

// Init persona dropdown on load
refreshPersonaDropdown();
