export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const { subjects = [], hours = 4 } = req.body || {}
  if (!process.env.GEMINI_API_KEY) return res.status(500).json({ error: 'Missing API key' })
  const list = subjects.map((s) => `${s.name} (exam ${s.date}, difficulty ${s.difficulty}/3)`).join('; ')
  const prompt = `A student studies ${hours} hours/day for: ${list}. Give 5 short, specific study tips tailored to these subjects and deadlines. Plain text, one tip per line, no markdown.`

  try {
    const r = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      }
    )
    const data = await r.json()
    if (!r.ok) {
      console.error('Gemini API error:', r.status, JSON.stringify(data))
      return res.status(502).json({ error: data.error?.message || 'Gemini API error' })
    }
    const tips = data.candidates?.[0]?.content?.parts?.[0]?.text
    if (!tips) return res.status(502).json({ error: 'Empty response from Gemini' })
    res.status(200).json({ tips, source: 'ai' })
  } catch (err) {
    console.error('Gemini request failed:', err.message)
    res.status(502).json({ error: 'Request failed' })
  }
}
