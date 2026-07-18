// Runs on Netlify's servers, never in the visitor's browser.
// Uses Google Gemini's free API tier — no billing/tax-ID setup required.

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let job, langName, langNative;
  try {
    const body = JSON.parse(event.body || '{}');
    job = (body.job || '').trim();
    langName = (body.langName || 'English').slice(0, 40);
    langNative = (body.langNative || 'English').slice(0, 40);
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body' }) };
  }

  if (!job) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Job title required' }) };
  }
  if (job.length > 100) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Job title too long' }) };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Server not configured — missing API key' }) };
  }

  const systemPrompt = `You are a calibrated, honest career-risk analyst — not a doomsayer and not a cheerleader. Given a job title, respond ONLY with valid JSON, no markdown fences, no preamble, matching exactly this shape:
{
  "risk_score": <integer 0-100, overall automation exposure over the next ~3-5 years>,
  "verdict": "<a short, punchy, airport-departure-board style status line, max 6 words, e.g. 'DELAYED — TASKS REROUTING' or 'STILL BOARDING' or 'ON TIME, FOR NOW'>",
  "verdict_note": "<one calibrated sentence, max 28 words, explaining the overall read in plain language, no hype>",
  "tasks": [
    {"name": "<short task name, 2-5 words>", "status": "AUTOMATABLE" | "HYBRID" | "SAFE", "note": "<max 12 words, concrete reason>"}
  ],
  "next_step": "<one specific, actionable, realistic suggestion for this exact role, max 35 words, no generic 'learn AI' platitudes>"
}
Include exactly 5 tasks that are genuinely representative of this specific job, ordered from most to least automatable. Be specific to the actual role, not generic. Ground the risk_score in the mix of task statuses. Keep tone factual and grounded — this matters to real people's livelihoods.
Write every string value (verdict, verdict_note, task names, task notes, next_step) in ${langName} (${langNative}). Keep the JSON keys and the "status" enum values (AUTOMATABLE, HYBRID, SAFE) in English exactly as specified — only the human-readable text should be translated. Use natural, native-sounding phrasing, not a literal translation.`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ parts: [{ text: `Job title: ${job}` }] }],
          generationConfig: { maxOutputTokens: 1000, temperature: 0.7 }
        })
      }
    );

    if (!response.ok) {
      return { statusCode: 502, body: JSON.stringify({ error: 'Upstream request failed' }) };
    }

    const data = await response.json();
    const text = data.candidates && data.candidates[0] && data.candidates[0].content
      ? data.candidates[0].content.parts[0].text
      : null;
    if (!text) {
      return { statusCode: 502, body: JSON.stringify({ error: 'No response text' }) };
    }

    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsed)
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Server error' }) };
  }
};
