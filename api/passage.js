// Serverless proxy for the ESV API (https://api.esv.org) so the API key never reaches the browser.
//   GET /api/passage?mode=verse&q=John+3:16       -> { canonical, text }
//   GET /api/passage?mode=context&q=John+3:13-19  -> { canonical, html }

const REF = /^[1-3]?\s?[A-Za-z][A-Za-z ]{1,24}\s\d{1,3}:\d{1,3}(-\d{1,3})?$/;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store'); // Crossway limits how much ESV text may be stored
  const key = process.env.ESV_API_KEY;
  if (!key) return res.status(500).json({ error: 'ESV_API_KEY is not set on the server.' });

  const q = String(req.query.q || '').trim();
  const mode = req.query.mode === 'context' ? 'context' : 'verse';
  if (!REF.test(q)) return res.status(400).json({ error: 'Bad reference.' });

  const params = new URLSearchParams({ q, 'include-footnotes': 'false' });
  let url;
  if (mode === 'verse') {
    for (const p of ['include-passage-references', 'include-verse-numbers', 'include-first-verse-numbers',
      'include-headings', 'include-short-copyright']) params.set(p, 'false');
    params.set('indent-paragraphs', '0');
    params.set('indent-poetry', 'false');
    url = 'https://api.esv.org/v3/passage/text/?' + params;
  } else {
    params.set('include-audio-link', 'false');
    params.set('include-passage-references', 'false');
    params.set('include-short-copyright', 'false');
    url = 'https://api.esv.org/v3/passage/html/?' + params;
  }

  try {
    const r = await fetch(url, { headers: { Authorization: 'Token ' + key } });
    if (!r.ok) return res.status(r.status).json({ error: 'ESV API returned ' + r.status });
    const data = await r.json();
    const passage = (data.passages && data.passages[0]) || '';
    const out = { canonical: data.canonical || q };
    if (mode === 'verse') {
      // The ESV omits a few verses (e.g. Matt 17:21) and answers with the neighbouring range instead;
      // report those as empty so the app skips them rather than showing the wrong verse.
      out.text = /[\u2013-]/.test(out.canonical) ? '' : passage.replace(/\s+/g, ' ').trim();
    } else {
      out.html = passage;
    }
    return res.status(200).json(out);
  } catch (e) {
    return res.status(502).json({ error: 'Could not reach the ESV API.' });
  }
}
