/* labs - read biomarkers from a lab report (POST /labs/extract).

   The page reads a PDF's text itself (pdf.js) and parses the plain
   "Name value unit low-high" lines on the phone. What it cannot read -
   a photo of a printout, a messy table - comes here: the model returns
   the rows it can SEE, as data, and the person confirms each one before
   anything is saved.

   The instruction is extraction only: no interpretation, no diagnosis,
   no values that are not printed on the report. */

const SYSTEM = `You extract laboratory results from a lab report into structured rows. You do not interpret them.

Rules:
- Only rows that are printed on the report. Never infer, estimate or add a marker.
- One row per test: the test name as printed, the numeric result, its unit, the reference range low and high as printed (null when not printed), and the collection date (YYYY-MM-DD, null if not printed).
- If a result is "<5" or ">200", put the number in value and the sign in "qualifier".
- Keep the lab's units; do not convert.
- No commentary, no diagnosis, no advice.

Respond with ONLY a JSON array, no prose, no markdown fences:
[{"name":"Ferritin","value":22,"qualifier":null,"unit":"ng/mL","low":30,"high":400,"date":"2026-09-12"}]
Return [] if there are no lab results.`;

class LabError extends Error { constructor(status, msg) { super(msg); this.status = status; } }

function parseRows(text) {
  let raw = String(text || '').replace(/```json|```/g, '').trim();
  const a = raw.indexOf('[');
  if (a < 0) return [];
  let v;
  try { v = JSON.parse(raw.slice(a, raw.lastIndexOf(']') + 1)); } catch (e) { throw new LabError(502, 'The report read came back garbled. Try again.'); }
  if (!Array.isArray(v)) return [];
  const num = (x) => (x == null || x === '' || !isFinite(+x) ? null : Math.round(+x * 1000) / 1000);
  return v.filter((r) => r && typeof r.name === 'string' && num(r.value) != null).slice(0, 80).map((r) => ({
    name: r.name.slice(0, 60), value: num(r.value), qualifier: /^[<>]=?$/.test(r.qualifier || '') ? r.qualifier : null,
    unit: String(r.unit || '').slice(0, 16), low: num(r.low), high: num(r.high),
    date: /^\d{4}-\d{2}-\d{2}$/.test(r.date || '') ? r.date : null
  }));
}

async function extract({ cfg, body, fetch }) {
  fetch = fetch || ((...a) => global.fetch(...a));
  body = body || {};
  if (!cfg.anthropicKey) throw new LabError(503, 'Reading reports is not configured on the server yet.');
  const content = [];
  if (body.image) {
    const b64 = String(body.image).replace(/^data:[^,]*,/, '');
    if (!/^[A-Za-z0-9+/=]+$/.test(b64) || b64.length > 4.2 * 1024 * 1024) throw new LabError(400, 'Send the photo as base64 JPEG under 3 MB.');
    content.push({ type: 'image', source: { type: 'base64', media_type: /^image\/(jpeg|png|webp)$/.test(body.mime) ? body.mime : 'image/jpeg', data: b64 } });
    content.push({ type: 'text', text: 'Extract the lab results from this report.' });
  } else {
    const t = String(body.text || '').slice(0, 60000);
    if (t.trim().length < 20) throw new LabError(400, 'There is no text to read in that report.');
    content.push({ type: 'text', text: 'Extract the lab results from this report text:\n\n' + t });
  }
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': cfg.anthropicKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: cfg.model, max_tokens: 4000, temperature: 0, system: SYSTEM, messages: [{ role: 'user', content }] })
  });
  if (!r.ok) { console.error('labs', r.status); throw new LabError(503, 'Could not read the report right now.'); }
  const j = await r.json();
  return { rows: parseRows((j.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n')) };
}

module.exports = { extract, parseRows, LabError, SYSTEM };
