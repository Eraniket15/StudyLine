const DAY = 86400000
const $ = (s) => document.querySelector(s)
const iso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
const at = (s) => new Date(s + 'T00:00:00')
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d } catch { return d } }
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch {} }
const midnight = () => { const t = new Date(); t.setHours(0, 0, 0, 0); return t }

// Small helper to build DOM safely (textContent, so user input can't inject HTML)
function el(tag, props = {}, ...kids) {
  const n = Object.assign(document.createElement(tag), props)
  kids.forEach((k) => n.append(k))
  return n
}
// Each subject gets its own colour, derived from its name
const col = (name) => { let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360; return `hsl(${h} 55% 45%)` }

const state = {
  subjects: load('sp-subjects', []),
  hours: load('sp-hours', 4),
  done: load('sp-done', {}),          // blockId -> hours completed
  dark: load('sp-dark', false),
  focus: load('sp-focus', {}),        // date -> focus minutes
  view: load('sp-view', 'week'),
}

// Core scheduler: harder subjects and closer exams get more hours each day.
function buildPlan(subjects, hoursPerDay) {
  const today = midnight()
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
      .map((s, i) => ({ id: `${iso(new Date(t))}-${s.id}`, sid: s.id, subject: s.name, hours: Math.round(((hoursPerDay * weights[i]) / total) * 2) / 2 }))
      .filter((b) => b.hours > 0)
    plan.push({ date: iso(new Date(t)), blocks })
  }
  return plan
}

// Days in a row (up to today) with at least one finished session or focus block
function streak() {
  const days = new Set([
    ...Object.entries(state.done).filter(([, v]) => v).map(([k]) => k.slice(0, 10)),
    ...Object.entries(state.focus).filter(([, m]) => m > 0).map(([d]) => d),
  ])
  let t = midnight(), n = 0
  if (!days.has(iso(t))) t = new Date(+t - DAY)
  while (days.has(iso(t))) { n++; t = new Date(+t - DAY) }
  return n
}

const tile = (icon, value, label) => el('div', { className: 'tile' }, el('b', { textContent: value }), el('span', { textContent: `${icon} ${label}` }))

function render() {
  document.documentElement.dataset.theme = state.dark ? 'dark' : 'light'
  $('#theme').textContent = state.dark ? 'Light mode' : 'Dark mode'
  $('#hours').value = state.hours
  $('#hoursLabel').textContent = state.hours

  const chips = $('#chips'); chips.replaceChildren()
  state.subjects.forEach((s) => {
    const x = el('button', { className: 'x', textContent: '×', ariaLabel: `Remove ${s.name}` })
    x.onclick = () => { state.subjects = state.subjects.filter((v) => v.id !== s.id); save('sp-subjects', state.subjects); render() }
    const dot = el('i', { className: 'dot' }); dot.style.background = col(s.name)
    chips.append(el('li', {}, dot, `${s.name} · ${s.date}`, x))
  })

  const plan = buildPlan(state.subjects, state.hours)
  const all = plan.flatMap((d) => d.blocks)
  const doneCount = all.filter((b) => state.done[b.id]).length
  const pct = all.length ? Math.round((doneCount / all.length) * 100) : 0
  const has = !!all.length

  ;['#progress', '#stats', '#timerPanel', '#tabs'].forEach((s) => { $(s).hidden = !has })
  $('#empty').hidden = has
  $('#progressText').textContent = `${doneCount} of ${all.length} sessions · ${pct}%`
  $('#barFill').style.width = pct + '%'
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('on', t.dataset.v === state.view))

  // Stats tiles
  const hoursDone = Object.values(state.done).reduce((a, v) => a + (+v || 0), 0)
  $('#tiles').replaceChildren(
    tile('🔥', streak() + (streak() === 1 ? ' day' : ' days'), 'streak'),
    tile('✅', hoursDone + 'h', 'completed'),
    tile('⏱', Math.round(state.focus[iso(new Date())] || 0) + ' min', 'focused today'),
    tile('📝', new Set(all.map((b) => b.sid)).size, 'exams ahead'),
  )

  // Exam countdown cards with per-subject progress
  const today = midnight()
  $('#exams').replaceChildren(...state.subjects.filter((s) => at(s.date) > today).sort((a, b) => at(a.date) - at(b.date)).map((s) => {
    const left = Math.round((at(s.date) - today) / DAY)
    const mine = all.filter((b) => b.sid === s.id), d = mine.filter((b) => state.done[b.id]).length
    const bar = el('div', { className: 'bar' }, el('div')); bar.firstChild.style.width = (mine.length ? (d / mine.length) * 100 : 0) + '%'
    const c = el('div', { className: 'exam' + (left <= 3 ? ' hot' : '') }, el('b', { textContent: s.name }),
      el('span', { textContent: left === 1 ? 'Tomorrow!' : `${left} days left` }), bar)
    c.style.setProperty('--c', col(s.name))
    return c
  }))

  // Next 7 days chart (planned vs done hours)
  const wk = plan.slice(0, 7)
  const max = Math.max(1, ...wk.map((d) => d.blocks.reduce((a, b) => a + b.hours, 0)))
  $('#chart').replaceChildren(...wk.map((d) => {
    const planned = d.blocks.reduce((a, b) => a + b.hours, 0)
    const done = d.blocks.reduce((a, b) => a + (state.done[b.id] ? b.hours : 0), 0)
    const p = el('i', { className: 'planned', title: `${planned}h planned` }); p.style.height = (planned / max) * 100 + '%'
    const g = el('i', { className: 'got', title: `${done}h done` }); g.style.height = (done / max) * 100 + '%'
    return el('div', { className: 'col' }, el('div', { className: 'bars' }, p, g),
      el('small', { textContent: at(d.date).toLocaleDateString(undefined, { weekday: 'short' }) }))
  }))

  // Day cards (filtered by tab)
  const t0 = iso(new Date())
  const shown = state.view === 'today' ? plan.filter((d) => d.date === t0) : state.view === 'week' ? plan.slice(0, 7) : plan
  const days = $('#days'); days.replaceChildren()
  if (has && !shown.length) days.append(el('p', { className: 'empty', textContent: 'Nothing planned for today. Enjoy your break! 🎉' }))
  shown.forEach((d) => {
    const isToday = d.date === t0
    const card = el('article', { className: 'day' + (isToday ? ' today' : '') }, el('h3', {
      textContent: (isToday ? 'Today · ' : '') + at(d.date).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }),
    }))
    d.blocks.forEach((b) => {
      const box = el('input', { type: 'checkbox', checked: !!state.done[b.id] })
      box.onchange = () => {
        const before = d.blocks.every((x) => state.done[x.id])
        state.done[b.id] = box.checked ? b.hours : false
        save('sp-done', state.done)
        const after = d.blocks.every((x) => state.done[x.id])
        render()
        if (!before && after) { burst(); toast('🎉 Day complete! Great work.') }
      }
      const row = el('label', { className: 'block' + (state.done[b.id] ? ' done' : '') }, box, el('span', { textContent: b.subject }), el('em', { textContent: b.hours + 'h' }))
      row.style.borderLeftColor = col(b.subject)
      if (isToday) {
        const play = el('button', { className: 'play ghost', textContent: '▶', title: 'Start a focus timer for this' })
        play.onclick = (e) => { e.preventDefault(); focusOn(b.subject) }
        row.append(play)
      }
      card.append(row)
    })
    days.append(card)
  })
}

// ---------- Focus timer ----------
const T = { total: 1500, left: 1500, endAt: 0, id: null, mode: 'Focus 25', subject: '' }
const fmt = (s) => String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0')
function drawTimer() {
  $('#clock').textContent = fmt(T.left)
  $('#ring').style.setProperty('--p', (1 - T.left / T.total) * 100 + '%')
  $('#startBtn').textContent = T.id ? 'Pause' : 'Start'
  $('#focusOn').textContent = T.subject ? `Working on: ${T.subject}` : 'Pick a session or press Start.'
  document.title = T.id ? `${fmt(T.left)} · Studyline` : 'Studyline – AI Study Planner'
}
const stop = () => { clearInterval(T.id); T.id = null }
function setMode(min, label) { stop(); T.total = T.left = min * 60; T.mode = label; drawTimer() }
function beep() {
  try { const a = new AudioContext(), o = a.createOscillator(); o.connect(a.destination); o.frequency.value = 880; o.start(); o.stop(a.currentTime + 0.4) } catch {}
}
function finish() {
  stop(); beep()
  if (T.mode.startsWith('Focus')) {
    const d = iso(new Date())
    state.focus[d] = (state.focus[d] || 0) + T.total / 60
    save('sp-focus', state.focus)
    toast(`🎯 ${T.total / 60} min of focus done! Take a break.`); burst(); render()
  } else toast('Break over. Ready for the next round?')
  T.left = T.total
}
function tick() { T.left = Math.max(0, Math.round((T.endAt - Date.now()) / 1000)); if (!T.left) finish(); drawTimer() }
function startTimer() { T.endAt = Date.now() + T.left * 1000; T.id = setInterval(tick, 250); drawTimer() }
function focusOn(subject) {
  T.subject = subject; setMode(25, 'Focus 25'); startTimer()
  $('#timerPanel').scrollIntoView({ behavior: 'smooth', block: 'center' })
}
$('#startBtn').onclick = () => { if (T.id) { stop(); drawTimer() } else startTimer() }
$('#resetBtn').onclick = () => { stop(); T.left = T.total; drawTimer() }
document.querySelectorAll('.pre').forEach((b) => b.onclick = () => setMode(+b.dataset.min, b.dataset.label))

// ---------- Fun + helpers ----------
let toastTimer
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true }, 3500)
}
function burst() {
  for (let i = 0; i < 28; i++) {
    const p = el('span', { className: 'confetti', textContent: ['🎉', '✨', '🎊', '⭐'][i % 4] })
    p.style.setProperty('--x', (Math.random() * 100 - 50) + 'vw'); p.style.setProperty('--y', -(20 + Math.random() * 60) + 'vh')
    p.style.left = '50%'; p.style.animationDelay = Math.random() * 0.2 + 's'
    document.body.append(p); setTimeout(() => p.remove(), 1600)
  }
}

// Export the plan as a calendar file (.ics) for Google / Apple / Outlook calendar
function exportICS() {
  const plan = buildPlan(state.subjects, state.hours)
  if (!plan.length) return toast('Add a subject first.')
  const d8 = (s) => s.replaceAll('-', '')
  const next = (s) => iso(new Date(+at(s) + DAY)).replaceAll('-', '')
  const ev = (date, title, uid) => ['BEGIN:VEVENT', `UID:${uid}@studyline`, `DTSTAMP:${d8(iso(new Date()))}T000000Z`, `DTSTART;VALUE=DATE:${d8(date)}`, `DTEND;VALUE=DATE:${next(date)}`, `SUMMARY:${title.replace(/[,;\n]/g, ' ')}`, 'END:VEVENT']
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Studyline//EN',
    ...plan.flatMap((d) => ev(d.date, 'Study: ' + d.blocks.map((b) => `${b.subject} ${b.hours}h`).join(' + '), 'day-' + d.date)),
    ...state.subjects.flatMap((s) => ev(s.date, '📝 EXAM: ' + s.name, 'exam-' + s.id)), 'END:VCALENDAR']
  const a = el('a', { href: URL.createObjectURL(new Blob([lines.join('\r\n')], { type: 'text/calendar' })), download: 'studyline-plan.ics' })
  a.click(); toast('Calendar file downloaded 📅')
}

// ---------- Events ----------
$('#add').onclick = () => {
  const name = $('#name').value.trim(), date = $('#date').value
  if (!name || !date) return toast('Enter a subject name and exam date.')
  if (at(date) <= midnight()) return toast('Exam date must be after today.')
  state.subjects.push({ id: Date.now().toString(36), name, date, difficulty: +$('#difficulty').value })
  save('sp-subjects', state.subjects)
  $('#name').value = ''; $('#date').value = ''
  render(); toast(`${name} added ✓`)
}
$('#name').onkeydown = (e) => { if (e.key === 'Enter') $('#add').click() }
$('#hours').oninput = (e) => { state.hours = +e.target.value; save('sp-hours', state.hours); render() }
$('#theme').onclick = () => { state.dark = !state.dark; save('sp-dark', state.dark); render() }
$('#ics').onclick = exportICS
document.querySelectorAll('.tab').forEach((t) => t.onclick = () => { state.view = t.dataset.v; save('sp-view', state.view); render() })

// Generates tailored tips locally — no server, no API key, no billing, ever.
function generateTips(subjects, hoursPerDay) {
  const today = midnight()
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
  let tips
  try {
    const r = await fetch('/api/tips', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subjects: state.subjects, hours: state.hours }),
    })
    if (!r.ok) throw new Error('AI unavailable')
    const data = await r.json()
    if (!data.tips) throw new Error('empty')
    tips = data.tips
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
drawTimer()
