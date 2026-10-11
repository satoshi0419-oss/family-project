import { store, isDemo } from './store.js';
import { CURRY, PEOPLE, TOOLS, DAY, END, GOAL_MIN, pname, schedule, windowOf, computeRatios } from './plan.js';

// ============ 状態 ============
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
const S = {
  booting: true, err: '', busy: false,
  family: null, projects: [], runs: [],
  view: 'welcome', pid: LS.get('fc-pid', null), tab: LS.get('fc-tab', 'plan'), planView: 'h48',
  me: LS.get('fc-me', 'all'), kday: null, justCreated: null, confirm: null,
};
const app = document.getElementById('app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const W = '日月火水木金土';

let toastTimer;
function toast(msg) {
  document.querySelector('.toast')?.remove();
  const el = document.createElement('div'); el.className = 'toast'; el.textContent = msg; el.setAttribute('role', 'status');
  document.body.appendChild(el); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.remove(), 2600);
}

// ============ 時刻の換算 ============
// テンプレートの「分」(土0:00=0)を、実際の日時に置き換える
function clockOf(project) {
  const goal = new Date(project.goal_at);
  const base = new Date(goal.getFullYear(), goal.getMonth(), goal.getDate() - 1);
  const shift = Math.round((goal - base) / 60000) - GOAL_MIN;
  const at = m => new Date(base.getTime() + (m + shift) * 60000);
  return {
    at,
    hm: m => { const d = at(m); return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`; },
    day: m => { const d = at(m); return `${d.getMonth() + 1}/${d.getDate()}(${W[d.getDay()]})`; },
    full: m => { const d = at(m); return `${d.getMonth() + 1}/${d.getDate()}(${W[d.getDay()]}) ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`; },
    nowMin: () => (Date.now() - base.getTime()) / 60000 - shift,
  };
}

const project = () => S.projects.find(p => p.id === S.pid);
const runsOf = pid => Object.fromEntries(S.runs.filter(r => r.project_id === pid).map(r => [r.task_id, r]));
const history = pid => S.runs.filter(r => r.project_id !== pid && r.started_at && r.ended_at);
function planFor(p) {
  const st = p.settings || {};
  const caps = { peeler: 1, board: 1, stove: 2, ...(st.caps || {}) };
  const ratios = computeRatios(history(p.id));
  const T = schedule(caps, st.correct ? ratios : null);
  return { T, caps, ratios, correct: !!st.correct, base: st.correct ? schedule(caps, null) : T };
}

// ============ データ読み込み ============
async function refresh() {
  if (!S.family) return;
  const [projects, runs] = await Promise.all([store.projects(S.family.id), store.runs(S.family.id)]);
  S.projects = projects; S.runs = runs;
  if (S.pid && !project()) { S.pid = null; S.view = 'home'; }
  render();
}
let rT;
const refreshSoon = () => { clearTimeout(rT); rT = setTimeout(() => refresh().catch(() => {}), 250); };

async function boot() {
  try {
    await store.init();
    S.family = await store.myFamily();
    if (S.family) {
      store.subscribe(S.family.id, refreshSoon);
      const [projects, runs] = await Promise.all([store.projects(S.family.id), store.runs(S.family.id)]);
      S.projects = projects; S.runs = runs;
      S.view = S.pid && project() ? 'project' : 'home';
    }
  } catch (e) { S.err = e.message; }
  S.booting = false; render();
}

// ============ 画面:入口 ============
function viewWelcome() {
  if (S.justCreated) {
    return `<div class="page stack">
      <div class="hero">家族ができました</div>
      <div class="card stack">
        <div class="sub">家族ID(ほかの端末で入るときに使います)</div>
        <div class="code">${esc(S.justCreated)}</div>
        <p class="sub" style="margin:0">タブレットや家族のスマホでこのアプリを開き、「家族に入る」から<b>家族ID</b>と<b>合言葉</b>を入れてください。合言葉は家族の中だけで伝えてください。</p>
      </div>
      <button class="btn go wide" data-act="to-home">はじめる</button></div>`;
  }
  return `<div class="page stack">
    ${isDemo ? '<div class="demo">お試しモード:データはこの端末の中だけに保存されます</div>' : ''}
    <div class="hero">家族で、<em>ごはんを逆算</em>してつくる</div>
    <p class="sub" style="margin:0">「いただきます」の時刻から逆算して、だれが・いつ・何をするかを決めます。台所ではスマホやタブレットのボタンを押すだけで、かかった時間が記録されます。</p>
    ${S.err ? `<div class="err">${esc(S.err)}</div>` : ''}
    <form class="card stack" data-form="create">
      <h2 style="font-size:18px">家族をはじめる(最初の1台)</h2>
      <label class="field" for="f-name">家族の名前<input id="f-name" name="name" required maxlength="40" placeholder="例:佐藤家"></label>
      <label class="field" for="f-pass">合言葉(4文字以上)<input id="f-pass" name="pass" required minlength="4" autocomplete="new-password" placeholder="家族だけが知っている言葉"></label>
      <button class="btn go wide" ${S.busy ? 'disabled' : ''}>家族を作る</button>
    </form>
    <form class="card stack" data-form="join">
      <h2 style="font-size:18px">家族に入る(2台目から)</h2>
      <label class="field" for="j-code">家族ID(6文字)<input id="j-code" name="code" required maxlength="6" autocapitalize="characters" autocomplete="off" placeholder="例:K7M2QX" style="text-transform:uppercase;letter-spacing:.1em"></label>
      <label class="field" for="j-pass">合言葉<input id="j-pass" name="pass" required autocomplete="off"></label>
      <button class="btn wide" ${S.busy ? 'disabled' : ''}>家族に入る</button>
    </form></div>`;
}

// ============ 画面:料理の一覧 ============
function nextSunday18() {
  const d = new Date(); d.setHours(18, 0, 0, 0);
  const add = (7 - d.getDay()) % 7 || (new Date().getHours() >= 18 || d.getDay() !== 0 ? 7 : 0);
  d.setDate(d.getDate() + (d.getDay() === 0 && new Date().getHours() < 12 ? 0 : add));
  return d;
}
const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function viewHome() {
  const n = S.projects.length + 1;
  const def = nextSunday18();
  return `<div class="page stack">
    ${isDemo ? '<div class="demo">お試しモード:データはこの端末の中だけに保存されます</div>' : ''}
    <div class="between"><div><div class="sub">${esc(S.family.name)}</div><div class="hero" style="font-size:28px">料理プロジェクト</div></div>
    <div style="text-align:right"><div class="sub">家族ID</div><div style="font-family:var(--f-display);font-weight:800;letter-spacing:.08em">${esc(S.family.family_code)}</div></div></div>
    <div class="plist">${S.projects.map(p => {
      const c = clockOf(p); const r = S.runs.filter(x => x.project_id === p.id && x.ended_at).length;
      return `<button class="pitem" data-open="${p.id}"><span><b>${esc(p.title)}</b><br><span class="sub">いただきます ${c.full(GOAL_MIN)}</span></span><span class="pill ${r ? 'p-ok' : 'p-wait'}">記録 ${r}件</span></button>`;
    }).join('') || '<div class="card sub">まだ料理プロジェクトがありません。下から最初の1つを作りましょう。</div>'}</div>
    <form class="card stack" data-form="project">
      <h2 style="font-size:18px">新しい料理</h2>
      <label class="field" for="p-title">名前<input id="p-title" name="title" required maxlength="60" value="カレー 第${n}回"></label>
      <div class="row">
        <label class="field" for="p-date" style="flex:1 1 150px">「いただきます」の日<input id="p-date" name="date" type="date" required value="${ymd(def)}"></label>
        <label class="field" for="p-time" style="flex:1 1 110px">時刻<input id="p-time" name="time" type="time" required value="18:00" step="300"></label>
      </div>
      <p class="sub" style="margin:0">献立は今はカレーのみ。前の日から2日がかりで作る型です。</p>
      <button class="btn go wide" ${S.busy ? 'disabled' : ''}>作る</button>
    </form></div>`;
}

// ============ 縦の時間軸 ============
function vtimeline(p, T, from, to, ppm, opts) {
  const c = clockOf(p), runs = runsOf(p.id);
  const H = Math.round((to - from) * ppm);
  const y = m => (m - from) * ppm;
  const inWin = t => t.e > from && t.s < to;
  const all = Object.values(T);
  // 目盛り
  let gut = '', grid = '';
  if (opts.minute) {
    for (let m = Math.ceil(from / 5) * 5; m <= to; m += 5) {
      const lab = m % 10 === 0;
      gut += `<div class="vt-tick${m % 30 === 0 ? ' major' : ''}" style="top:${y(m)}px">${lab ? `<span>${c.hm(m)}</span>` : ''}</div>`;
      if (lab) grid += `<div class="vt-grid" style="top:${y(m)}px"></div>`;
    }
  } else {
    for (let m = from; m <= to; m += 60) {
      const h = Math.round(((c.at(m).getHours() * 60 + c.at(m).getMinutes()) / 60));
      if (h % 3 !== 0) continue;
      gut += `<div class="vt-tick${h === 0 ? ' major' : ''}" style="top:${y(m)}px"><span>${h === 0 ? c.day(m).replace(/\(.\)/, '') : h + '時'}</span></div>`;
      grid += `<div class="vt-grid" style="top:${y(m)}px"></div>`;
    }
  }
  const nights = opts.minute ? '' : [[0, 7 * 60], [22 * 60, DAY + 7 * 60], [DAY + 22 * 60, END]].map(([a, b]) => `<div class="vt-night" style="top:${y(a)}px;height:${(b - a) * ppm}px"></div>`).join('');
  const blk = (t, cls, color, label) => {
    const top = y(Math.max(t.s, from)), h = Math.max(3, (Math.min(t.e, to) - Math.max(t.s, from)) * ppm - 2);
    const done = runs[t.id]?.ended_at ? ' done' : '';
    return `<div class="vb ${cls}${done}" style="top:${top}px;height:${h}px;background:${color}" title="${esc(t.name)} ${c.hm(t.s)}〜${c.hm(t.e)}">${h >= 14 ? esc(label) : ''}</div>`;
  };
  const cols = PEOPLE.map((pp, pi) => {
    const mine = all.filter(t => inWin(t) && !t.wait && t.who.includes(pp.id));
    const watching = all.filter(t => inWin(t) && t.watch === pp.id);
    let gaps = '';
    if (opts.minute) {
      const busy = [...mine, ...watching].map(t => [Math.max(t.s, opts.workFrom), Math.min(t.e, opts.workTo)]).filter(a => a[1] > a[0]).sort((a, b) => a[0] - b[0]);
      let cur = opts.workFrom;
      const gap = (a, b) => (b - a >= 5 ? `<div class="vgap" style="top:${y(a) + 2}px;height:${(b - a) * ppm - 4}px">空き<br>${b - a}分</div>` : '');
      busy.forEach(([a, b]) => { gaps += gap(cur, a); cur = Math.max(cur, b); });
      gaps += gap(cur, opts.workTo);
    }
    return `<div class="vt-col" style="grid-column:${pi + 2};grid-row:2">${nights}${grid}${gaps}${mine.map(t => blk(t, '', `var(--${pp.id})`, t.name)).join('')}${watching.map(t => blk(t, 'watch', 'transparent', '見守り')).join('')}</div>`;
  }).join('');
  const toolIds = opts.minute ? Object.keys(TOOLS).filter(r => all.some(t => inWin(t) && t.tools.includes(r))) : [];
  const toolCols = toolIds.map((r, ti) => {
    let extra = '';
    if (r === 'pot') { const a = T.fridge.e, b = T.reheat.s; if (b > from && a < to) extra = blk({ id: '_rest', name: '寝かせる', s: a, e: b }, 'rest', 'transparent', '寝かせ中'); }
    return `<div class="vt-col tool" style="grid-column:${ti + 6};grid-row:2">${grid}${extra}${all.filter(t => inWin(t) && t.tools.includes(r)).map(t => blk(t, t.wait ? 'wait' : '', t.wait ? 'transparent' : `var(--${t.who[0]})`, t.name)).join('')}</div>`;
  }).join('');
  // 重ねるもの:今の時刻、いただきます、拡大の枠
  const nowM = c.nowMin();
  let over = '';
  if (nowM > from && nowM < to) over += `<div class="vline" style="top:${y(nowM)}px"><span>いま</span></div>`;
  if (T.eat.s >= from && T.eat.s <= to) over += `<div class="vline goal" style="top:${y(T.eat.s)}px"><span>いただきます</span></div>`;
  (opts.zooms || []).forEach(z => { over += `<button class="zoom" data-plan="${z.view}" style="top:${y(z.a) - 3}px;height:${(z.b - z.a) * ppm + 6}px" aria-label="${z.label}を分刻みで見る"><span>${z.label} 分刻み</span></button>`; });
  if (!opts.minute && T.reheat.s > T.fridge.e) {
    const a = T.fridge.e, b = T.reheat.s;
    over += `<div style="position:absolute;left:50%;transform:translateX(-50%);top:${y((a + b) / 2) - 12}px;background:var(--accent-soft);color:var(--accent-ink);border:1px solid var(--accent);border-radius:999px;font-size:12px;padding:2px 10px;white-space:nowrap;pointer-events:none">カレーを一晩寝かせる</div>`;
  }
  const heads = PEOPLE.map(pp => `<div class="vt-h"><span class="dot" style="background:var(--${pp.id})"></span>${pp.name}</div>`).join('') + toolIds.map(r => `<div class="vt-h tool">${TOOLS[r]}${p.settings?.caps?.[r] ? '×' + p.settings.caps[r] : ''}</div>`).join('');
  return `<div class="vt${toolIds.length ? ' with-tools' : ''}" style="--n:${toolIds.length}">
    <div class="vt-h"></div>${heads}
    <div class="vt-gut" style="height:${H}px;grid-column:1;grid-row:2">${gut}</div>${cols}${toolCols}
    <div class="vt-over" style="grid-column:1/-1;height:${H}px">${over}</div></div>`;
}

const legend = `<div class="legend"><span><i style="background:repeating-linear-gradient(135deg,var(--hatch) 0 4px,transparent 4px 8px);border:1.5px dashed var(--muted)"></i>見守り</span><span><i style="background:var(--sunk);border:1px solid var(--line)"></i>待ち</span><span><i style="background:var(--ok-soft);border:1.5px dashed var(--ok)"></i>手が空いている</span><span><i style="background:var(--bad);height:2px"></i>いま</span></div>`;

function statsHtml(p, P) {
  const c = clockOf(p);
  const w1 = windowOf(P.T, 1), w2 = windowOf(P.T, 2), b1 = windowOf(P.base, 1), b2 = windowOf(P.base, 2);
  const diff = (a, b) => (P.correct && a !== b ? `<div class="d up">補正で${Math.abs(a - b)}分${a < b ? '早く' : '遅く'}</div>` : `<div class="d">${P.correct ? '補正しても同じ' : 'ここから逆算した時刻'}</div>`);
  const kid = Object.values(P.T).filter(t => !t.wait && t.fixed == null && t.who.some(w => w[0] === 'k')).reduce((s, t) => s + t.dur, 0);
  return `<div class="stats">
    <div class="stat"><div class="k">1日目 台所に入る</div><div class="v">${c.hm(w1.a)}</div>${diff(w1.a, b1.a)}</div>
    <div class="stat"><div class="k">2日目 台所に入る</div><div class="v">${c.hm(w2.a)}</div>${diff(w2.a, b2.a)}</div>
    <div class="stat"><div class="k">子どもが手を動かす</div><div class="v">${kid}<span class="sub"> 分</span></div><div class="d">2人の合計</div></div>
    <div class="stat"><div class="k">いただきます</div><div class="v">${c.hm(P.T.eat.s)}</div><div class="d">${c.day(P.T.eat.s)}</div></div></div>`;
}

function viewPlan(p, P) {
  const c = clockOf(p);
  const seg = `<div class="seg" role="group" aria-label="表示する時間帯">${[['h48', '48時間'], ['d1', '1日目'], ['d2', '2日目']].map(([k, l]) => `<button data-plan="${k}" aria-pressed="${S.planView === k}">${l}</button>`).join('')}</div>`;
  if (S.planView === 'h48') {
    const w1 = windowOf(P.T, 1), w2 = windowOf(P.T, 2);
    return `${statsHtml(p, P)}<div class="between">${seg}</div>
      <p class="sub" style="margin:0">上から下へ時間が流れます(${c.day(0)} 0時〜${c.day(DAY)} 24時)。黄色の枠を押すと、台所にいる時間を1分単位で見られます。</p>
      ${vtimeline(p, P.T, 0, END, 0.4, { minute: false, zooms: [{ a: w1.a, b: w1.b, view: 'd1', label: '1日目' }, { a: w2.a, b: w2.b, view: 'd2', label: '2日目' }] })}`;
  }
  const day = S.planView === 'd1' ? 1 : 2;
  const w = windowOf(P.T, day);
  const from = Math.floor((w.a - 5) / 5) * 5, to = Math.ceil((w.b + 5) / 5) * 5;
  const steps = w.list.slice().sort((a, b) => a.s - b.s || a.e - b.e);
  return `${statsHtml(p, P)}<div class="between">${seg}</div>
    <p class="sub" style="margin:0">${day === 1 ? 'カレーを作って寝かせる日。ピーラーやまな板が足りないと、手が空いていても待たされます(設定で数を変えられます)。' : '「いただきます」から逆算して、ご飯・温め直し・サラダ・食卓の準備を同時に進めます。'}</p>
    ${legend}
    ${vtimeline(p, P.T, from, to, 6, { minute: true, workFrom: w.a, workTo: w.b })}
    <div class="card"><h3 style="font-size:15px;margin-bottom:6px">手順(時刻順)</h3>
    <table class="rec"><tbody>${steps.map(t => `<tr><td style="white-space:nowrap;font-weight:700;vertical-align:top">${c.hm(t.s)}</td><td>${esc(t.name)} <span class="sub">${t.dur}分</span><br><span class="sub">${t.wait ? '待ち(人は空く)' : t.who.map(pname).join('・')}${t.watch ? ' / 見守り:' + pname(t.watch) : ''}</span></td></tr>`).join('')}</tbody></table></div>`;
}

// ============ 台所(実行モード) ============
let wakeLock = null;
async function keepAwake(on) {
  try {
    if (on && 'wakeLock' in navigator && !wakeLock && document.visibilityState === 'visible') {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } else if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
  } catch { wakeLock = null; }
}
document.addEventListener('visibilitychange', () => { if (S.view === 'project' && S.tab === 'kitchen') keepAwake(true); });

let audio = null;
const unlockAudio = () => { try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); if (audio.state === 'suspended') audio.resume(); } catch {} };
function ring() {
  try {
    if (audio) {
      [0, 0.35, 0.7].forEach(t => {
        const o = audio.createOscillator(), g = audio.createGain();
        o.frequency.value = 880; o.connect(g); g.connect(audio.destination);
        g.gain.setValueAtTime(0.0001, audio.currentTime + t);
        g.gain.exponentialRampToValueAtTime(0.3, audio.currentTime + t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + t + 0.28);
        o.start(audio.currentTime + t); o.stop(audio.currentTime + t + 0.3);
      });
    }
    navigator.vibrate?.([300, 150, 300, 150, 300]);
  } catch {}
}
const rung = new Set(LS.get('fc-rung', []));

const fmtMS = sec => { sec = Math.max(0, Math.floor(sec)); return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`; };

function kitchenDay(P, runs) {
  if (S.kday) return S.kday;
  const d1 = windowOf(P.T, 1).list.filter(t => !t.wait);
  return d1.every(t => runs[t.id]?.ended_at) ? 2 : 1;
}

function viewKitchen(p, P) {
  const c = clockOf(p), runs = runsOf(p.id);
  const day = kitchenDay(P, runs);
  const list = windowOf(P.T, day).list.slice().sort((a, b) => a.s - b.s || a.e - b.e);
  const started = t => !!runs[t.id]?.started_at, ended = t => !!runs[t.id]?.ended_at;
  const depsDone = t => t.deps.every(d => !list.some(x => x.id === d) || ended(P.T[d]));
  // タイマー(待ちの作業)
  const timers = list.filter(t => t.wait && !ended(t) && (started(t) || depsDone(t)));
  const timersHtml = timers.map(t => {
    const r = runs[t.id];
    if (r?.started_at) {
      const endMs = new Date(r.started_at).getTime() + t.dur * 60000;
      return `<div class="timer" data-remain="${endMs}" data-tid="${p.id}:${t.id}"><div><b>${esc(t.name)}</b><div class="sub" data-msg>${t.dur}分のタイマー</div></div><div class="t" data-clock>--:--</div><button class="btn go" data-end="${t.id}">終わった</button></div>`;
    }
    return `<div class="timer"><div><b>${esc(t.name)}</b><div class="sub">${t.dur}分 ・ 待ちの間、人は手が空きます</div></div><button class="btn" data-start="${t.id}">タイマー開始</button></div>`;
  }).join('');
  const card = (pp, solo) => {
    const mine = list.filter(t => !t.wait && (t.who.includes(pp.id) || t.watch === pp.id));
    const cur = mine.find(t => started(t) && !ended(t));
    const nxt = mine.filter(t => !started(t));
    const role = t => (t.watch === pp.id ? `見守り(${t.who.map(pname).join('・')}が担当)` : t.who.length > 1 ? `${t.who.map(pname).join('・')}で` : 'ひとりで');
    let body;
    if (cur) {
      const st = new Date(runs[cur.id].started_at).getTime();
      body = `<div class="meta">いまやっていること</div><div class="now">${esc(cur.name)}</div>
        <div class="between"><div class="meta">${role(cur)} ・ 予定${cur.dur}分</div><div class="clock" data-elapsed="${st}" data-plan="${cur.dur}">0:00</div></div>
        <button class="bigbtn end" data-end="${cur.id}">終わった!</button>`;
    } else if (nxt.length) {
      const t = nxt[0];
      const wait = !depsDone(t) ? `<div class="waitnote">先に「${t.deps.filter(d => !ended(P.T[d])).map(d => esc(P.T[d].name)).join('」「')}」が終わるのを待ちます</div>` : '';
      body = `<div class="meta">次は ${c.hm(t.s)} ごろ</div><div class="now">${esc(t.name)}</div><div class="meta">${role(t)} ・ ${t.dur}分</div>${wait}
        <button class="bigbtn start" data-start="${t.id}">始める</button>`;
    } else {
      body = `<div class="now">${day === 1 ? '今日の作業はおしまい' : 'あとは、いただきます!'}</div><div class="meta">ほかの人を手伝おう</div>`;
    }
    const later = solo ? nxt.slice(cur ? 0 : 1, 6) : [];
    const lastDone = mine.filter(ended).pop();
    return `<div class="pcard${cur ? ' active' : ''}"><div class="who"><span class="dot" style="background:var(--${pp.id})"></span>${pp.name}</div>${body}
      ${lastDone ? `<button class="undo" data-undo="${lastDone.id}">「${esc(lastDone.name)}」の記録を取り消す</button>` : ''}
      ${later.length ? `<ul class="next">${later.map(t => `<li><span class="tm">${c.hm(t.s)}</span><span>${esc(t.name)} <span class="sub">${t.dur}分</span></span></li>`).join('')}</ul>` : ''}</div>`;
  };
  const who = `<div class="who-pick" role="group" aria-label="この端末を使う人">${[['all', 'みんな(タブレット)']].concat(PEOPLE.map(pp => [pp.id, pp.name])).map(([k, l]) => `<button data-me="${k}" aria-pressed="${S.me === k}">${k !== 'all' ? `<span class="dot" style="background:var(--${k})"></span>` : ''}${l}</button>`).join('')}</div>`;
  const solo = S.me !== 'all';
  const doneN = list.filter(ended).length;
  return `<div class="between"><div class="seg" role="group" aria-label="日">${[1, 2].map(d => `<button data-kday="${d}" aria-pressed="${day === d}">${d}日目</button>`).join('')}</div><span class="sub">${doneN}/${list.length} 完了${'wakeLock' in navigator ? ' ・ 画面は消えません' : ''}</span></div>
    ${who}
    ${timersHtml ? `<div class="timers">${timersHtml}</div>` : ''}
    <div class="pcards${solo ? ' solo' : ''}">${solo ? card(PEOPLE.find(pp => pp.id === S.me), true) : PEOPLE.map(pp => card(pp, false)).join('')}</div>`;
}

// 1秒ごとに時計だけ書き換える(画面全体は描き直さない)
setInterval(() => {
  const now = Date.now();
  document.querySelectorAll('[data-elapsed]').forEach(el => {
    const sec = (now - +el.dataset.elapsed) / 1000; el.textContent = fmtMS(sec);
    el.classList.toggle('over', sec / 60 > +el.dataset.plan);
  });
  document.querySelectorAll('[data-remain]').forEach(el => {
    const rem = (+el.dataset.remain - now) / 1000;
    const clk = el.querySelector('[data-clock]'); if (clk) clk.textContent = rem >= 0 ? fmtMS(rem) : '+' + fmtMS(-rem);
    if (rem <= 0) {
      el.classList.add('ring');
      const m = el.querySelector('[data-msg]'); if (m) m.textContent = '時間です!確認して「終わった」を押してください';
      if (!rung.has(el.dataset.tid)) { rung.add(el.dataset.tid); LS.set('fc-rung', [...rung].slice(-50)); ring(); }
    }
  });
}, 1000);

// ============ 振り返り ============
function viewReview(p, P) {
  const all = S.runs.filter(r => r.started_at && r.ended_at);
  const R = computeRatios(all);
  const runs = runsOf(p.id);
  const rows = CURRY.filter(t => !t.wait && t.who.length && runs[t.id]?.ended_at);
  const projN = new Set(all.map(r => r.project_id)).size;
  return `<div class="card stack" style="gap:8px"><h2 style="font-family:var(--f-display);font-size:19px">予定の何倍かかったか</h2>
    <p class="sub" style="margin:0">${R.useSample ? 'まだ記録がないので、見本の数字を表示しています。台所で「始める」「終わった」を押すと、家族の本当の数字に置き換わります。' : `これまでの料理 ${projN}回分の記録から計算しています。`}</p></div>
    <div class="ratios">${PEOPLE.map(pp => { const r = R[pp.id]; return `<div class="ratio"><div class="row" style="gap:6px"><span class="dot" style="background:var(--${pp.id})"></span><b>${pp.name}</b></div>
      <div class="x" style="color:var(--${pp.id})">×${r.ratio.toFixed(2)}</div>
      <div class="rbar"><i style="width:${Math.min(100, r.ratio / 2 * 100)}%;background:var(--${pp.id})"></i><b style="left:50%"></b></div>
      <div class="sub" style="margin-top:4px">予定${r.plan}分→実際${r.act}分</div></div>`; }).join('')}</div>
    <label class="switch card" for="sw-correct"><input type="checkbox" id="sw-correct" data-correct ${P.correct ? 'checked' : ''}><span>次の見積りを、前回までの記録で補正する<br><span class="sub">この料理以外の記録を使います${history(p.id).length ? '' : '(まだ無いので見本を使います)'}</span></span></label>
    <div class="card"><h3 style="font-size:15px;margin-bottom:6px">この料理の記録</h3>
    ${rows.length ? `<table class="rec"><thead><tr><th>作業</th><th>予定</th><th>実際</th></tr></thead><tbody>${rows.map(t => { const a = Math.max(1, Math.round((new Date(runs[t.id].ended_at) - new Date(runs[t.id].started_at)) / 60000)); return `<tr><td>${esc(t.name)}<br><span class="sub">${t.who.map(pname).join('・')}</span></td><td>${t.d}分</td><td><b>${a}分</b> ${a > t.d ? `<span class="pill p-bad">+${a - t.d}</span>` : a < t.d ? `<span class="pill p-ok">${a - t.d}</span>` : ''}</td></tr>`; }).join('')}</tbody></table>` : '<p class="sub" style="margin:0">まだ記録がありません。</p>'}</div>`;
}

// ============ 設定 ============
function viewSettings(p, P) {
  const capRow = (k, label, opts) => `<div class="between"><span>${label}</span><div class="seg" role="group" aria-label="${label}の数">${opts.map(([v, l]) => `<button data-cap="${k}" data-v="${v}" aria-pressed="${P.caps[k] === v}">${l}</button>`).join('')}</div></div>`;
  return `<div class="card stack"><h2 style="font-size:18px">台所の道具</h2>
      ${capRow('peeler', 'ピーラー', [[1, '1本'], [2, '2本']])}
      ${capRow('board', 'まな板', [[1, '1枚'], [2, '2枚']])}
      ${capRow('stove', 'コンロ', [[1, '1口'], [2, '2口'], [3, '3口']])}
      <p class="sub" style="margin:0">道具の数を変えると、逆算した開始時刻が計算し直されます。家族の全員の画面に反映されます。</p></div>
    <div class="card stack"><h2 style="font-size:18px">家族</h2>
      <div class="between"><span>家族ID</span><b style="letter-spacing:.08em">${esc(S.family.family_code)}</b></div>
      <p class="sub" style="margin:0">ほかの端末では「家族に入る」から、家族IDと合言葉を入れます。</p>
      <button class="btn" data-act="leave">${S.confirm === 'leave' ? 'もう一度押すと、この端末が家族から抜けます' : 'この端末を家族から外す'}</button></div>
    <div class="card stack"><h2 style="font-size:18px">この料理</h2>
      <button class="btn" data-act="del-project" style="color:var(--bad)">${S.confirm === 'del' ? 'もう一度押すと、記録ごと削除します' : 'この料理と記録を削除する'}</button></div>`;
}

// ============ 画面の組み立て ============
const ICON = {
  plan: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 3v18M6 7h9M6 12h12M6 17h7"/></svg>',
  kitchen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 11h16v3a6 6 0 0 1-6 6h-4a6 6 0 0 1-6-6z"/><path d="M9 4c0 2 2 2 2 4M14 4c0 2 2 2 2 4"/></svg>',
  review: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
  settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/></svg>',
};
function viewProject() {
  const p = project(); const P = planFor(p); const c = clockOf(p);
  const body = { plan: viewPlan, kitchen: viewKitchen, review: viewReview, settings: viewSettings }[S.tab](p, P);
  return `<div class="page stack">
    ${isDemo ? '<div class="demo">お試しモード:データはこの端末の中だけに保存されます</div>' : ''}
    <div class="bar"><button class="back" data-act="to-home" aria-label="料理の一覧へ戻る">‹</button><div style="min-width:0"><h1>${esc(p.title)}</h1><div class="goal">いただきます ${c.full(P.T.eat.s)}</div></div></div>
    ${body}</div>
    <nav class="tabbar" aria-label="画面の切り替え">${[['plan', '予定'], ['kitchen', '台所'], ['review', '振り返り'], ['settings', '設定']].map(([k, l]) => `<button data-tab="${k}" ${S.tab === k ? 'aria-current="page"' : ''}>${ICON[k]}${l}</button>`).join('')}</nav>`;
}

function render() {
  if (S.booting) { app.innerHTML = '<div class="page"><p class="sub">読み込み中…</p></div>'; return; }
  if (!S.family) S.view = 'welcome';
  const html = S.view === 'welcome' ? viewWelcome() : S.view === 'home' ? viewHome() : viewProject();
  app.innerHTML = html;
  keepAwake(S.view === 'project' && S.tab === 'kitchen');
}

// ============ 操作 ============
async function guard(fn) {
  if (S.busy) return;
  S.busy = true; S.err = '';
  try { await fn(); } catch (e) { S.err = e.message; toast(e.message); }
  S.busy = false; render();
}

app.addEventListener('submit', e => {
  e.preventDefault();
  const f = e.target, fd = new FormData(f), kind = f.dataset.form;
  guard(async () => {
    if (kind === 'create') {
      const r = await store.createFamily(fd.get('name').trim(), fd.get('pass'));
      S.family = await store.myFamily(); store.subscribe(S.family.id, refreshSoon);
      S.justCreated = r.family_code; S.view = 'welcome';
    } else if (kind === 'join') {
      await store.joinFamily(fd.get('code'), fd.get('pass'));
      S.family = await store.myFamily(); store.subscribe(S.family.id, refreshSoon);
      S.view = 'home'; await refresh(); toast('家族に入りました');
    } else if (kind === 'project') {
      const goal = new Date(`${fd.get('date')}T${fd.get('time')}:00`);
      const p = await store.createProject(S.family.id, fd.get('title').trim(), goal.toISOString());
      await refresh(); S.pid = p.id; LS.set('fc-pid', p.id); S.view = 'project'; S.tab = 'plan'; S.planView = 'h48';
    }
  });
});

app.addEventListener('click', e => {
  unlockAudio();
  const el = e.target.closest('button,[data-open]');
  if (!el) return;
  const d = el.dataset, p = project();
  if (d.act !== 'leave' && d.act !== 'del-project') S.confirm = null;
  if (d.act === 'to-home') { S.justCreated = null; S.view = 'home'; S.pid = null; LS.set('fc-pid', null); render(); window.scrollTo(0, 0); return; }
  if (d.open) { S.pid = d.open; LS.set('fc-pid', d.open); S.view = 'project'; S.planView = 'h48'; S.kday = null; render(); window.scrollTo(0, 0); return; }
  if (d.tab) { S.tab = d.tab; LS.set('fc-tab', d.tab); S.kday = null; render(); window.scrollTo(0, 0); return; }
  if (d.plan) { S.planView = d.plan; render(); window.scrollTo(0, 0); return; }
  if (d.me) { S.me = d.me; LS.set('fc-me', d.me); render(); return; }
  if (d.kday) { S.kday = +d.kday; render(); return; }
  const now = new Date().toISOString();
  const setRun = (tid, patch) => {
    const i = S.runs.findIndex(r => r.project_id === p.id && r.task_id === tid);
    const run = { project_id: p.id, family_id: S.family.id, task_id: tid, ...(i >= 0 ? S.runs[i] : {}), ...patch };
    if (i >= 0) S.runs[i] = run; else S.runs.push(run);
    render();
    return store.saveRun({ project_id: run.project_id, family_id: run.family_id, task_id: run.task_id, started_at: run.started_at ?? null, ended_at: run.ended_at ?? null }).catch(err => { toast(err.message); refreshSoon(); });
  };
  if (d.start) { setRun(d.start, { started_at: now, ended_at: null }); navigator.vibrate?.(30); return; }
  if (d.end) { setRun(d.end, { ended_at: now }); navigator.vibrate?.([30, 60, 30]); toast('記録しました'); return; }
  if (d.undo) { S.runs = S.runs.filter(r => !(r.project_id === p.id && r.task_id === d.undo)); render(); store.deleteRun(p.id, d.undo).catch(err => toast(err.message)); return; }
  if (d.cap) {
    const st = { caps: { peeler: 1, board: 1, stove: 2 }, correct: false, ...(p.settings || {}) };
    st.caps = { ...st.caps, [d.cap]: +d.v }; p.settings = st; render();
    store.saveSettings(p.id, st).catch(err => toast(err.message)); return;
  }
  if (d.act === 'leave') {
    if (S.confirm !== 'leave') { S.confirm = 'leave'; render(); return; }
    guard(async () => { await store.leaveFamily(S.family.id); S.family = null; S.projects = []; S.runs = []; S.pid = null; S.confirm = null; S.view = 'welcome'; });
    return;
  }
  if (d.act === 'del-project') {
    if (S.confirm !== 'del') { S.confirm = 'del'; render(); return; }
    guard(async () => { await store.deleteProject(p.id); S.confirm = null; S.pid = null; S.view = 'home'; await refresh(); });
  }
});

app.addEventListener('change', e => {
  if (e.target.matches('[data-correct]')) {
    const p = project();
    const st = { caps: { peeler: 1, board: 1, stove: 2 }, ...(p.settings || {}), correct: e.target.checked };
    p.settings = st; render(); toast(st.correct ? '見積りを補正しました。予定の画面で開始時刻を確かめてください' : '補正をやめました');
    store.saveSettings(p.id, st).catch(err => toast(err.message));
  }
});

render();
boot();
