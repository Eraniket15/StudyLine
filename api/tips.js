// Vercel serverless function: keeps your API key secret on the server.
// Uses Google Gemini's free-tier API (generativelanguage.googleapis.com).
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const { subjects = [], hours = 4 } = req.body || {}
  if (!process.env.GEMINI_API_KEY) return res.status(500).json({ error: 'Missing API key' })
  const list = subjects.map((s) => `${s.name} (exam ${s.date}, difficulty ${s.difficulty}/3)`).join('; ')
  const prompt = `A student studies ${hours} hours/day for: ${list}. Give 5 short, specific study tips tailored to these subjects and deadlines. Plain text, one tip per line, no markdown.`

  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    }
  )
  const data = await r.json()
  if (!r.ok) {
    console.error('Gemini API error:', r.status, JSON.stringify(data))
    return res.status(500).json({ error: data.error?.message || 'Gemini API error', status: r.status })
  }
  const tips = data.candidates?.[0]?.content?.parts?.[0]?.text || 'No tips available.'
  res.status(200).json({ tips })
}
