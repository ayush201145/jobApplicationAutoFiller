// background.js — Service worker (MV3). All Gemini API calls live here.
// The API key is NEVER passed to content scripts or the page context.

const GEMINI_MODEL = 'gemini-1.5-flash-latest';
const GEMINI_BASE  = 'https://generativelanguage.googleapis.com/v1beta/models';

// ─── Message router ───────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const handlers = {
    GENERATE_ANSWERS:      handleGenerateAnswers,
    GENERATE_COVER_LETTER: handleGenerateCoverLetter,
    REGENERATE_ANSWER:     handleRegenerateAnswer,
    SALARY_SUGGESTION:     handleSalarySuggestion,
  };
  const fn = handlers[message.type];
  if (fn) {
    fn(message).then(sendResponse).catch(err => sendResponse({ error: err.message }));
    return true; // async response
  }
});

// ─── Handler: Intelligent form autofill (with optional JD context) ────────────
async function handleGenerateAnswers({ fields, resumeText, jobDesc, geminiKey }) {
  if (!fields || fields.length === 0) throw new Error('No fields provided.');

  const questionsFormatted = fields.map((f, i) => `${i + 1}. ${f.label}`).join('\n');
  const jdSection = jobDesc
    ? `\nJOB DESCRIPTION (use this to tailor every answer to this specific role):\n---\n${jobDesc}\n---\n`
    : '';

  const prompt = `You are an expert career coach helping a job applicant complete their application.

CANDIDATE'S RÉSUMÉ:
---
${resumeText}
---
${jdSection}
APPLICATION QUESTIONS:
${questionsFormatted}

INSTRUCTIONS:
- Answer every question as the candidate, in first person.
- Be specific — reference real skills, experiences, and achievements from the résumé.
${jobDesc ? '- CRITICAL: Mirror the exact keywords, tech stack, and values from the job description in every answer.' : ''}
- Keep each answer concise but complete (1–4 sentences for most; up to a paragraph for "tell us about yourself").
- Sound natural, professional, and confident — not robotic.
- Return ONLY a valid JSON object: key = EXACT question text, value = answer string.
- No preamble, no markdown fences. Raw JSON only.

Example: { "Why do you want to work here?": "I'm drawn to your mission because..." }`;

  const rawText = await callGemini(geminiKey, prompt);
  const answers = parseJSON(rawText);
  return { answers };
}

// ─── Handler: Cover letter ────────────────────────────────────────────────────
async function handleGenerateCoverLetter({ jobDesc, resumeText, geminiKey }) {
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  const prompt = `You are an expert career coach writing a highly tailored cover letter.

CANDIDATE'S RÉSUMÉ:
---
${resumeText}
---

JOB DESCRIPTION:
---
${jobDesc}
---

TODAY'S DATE: ${today}

INSTRUCTIONS:
- Write a compelling cover letter in plain text (no markdown, no symbols).
- Structure: date, blank line, greeting, 3–4 paragraphs, closing, signature.
- Opening: genuine enthusiasm for the specific role and company.
- Body: connect candidate's skills/experience to job requirements with specifics.
- Closing: summarise fit + confident call to action.
- Tone: Professional, warm, confident. Sound human, not templated.
- Length: 280–380 words.
- Do NOT use "[Your Name]" — infer from résumé or use "I".
- Output letter text ONLY.`;

  const coverLetter = await callGemini(geminiKey, prompt);
  return { coverLetter: coverLetter.trim() };
}

// ─── Handler: Regenerate a single answer with tone/length adjustment ──────────
async function handleRegenerateAnswer({ question, currentAnswer, instruction, resumeText, jobDesc, geminiKey }) {
  const jdSection = jobDesc ? `\nJOB DESCRIPTION:\n---\n${jobDesc}\n---\n` : '';

  const prompt = `You are an expert career coach refining a job application answer.

CANDIDATE'S RÉSUMÉ:
---
${resumeText}
---
${jdSection}
QUESTION: "${question}"

CURRENT ANSWER:
"${currentAnswer}"

REFINEMENT INSTRUCTION: ${instruction}

INSTRUCTIONS:
- Rewrite the answer following the refinement instruction exactly.
- Keep it in first person, natural, and professional.
- Return ONLY the revised answer text. No quotes, no labels, no preamble.`;

  const revised = await callGemini(geminiKey, prompt);
  return { revised: revised.trim() };
}

// ─── Handler: Salary suggestion ───────────────────────────────────────────────
async function handleSalarySuggestion({ salaryData, resumeText, geminiKey }) {
  const prompt = `You are an expert career coach helping a candidate answer a salary expectation question diplomatically.

CANDIDATE'S RÉSUMÉ:
---
${resumeText}
---

CONTEXT FROM JOB POSTING:
${salaryData.listedSalary ? `Listed compensation: ${salaryData.listedSalary}` : 'No salary listed in posting.'}
${salaryData.location ? `Job location: ${salaryData.location}` : ''}
${salaryData.jobTitle ? `Job title: ${salaryData.jobTitle}` : ''}

INSTRUCTIONS:
- Write a single short diplomatic answer (2–3 sentences max) for "What are your salary expectations?"
- Infer the candidate's experience level from the résumé.
- If a salary range is listed, anchor to it positively.
- Always end with openness to discuss total compensation.
- Sound confident but flexible. First person. No markdown.
- Return ONLY the answer text.`;

  const suggestion = await callGemini(geminiKey, prompt);
  return { suggestion: suggestion.trim() };
}

// ─── Gemini API call ──────────────────────────────────────────────────────────
async function callGemini(apiKey, prompt) {
  const url = `${GEMINI_BASE}/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
    ],
  };

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new Error(`Network error — check your connection. (${e.message})`);
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = err?.error?.message || res.statusText;
    if (res.status === 401 || res.status === 403) throw new Error('Invalid API key. Check Settings.');
    if (res.status === 429) throw new Error('Rate limit hit. Wait a moment and retry.');
    throw new Error(`Gemini API error ${res.status}: ${msg}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error(`Gemini returned no content. Reason: ${data?.candidates?.[0]?.finishReason || 'unknown'}`);
  return text;
}

// ─── JSON parsing with cleanup ────────────────────────────────────────────────
function parseJSON(raw) {
  let cleaned = raw.trim()
    .replace(/^```json\s*/i, '').replace(/^```\s*/, '')
    .replace(/\s*```\s*$/, '');
  try { return JSON.parse(cleaned); } catch (_) {}
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (match) { try { return JSON.parse(match[0]); } catch (_) {} }
  throw new Error('Gemini returned malformed JSON. Try again.');
}
