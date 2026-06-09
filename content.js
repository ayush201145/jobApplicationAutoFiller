// content.js — AI Job Assistant content script
// Handles: JD scraping, salary data extraction, inline draft UI injection,
// submit-button interception for the Application Tracker.

(function () {
  if (window.__aiJobAssistantLoaded) return;
  window.__aiJobAssistantLoaded = true;

  // ── Message router ──────────────────────────────────────────────────────────
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === 'PING')         { sendResponse({ ok: true, url: location.href }); return; }
    if (message.type === 'SCRAPE_JD')    { sendResponse(scrapeJobDescription()); return; }
    if (message.type === 'SCRAPE_SALARY'){ sendResponse(scrapeSalaryData()); return; }
    if (message.type === 'SCAN_FIELDS')  { sendResponse(scanForFields()); return; }
    if (message.type === 'INJECT_DRAFT_UI') {
      injectDraftUI(message.drafts, message.geminiKey, message.resumeText, message.jobDesc);
      sendResponse({ ok: true });
      return;
    }
    if (message.type === 'WATCH_SUBMIT') {
      watchForSubmit(message.captureData);
      sendResponse({ ok: true });
      return;
    }
  });

  // ── 1. Job Description Scraper ──────────────────────────────────────────────
  function scrapeJobDescription() {
    const selectors = [
      // Greenhouse
      '.job__description', '#content .job-post',
      // Lever
      '.posting-description', '.content-wrapper',
      // Workday
      '[data-automation-id="jobPostingDescription"]',
      // LinkedIn
      '.jobs-description__content', '.job-view-layout',
      // Workable
      '.job-description', '.description',
      // Generic fallbacks
      '[class*="job-desc"]', '[class*="jobDesc"]', '[id*="job-desc"]',
      '[class*="description"]', 'article', 'main',
    ];

    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) {
        const text = el.innerText.trim();
        if (text.length > 100) return { jobDesc: text.substring(0, 6000) };
      }
    }

    // Last resort: largest text block on page
    const blocks = [...document.querySelectorAll('p, li, div')]
      .filter(el => el.children.length === 0 && el.innerText.trim().length > 50)
      .sort((a, b) => b.innerText.length - a.innerText.length);

    const combined = blocks.slice(0, 15).map(b => b.innerText.trim()).join('\n\n');
    return { jobDesc: combined.substring(0, 6000) || null };
  }

  // ── 2. Salary Data Scraper ─────────────────────────────────────────────────
  function scrapeSalaryData() {
    const text = document.body.innerText;

    // Extract salary range patterns: $80,000 - $120,000 / £50k–£70k / ₹8–12 LPA
    const salaryPattern = /(?:\$|£|€|₹|USD|GBP|EUR|INR)\s?[\d,]+(?:k|K|L|LPA)?(?:\s*[-–to]+\s*(?:\$|£|€|₹)?[\d,]+(?:k|K|L|LPA)?)?(?:\s*(?:per year|\/yr|\/year|per annum|p\.a\.|annually|per month|\/mo))?/gi;
    const salaryMatches = text.match(salaryPattern);
    const listedSalary = salaryMatches ? salaryMatches.slice(0, 3).join(', ') : null;

    // Location
    const locationPattern = /(?:location|based in|office)[:\s]+([A-Za-z\s,]+?)(?:\n|\.|\||–)/i;
    const locMatch = text.match(locationPattern);
    const location = locMatch ? locMatch[1].trim() : null;

    // Job title from page title or h1
    const h1 = document.querySelector('h1');
    const jobTitle = h1 ? h1.innerText.trim().substring(0, 100) : document.title.substring(0, 100);

    return { listedSalary, location, jobTitle };
  }

  // ── 3. Field Scanner ───────────────────────────────────────────────────────
  function scanForFields() {
    const results = [];
    const seen = new Set();
    const candidates = [
      ...document.querySelectorAll('textarea'),
      ...document.querySelectorAll('input[type="text"]'),
    ];

    for (let i = 0; i < candidates.length; i++) {
      const el = candidates[i];
      if (!el.offsetParent) continue;
      if (el.value && el.value.trim().length > 5) continue;

      let label = getLabel(el);
      if (!label || label.length < 3) continue;
      if (seen.has(label)) continue;
      seen.add(label);
      results.push({ index: i, label });
    }
    return results;
  }

  function getLabel(el) {
    if (el.id) {
      const lEl = document.querySelector(`label[for="${el.id}"]`);
      if (lEl) return lEl.innerText.trim();
    }
    if (el.getAttribute('aria-label')) return el.getAttribute('aria-label');
    if (el.getAttribute('aria-labelledby')) {
      const ref = document.getElementById(el.getAttribute('aria-labelledby'));
      if (ref) return ref.innerText.trim();
    }
    let parent = el.parentElement;
    for (let d = 0; d < 6 && parent; d++) {
      const lEl = parent.querySelector('label');
      if (lEl) return lEl.innerText.trim();
      if (el.placeholder && el.placeholder.length > 3) return el.placeholder;
      parent = parent.parentElement;
    }
    return '';
  }

  // ── 4. Inline Draft UI ─────────────────────────────────────────────────────
  function injectDraftUI(drafts, geminiKey, resumeText, jobDesc) {
    // Remove any previous overlays
    document.querySelectorAll('.aija-overlay').forEach(el => el.remove());

    const candidates = [
      ...document.querySelectorAll('textarea'),
      ...document.querySelectorAll('input[type="text"]'),
    ];

    for (const [question, answer] of Object.entries(drafts)) {
      for (const el of candidates) {
        const label = getLabel(el);
        if (!label || label.trim() !== question.trim()) continue;

        const rect = el.getBoundingClientRect();
        const scrollY = window.scrollY;
        const scrollX = window.scrollX;

        // Sparkle trigger button
        const sparkle = document.createElement('button');
        sparkle.className = 'aija-overlay aija-sparkle';
        sparkle.innerHTML = '✦';
        sparkle.title = 'AI draft ready — click to review';
        sparkle.style.cssText = `
          position:absolute;
          top:${rect.top + scrollY + 4}px;
          left:${rect.right + scrollX - 28}px;
          z-index:2147483640;
          width:22px; height:22px;
          border-radius:50%;
          background:#6366f1;
          color:#fff;
          border:none;
          cursor:pointer;
          font-size:11px;
          line-height:22px;
          text-align:center;
          box-shadow:0 2px 8px rgba(99,102,241,0.5);
          transition:transform 0.15s;
        `;

        // Tooltip panel
        const panel = document.createElement('div');
        panel.className = 'aija-overlay aija-panel';
        panel.style.cssText = `
          position:absolute;
          top:${rect.bottom + scrollY + 6}px;
          left:${Math.max(8, rect.left + scrollX)}px;
          z-index:2147483641;
          width:${Math.min(460, Math.max(rect.width, 320))}px;
          background:#1e2130;
          border:1px solid rgba(255,255,255,0.1);
          border-radius:10px;
          padding:14px;
          box-shadow:0 8px 32px rgba(0,0,0,0.4);
          display:none;
          font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
          font-size:13px;
          color:#f0f1f5;
        `;

        panel.innerHTML = `
          <div style="font-size:11px;color:#8b8fa8;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.05em;">AI draft</div>
          <div class="aija-draft-text" style="background:#252836;border-radius:6px;padding:10px;font-size:12.5px;line-height:1.6;color:#e2e4ef;margin-bottom:12px;max-height:120px;overflow-y:auto;">${escapeHtml(answer)}</div>
          <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px;">
            <button class="aija-act" data-action="insert" style="${btnStyle('#6366f1','#fff')}">Insert ↩</button>
            <button class="aija-act" data-action="shorter" style="${btnStyle('#252836','#a5b4fc')}">Make shorter</button>
            <button class="aija-act" data-action="longer" style="${btnStyle('#252836','#a5b4fc')}">Make longer</button>
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:6px;">
            <button class="aija-act" data-action="professional" style="${btnStyle('#252836','#6ee7b7')}">Professional</button>
            <button class="aija-act" data-action="technical" style="${btnStyle('#252836','#6ee7b7')}">Technical</button>
            <button class="aija-act" data-action="enthusiastic" style="${btnStyle('#252836','#fbbf24')}">Enthusiastic</button>
          </div>
          <div class="aija-regen-status" style="margin-top:8px;font-size:11.5px;color:#8b8fa8;display:none;">Regenerating…</div>
        `;

        function btnStyle(bg, color) {
          return `background:${bg};color:${color};border:1px solid rgba(255,255,255,0.1);border-radius:5px;padding:5px 10px;font-size:12px;cursor:pointer;font-family:inherit;`;
        }

        let currentAnswer = answer;

        panel.querySelectorAll('.aija-act').forEach(btn => {
          btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const action = btn.dataset.action;

            if (action === 'insert') {
              setFieldValue(el, currentAnswer);
              panel.style.display = 'none';
              sparkle.style.background = '#22c55e';
              sparkle.innerHTML = '✓';
              return;
            }

            const instructionMap = {
              shorter: 'Make this answer shorter — ideally 1–2 sentences.',
              longer: 'Expand this answer with more specific detail — 3–5 sentences.',
              professional: 'Rewrite in a formal, polished, corporate professional tone.',
              technical: 'Rewrite emphasising technical skills, tools, and measurable outcomes.',
              enthusiastic: 'Rewrite in an energetic, enthusiastic, passionate tone while staying professional.',
            };

            const status = panel.querySelector('.aija-regen-status');
            status.style.display = 'block';
            status.textContent = 'Regenerating…';
            btn.disabled = true;

            try {
              const resp = await chrome.runtime.sendMessage({
                type: 'REGENERATE_ANSWER',
                question,
                currentAnswer,
                instruction: instructionMap[action],
                resumeText,
                jobDesc,
                geminiKey,
              });

              if (resp.error) throw new Error(resp.error);
              currentAnswer = resp.revised;
              panel.querySelector('.aija-draft-text').textContent = currentAnswer;
              status.textContent = '✓ Updated';
              setTimeout(() => { status.style.display = 'none'; }, 1500);
            } catch (err) {
              status.textContent = `Error: ${err.message}`;
            } finally {
              btn.disabled = false;
            }
          });
        });

        sparkle.addEventListener('click', (e) => {
          e.stopPropagation();
          const isOpen = panel.style.display === 'block';
          document.querySelectorAll('.aija-panel').forEach(p => p.style.display = 'none');
          panel.style.display = isOpen ? 'none' : 'block';
        });

        document.addEventListener('click', (e) => {
          if (!panel.contains(e.target) && e.target !== sparkle) {
            panel.style.display = 'none';
          }
        }, { once: false });

        document.body.appendChild(sparkle);
        document.body.appendChild(panel);
        break;
      }
    }
  }

  function setFieldValue(el, value) {
    const proto = el.tagName === 'TEXTAREA'
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    setter.call(el, value);
    el.dispatchEvent(new Event('input',  { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // ── 5. Submit Watcher (Application Tracker) ────────────────────────────────
  function watchForSubmit(captureData) {
    const submitSelectors = [
      'button[type="submit"]',
      'input[type="submit"]',
      'button[class*="submit"]',
      'button[class*="apply"]',
      '[data-automation-id="bottom-navigation-next-button"]',
      'button[aria-label*="submit" i]',
      'button[aria-label*="apply" i]',
    ];

    const submitBtn = submitSelectors.reduce((found, sel) => found || document.querySelector(sel), null);

    if (!submitBtn) return;

    submitBtn.addEventListener('click', async () => {
      const record = {
        id: Date.now(),
        company: captureData.company || extractCompany(),
        jobTitle: captureData.jobTitle || document.querySelector('h1')?.innerText?.trim() || 'Unknown Role',
        url: location.href,
        date: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }),
        answers: captureData.answers || {},
        status: 'Applied',
      };

      const { applications = [] } = await chrome.storage.local.get('applications');
      applications.unshift(record);
      await chrome.storage.local.set({ applications: applications.slice(0, 200) }); // cap at 200
    }, { once: true });
  }

  function extractCompany() {
    const og = document.querySelector('meta[property="og:site_name"]');
    if (og) return og.content;
    const title = document.title;
    const parts = title.split(/[-|–—]/);
    return parts.length > 1 ? parts[parts.length - 1].trim() : title.substring(0, 40);
  }

  function escapeHtml(str) {
    const d = document.createElement('div');
    d.appendChild(document.createTextNode(str));
    return d.innerHTML;
  }

})();
