// Vercel serverless function: keeps your API key secret on the server.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const { subjects = [], hours = 4 } = req.body || {}
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: 'Missing API key' })
  const list = subjects.map((s) => `${s.name} (exam ${s.date}, difficulty ${s.difficulty}/3)`).join('; ')
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6', max_tokens: 500,
      messages: [{ role: 'user', content: `A student studies ${hours} hours/day for: ${list}. Give 5 short, specific study tips tailored to these subjects and deadlines. Plain text, one tip per line.` }],
    }),
  })
  const data = await r.json()
  if (!r.ok) {
    console.error('Anthropic API error:', r.status, JSON.stringify(data))
    return res.status(500).json({ error: data.error?.message || 'Anthropic API error', status: r.status })
  }
  res.status(200).json({ tips: data.content?.[0]?.text || 'No tips available.' })
}
