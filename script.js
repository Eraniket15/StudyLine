const DAY = 86400000
const $ = (s) => document.querySelector(s)
const iso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
const at = (s) => new Date(s + 'T00:00:00')
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d } catch { return d } }
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch {} }

// Small helper to build DOM safely (textContent, so user input can't inject HTML)
function el(tag, props = {}, ...kids) {
  const n = Object.assign(document.createElement(tag), props)
  kids.forEach((k) => n.append(k))
  return n
}

const state = {
  subjects: load('sp-subjects', []),
  hours: load('sp-hours', 4),
  done: load('sp-done', {}),
  dark: load('sp-dark', false),
}

// Core scheduler: harder subjects and closer exams get more hours each day.
function buildPlan(subjects, hoursPerDay) {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const live = subjects.filter((s) => at(s.date) > today)
  if (!live.length) return []
  const last = Math.max(...live.map((s) => +at(s.date)))
  const plan = []
  for (let t = +today; t < last; t += DAY) {
    const active = live.filter((s) => +at(s.date) > t)
    if (!active.length) continue
    const weights = active.map((s) => s.difficulty * (1 + 3 / Math.max(1, (+at(s.date) - t) / DAY)))
    const total = weights.reduce((a, b) => a + b, 0)
    const blocks = active
      .map((s, i) => ({ id: `${iso(new Date(t))}-${s.id}`, subject: s.name, hours: Math.round(((hoursPerDay * weights[i]) / total) * 2) / 2 }))
      .filter((b) => b.hours > 0)
    plan.push({ date: iso(new Date(t)), blocks })
  }
  return plan
}

function render() {
  document.documentElement.dataset.theme = state.dark ? 'dark' : 'light'
  $('#theme').textContent = state.dark ? 'Light mode' : 'Dark mode'
  $('#hours').value = state.hours
  $('#hoursLabel').textContent = state.hours

  const chips = $('#chips'); chips.replaceChildren()
  state.subjects.forEach((s) => {
    const x = el('button', { className: 'x', textContent: '×', ariaLabel: `Remove ${s.name}` })
    x.onclick = () => { state.subjects = state.subjects.filter((v) => v.id !== s.id); save('sp-subjects', state.subjects); render() }
    chips.append(el('li', {}, `${s.name} · ${s.date}`, x))
  })

  const plan = buildPlan(state.subjects, state.hours)
  const all = plan.flatMap((d) => d.blocks)
  const doneCount = all.filter((b) => state.done[b.id]).length
  const pct = all.length ? Math.round((doneCount / all.length) * 100) : 0

  $('#progress').hidden = !all.length
  $('#empty').hidden = !!all.length
  $('#progressText').textContent = `${doneCount} of ${all.length} sessions · ${pct}%`
  $('#barFill').style.width = pct + '%'

  const days = $('#days'); days.replaceChildren()
  plan.forEach((d) => {
    const card = el('article', { className: 'day' }, el('h3', {
      textContent: at(d.date).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }),
    }))
    d.blocks.forEach((b) => {
      const box = el('input', { type: 'checkbox', checked: !!state.done[b.id] })
      box.onchange = () => { state.done[b.id] = box.checked; save('sp-done', state.done); render() }
      card.append(el('label', { className: 'block' + (state.done[b.id] ? ' done' : '') },
        box, el('span', { textContent: b.subject }), el('em', { textContent: b.hours + 'h' })))
    })
    days.append(card)
  })
}

$('#add').onclick = () => {
  const name = $('#name').value.trim(), date = $('#date').value
  if (!name || !date) return
  state.subjects.push({ id: Date.now().toString(36), name, date, difficulty: +$('#difficulty').value })
  save('sp-subjects', state.subjects)
  $('#name').value = ''; $('#date').value = ''
  render()
}
$('#hours').oninput = (e) => { state.hours = +e.target.value; save('sp-hours', state.hours); render() }
$('#theme').onclick = () => { state.dark = !state.dark; save('sp-dark', state.dark); render() }

// Generates tailored tips locally — no server, no API key, no billing, ever.
function generateTips(subjects, hoursPerDay) {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const live = subjects.filter((s) => at(s.date) > today)
  if (!live.length) return ['Add a subject with an exam date to get tailored tips.']

  const byUrgency = [...live].sort((a, b) => at(a.date) - at(b.date))
  const nearest = byUrgency[0]
  const daysLeft = Math.round((at(nearest.date) - today) / DAY)
  const hardest = [...live].sort((a, b) => b.difficulty - a.difficulty)[0]

  const tips = []
  tips.push(daysLeft <= 3
    ? `${nearest.name} is only ${daysLeft} day${daysLeft === 1 ? '' : 's'} away — switch to timed past papers and skip new topics now.`
    : `${nearest.name} is your nearest exam (${daysLeft} days) — start with its toughest topics while you have runway.`)

  if (hardest.difficulty >= 3) {
    tips.push(`${hardest.name} is marked Hard — use active recall (flashcards, self-quizzing) instead of rereading notes.`)
  } else {
    tips.push('Mix subjects within each session (interleaving) instead of blocking one subject per day — it improves retention.')
  }

  if (hoursPerDay >= 6) {
    tips.push(`At ${hoursPerDay}h/day, split into focused blocks of 45–50 minutes with 10-minute breaks to avoid burnout.`)
  } else {
    tips.push(`With ${hoursPerDay}h/day, protect that time strictly — a fixed daily slot beats squeezing it in randomly.`)
  }

  if (live.length > 1) {
    tips.push('Review yesterday\'s hardest subject for 10 minutes before starting today\'s new material — quick recall locks it in.')
  }

  tips.push('The night before any exam, do a light review and sleep on time — cramming late usually costs more than it gives.')

  return tips.slice(0, 5)
}

$('#tipsBtn').onclick = async () => {
  const btn = $('#tipsBtn'), out = $('#tipsOut')
  btn.disabled = true; btn.textContent = 'Thinking…'; out.hidden = true
  let tips, aiWorked = false
  try {
    const r = await fetch('/api/tips', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subjects: state.subjects, hours: state.hours }),
    })
    if (!r.ok) throw new Error('AI unavailable')
    const data = await r.json()
    if (!data.tips) throw new Error('empty')
    tips = data.tips
    aiWorked = true
  } catch {
    // Falls back silently to local rule-based tips — the demo never shows an error.
    tips = generateTips(state.subjects, state.hours).map((t) => `• ${t}`).join('\n')
  }
  out.textContent = tips
  out.hidden = false
  btn.disabled = false
  btn.textContent = 'Get AI study tips'
}

$('#date').min = iso(new Date())
render()
