const MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash'
const clip = (s, n) => String(s ?? '').slice(0, n)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  const key = process.env.GEMINI_API_KEY
  if (!key) return res.status(500).json({ error: 'Missing GEMINI_API_KEY' })

  const b = req.body || {}
  const mode = ['coach', 'ask', 'topics'].find((m) => m === b.mode)
  if (!mode) return res.status(400).json({ error: 'Invalid mode' })
  if (mode === 'ask' && !clip(b.question, 300).trim()) return res.status(400).json({ error: 'Empty question' })
  if (mode === 'topics' && !clip(b.subject, 60).trim()) return res.status(400).json({ error: 'Missing subject' })

  const subjects = (Array.isArray(b.subjects) ? b.subjects.slice(0, 15) : [])
    .map((s) => `${clip(s.name, 60)} (exam ${clip(s.date, 10)}, difficulty ${+s.difficulty || 2}/3)`).join('; ') || 'none yet'
  const st = b.stats || {}
  const today = (Array.isArray(st.today) ? st.today.slice(0, 10) : [])
    .map((t) => `${clip(t.subject, 60)} ${+t.hours || 0}h ${t.done ? 'done' : 'pending'}`).join(', ') || 'none'
  const ctx = `A student studies ${+b.hours || 4}h/day. Subjects: ${subjects}. Progress: ${+st.completedPct || 0}% of planned sessions done, ` +
    `${+st.streak || 0}-day streak, ${+st.focusTodayMin || 0} min focused today. Today's sessions: ${today}.`

  const prompts = {
    coach: `${ctx}\nAct as a friendly study coach. Give exactly 5 short, specific, actionable suggestions for TODAY based on this data. ` +
      `Mention subject names and deadlines, praise real progress, and flag risks. Plain text, one per line, no markdown.`,
    ask: `${ctx}\nAnswer the student's question in at most 120 words. Be practical and encouraging. Plain text, no markdown.\nQuestion: ${clip(b.question, 300)}`,
    topics: `List 6 to 8 key topics a student should cover to prepare for an exam in "${clip(b.subject, 60)}", ordered from foundational to advanced. ` +
      `Return only a JSON array of short strings (max 6 words each).`,
  }

  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompts[mode] }] }],
        generationConfig: mode === 'topics' ? { responseMimeType: 'application/json' } : {},
      }),
    })
    const data = await r.json()
    if (!r.ok) { console.error('Gemini error:', r.status, JSON.stringify(data)); return res.status(502).json({ error: 'AI service error' }) }
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
    if (!text) return res.status(502).json({ error: 'Empty AI response' })

    if (mode === 'topics') {
      let arr
      try { arr = JSON.parse(text) } catch { return res.status(502).json({ error: 'Bad AI format' }) }
      const topics = (Array.isArray(arr) ? arr : []).filter((t) => typeof t === 'string').map((t) => clip(t, 60)).slice(0, 8)
      return topics.length ? res.status(200).json({ topics }) : res.status(502).json({ error: 'No topics' })
    }
    res.status(200).json({ text })
  } catch (err) {
    console.error('Gemini request failed:', err.message)
    res.status(502).json({ error: 'Request failed' })
  }
}
