import { store, isDemo } from './store.js';
import { CURRY, TASK, SKILLS, LEVELS, TOOLS, DAY, END, GOAL_MIN, skillName, levelOf, defaultSkills, assign, schedule, windowOf, computeRatios } from './plan.js';

// ============ 状態 ============
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
const S = {
  booting: true, err: '', busy: false,
  family: null, projects: [], runs: [], people: [], skillLog: [],
  view: 'welcome', pid: LS.get('fc-pid', null), tab: LS.get('fc-tab', 'plan'), planView: 'h48',
  me: LS.get('fc-me', 'all'), kday: null, justCreated: null, confirm: null, newParts: null,
};
const app = document.getElementById('app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const W = '日月火水木金土';
const CAPS0 = { peeler: 1, board: 1, stove: 2, knife: 2 };

let toastTimer;
function toast(msg) {
  document.querySelector('.toast')?.remove();
  const el = document.createElement('div'); el.className = 'toast'; el.textContent = msg; el.setAttribute('role', 'status');
  document.body.appendChild(el); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.remove(), 2600);
}

// ============ 人 ============
const person = id => S.people.find(p => p.id === id);
const pname = id => person(id)?.name ?? '?';
const pcolor = id => `var(--c${(person(id)?.color ?? 0) % 8})`;
const dot = id => `<span class="dot" style="background:${pcolor(id)}"></span>`;
function participantsOf(p) {
  const ids = p?.settings?.participants;
  const list = ids ? S.people.filter(x => ids.includes(x.id)) : S.people;
  return list.length ? list : S.people;
}

// ============ 時刻の換算 ============
// テンプレートの「分」(前日0:00=0)を、実際の日時に置き換える
function clockOf(project) {
  const goal = new Date(project.goal_at);
  const base = new Date(goal.getFullYear(), goal.getMonth(), goal.getDate() - 1);
  const shift = Math.round((goal - base) / 60000) - GOAL_MIN;
  const at = m => new Date(base.getTime() + (m + shift) * 60000);
  const two = n => String(n).padStart(2, '0');
  return {
    at,
    hm: m => { const d = at(m); return `${d.getHours()}:${two(d.getMinutes())}`; },
    day: m => { const d = at(m); return `${d.getMonth() + 1}/${d.getDate()}(${W[d.getDay()]})`; },
    full: m => { const d = at(m); return `${d.getMonth() + 1}/${d.getDate()}(${W[d.getDay()]}) ${d.getHours()}:${two(d.getMinutes())}`; },
    nowMin: () => (Date.now() - base.getTime()) / 60000 - shift,
  };
}

const project = () => S.projects.find(p => p.id === S.pid);
const runsOf = pid => Object.fromEntries(S.runs.filter(r => r.project_id === pid).map(r => [r.task_id, r]));
const history = pid => S.runs.filter(r => r.project_id !== pid && r.started_at && r.ended_at);
function planFor(p) {
  const st = p.settings || {};
  const caps = { ...CAPS0, ...(st.caps || {}) };
  const parts = participantsOf(p);
  const asg = assign(parts, st.assign || {});
  const ratios = computeRatios(history(p.id), parts);
  const T = schedule(asg, caps, st.correct ? ratios : null);
  return { T, caps, parts, ratios, correct: !!st.correct, base: st.correct ? schedule(asg, caps, null) : T };
}
const saveSettings = (p, patch) => {
  p.settings = { ...(p.settings || {}), ...patch };
  render();
  return store.saveSettings(p.id, p.settings).catch(err => toast(err.message));
};

// ============ データ読み込み ============
async function loadAll() {
  const fid = S.family.id;
  const [projects, runs, people, skillLog] = await Promise.all([store.projects(fid), store.runs(fid), store.people(fid), store.skillLog(fid)]);
  Object.assign(S, { projects, runs, people, skillLog });
}
async function refresh() {
  if (!S.family) return;
  await loadAll();
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
      await loadAll();
      S.view = S.pid && project() ? 'project' : 'home';
    }
  } catch (e) { S.err = e.message; }
  S.booting = false; render();
}

const demoBar = () => (isDemo ? '<div class="demo">お試しモード:データはこの端末の中だけに保存されます</div>' : '');

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
  return `<div class="page stack">${demoBar()}
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
function nextSunday() {
  const d = new Date(); d.setHours(18, 0, 0, 0);
  d.setDate(d.getDate() + ((7 - d.getDay()) % 7 || 7));
  return d;
}
const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const chips = (people, selected, attr) => `<div class="chips">${people.map(p => `<button type="button" class="chip" ${attr}="${p.id}" aria-pressed="${selected.includes(p.id)}">${dot(p.id)}${esc(p.name)}</button>`).join('')}</div>`;

function viewHome() {
  if (!S.people.length) {
    return `<div class="page stack">${demoBar()}
      <div class="hero" style="font-size:28px">まず、家族のメンバーを登録します</div>
      <p class="sub" style="margin:0">料理ごとに参加する人を選んだり、一人ひとりの「できること」に合わせて担当を決めたりするのに使います。あとからいつでも変えられます。</p>
      <button class="btn go wide" data-act="seed-people">よくある4人で始める(父・母・上の子・下の子)</button>
      <button class="btn wide" data-act="to-people">自分で登録する</button></div>`;
  }
  const n = S.projects.length + 1;
  if (!S.newParts) S.newParts = S.people.map(p => p.id);
  return `<div class="page stack">${demoBar()}
    <div class="between"><div><div class="sub">${esc(S.family.name)}</div><div class="hero" style="font-size:28px">料理プロジェクト</div></div>
    <div style="text-align:right"><div class="sub">家族ID</div><div style="font-family:var(--f-display);font-weight:800;letter-spacing:.08em">${esc(S.family.family_code)}</div></div></div>
    <button class="pitem" data-act="to-people"><span><b>家族のメンバーと「できること」</b><br><span class="sub">${S.people.map(p => esc(p.name)).join('・')}</span></span><span aria-hidden="true">›</span></button>
    <div class="plist">${S.projects.map(p => {
      const c = clockOf(p); const r = S.runs.filter(x => x.project_id === p.id && x.ended_at).length;
      return `<button class="pitem" data-open="${p.id}"><span><b>${esc(p.title)}</b><br><span class="sub">いただきます ${c.full(GOAL_MIN)}<br>${participantsOf(p).map(x => esc(x.name)).join('・')}</span></span><span class="pill ${r ? 'p-ok' : 'p-wait'}">記録 ${r}件</span></button>`;
    }).join('') || '<div class="card sub">まだ料理プロジェクトがありません。下から最初の1つを作りましょう。</div>'}</div>
    <form class="card stack" data-form="project">
      <h2 style="font-size:18px">新しい料理</h2>
      <label class="field" for="p-title">名前<input id="p-title" name="title" required maxlength="60" value="カレー 第${n}回"></label>
      <div class="row">
        <label class="field" for="p-date" style="flex:1 1 150px">「いただきます」の日<input id="p-date" name="date" type="date" required value="${ymd(nextSunday())}"></label>
        <label class="field" for="p-time" style="flex:1 1 110px">時刻<input id="p-time" name="time" type="time" required value="18:00" step="300"></label>
      </div>
      <div class="field">参加する人${chips(S.people, S.newParts, 'data-newpart')}</div>
      <p class="sub" style="margin:0">献立は今はカレーのみ。前の日から2日がかりで作る型です。担当は一人ひとりの「できること」から自動で決まります。</p>
      <button class="btn go wide" ${S.busy ? 'disabled' : ''}>作る</button>
    </form></div>`;
}

// ============ 画面:家族のメンバー ============
function viewPeople() {
  const grows = S.skillLog.filter(l => l.to_level > l.from_level && person(l.person_id));
  const doneCount = id => S.runs.filter(r => r.ended_at && (r.people || []).includes(id)).length;
  return `<div class="page stack">${demoBar()}
    <div class="bar"><button class="back" data-act="to-home" aria-label="料理の一覧へ戻る">‹</button><div><h1>家族のメンバー</h1><div class="goal">「できること」は3段階:まだ / できそう(見守りで挑戦) / できる</div></div></div>
    <div class="ppl">${S.people.map(p => `<div class="person">
      <div class="head">${dot(p.id)}<input id="pn-${p.id}" data-pname="${p.id}" value="${esc(p.name)}" maxlength="20" aria-label="名前">
        <div class="seg" role="group" aria-label="大人か子どもか"><button data-kind="${p.id}:adult" aria-pressed="${p.kind === 'adult'}">大人</button><button data-kind="${p.id}:child" aria-pressed="${p.kind === 'child'}">子ども</button></div></div>
      <div class="colors" role="group" aria-label="色">${[0, 1, 2, 3, 4, 5, 6, 7].map(c => `<button data-color="${p.id}:${c}" aria-pressed="${p.color === c}" style="background:var(--c${c})" aria-label="色${c + 1}"></button>`).join('')}</div>
      <div class="skills">${SKILLS.map(s => { const lv = levelOf(p, s.id); return `<span>${s.name}</span><div class="seg" role="group" aria-label="${s.name}">${LEVELS.map((l, i) => `<button class="lv${i}" data-skill="${p.id}:${s.id}:${i}" aria-pressed="${lv === i}">${l}</button>`).join('')}</div>`; }).join('')}</div>
      <div class="between"><span class="sub">これまでに担当した作業 ${doneCount(p.id)}件</span><button class="undo" data-delperson="${p.id}" style="color:var(--bad)">${S.confirm === 'dp:' + p.id ? 'もう一度押すと削除します' : 'この人を削除'}</button></div>
    </div>`).join('')}</div>
    <div class="row"><button class="btn" data-addperson="adult">＋ 大人を追加</button><button class="btn" data-addperson="child">＋ 子どもを追加</button></div>
    <div class="card stack" style="gap:8px"><h2 style="font-size:18px">できるようになったこと</h2>
      ${grows.length ? `<ul class="grow" style="margin:0;padding:0">${grows.map(l => { const d = new Date(l.created_at); return `<li>${dot(l.person_id)} <b>${esc(pname(l.person_id))}</b> ${skillName(l.skill)}:${LEVELS[l.from_level]} → <b>${LEVELS[l.to_level]}</b> <span class="sub">${d.getMonth() + 1}/${d.getDate()}</span></li>`; }).join('')}</ul>` : '<p class="sub" style="margin:0">「できること」の段階を上げると、ここに日付つきで残ります。</p>'}
    </div></div>`;
}

// ============ 縦の時間軸 ============
function vtimeline(p, P, T, from, to, ppm, opts) {
  const c = clockOf(p), runs = runsOf(p.id), lanes = P.parts;
  const H = Math.round((to - from) * ppm);
  const y = m => (m - from) * ppm;
  const inWin = t => t.e > from && t.s < to;
  const all = Object.values(T);
  let gut = '', grid = '';
  if (opts.minute) {
    for (let m = Math.ceil(from / 5) * 5; m <= to; m += 5) {
      const lab = m % 10 === 0;
      gut += `<div class="vt-tick${m % 30 === 0 ? ' major' : ''}" style="top:${y(m)}px">${lab ? `<span>${c.hm(m)}</span>` : ''}</div>`;
      if (lab) grid += `<div class="vt-grid" style="top:${y(m)}px"></div>`;
    }
  } else {
    for (let m = from; m <= to; m += 60) {
      const h = c.at(m).getHours();
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
  const cols = lanes.map((pp, pi) => {
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
    return `<div class="vt-col" style="grid-column:${pi + 2};grid-row:2">${nights}${grid}${gaps}${mine.map(t => blk(t, '', pcolor(pp.id), t.name)).join('')}${watching.map(t => blk(t, 'watch', 'transparent', '見守り')).join('')}</div>`;
  }).join('');
  const toolIds = opts.minute ? Object.keys(TOOLS).filter(r => all.some(t => inWin(t) && t.tools.includes(r))) : [];
  const toolCols = toolIds.map((r, ti) => {
    let extra = '';
    if (r === 'pot') { const a = T.fridge.e, b = T.reheat.s; if (b > from && a < to) extra = blk({ id: '_rest', name: '寝かせる', s: a, e: b }, 'rest', 'transparent', '寝かせ中'); }
    return `<div class="vt-col tool" style="grid-column:${lanes.length + 2 + ti};grid-row:2">${grid}${extra}${all.filter(t => inWin(t) && t.tools.includes(r)).map(t => blk(t, t.wait ? 'wait' : '', t.wait ? 'transparent' : pcolor(t.who[0]), t.name)).join('')}</div>`;
  }).join('');
  const nowM = c.nowMin();
  let over = '';
  if (nowM > from && nowM < to) over += `<div class="vline" style="top:${y(nowM)}px"><span>いま</span></div>`;
  if (T.eat.s >= from && T.eat.s <= to) over += `<div class="vline goal" style="top:${y(T.eat.s)}px"><span>いただきます</span></div>`;
  (opts.zooms || []).forEach(z => { over += `<button class="zoom" data-plan="${z.view}" style="top:${y(z.a) - 3}px;height:${(z.b - z.a) * ppm + 6}px" aria-label="${z.label}を分刻みで見る"><span>${z.label} 分刻み</span></button>`; });
  if (!opts.minute && T.reheat.s > T.fridge.e) {
    const a = T.fridge.e, b = T.reheat.s;
    over += `<div style="position:absolute;left:50%;transform:translateX(-50%);top:${y((a + b) / 2) - 12}px;background:var(--accent-soft);color:var(--accent-ink);border:1px solid var(--accent);border-radius:999px;font-size:12px;padding:2px 10px;white-space:nowrap;pointer-events:none">カレーを一晩寝かせる</div>`;
  }
  const heads = lanes.map(pp => `<div class="vt-h">${dot(pp.id)}${esc(pp.name)}</div>`).join('') + toolIds.map(r => `<div class="vt-h tool">${TOOLS[r]}${P.caps[r] ? '×' + P.caps[r] : ''}</div>`).join('');
  return `<div class="vt${toolIds.length ? ' with-tools' : ''}" style="--np:${lanes.length};--n:${toolIds.length}">
    <div class="vt-h"></div>${heads}
    <div class="vt-gut" style="height:${H}px;grid-column:1;grid-row:2">${gut}</div>${cols}${toolCols}
    <div class="vt-over" style="grid-column:1/-1;height:${H}px">${over}</div></div>`;
}

const legend = `<div class="legend"><span><i style="background:repeating-linear-gradient(135deg,var(--hatch) 0 4px,transparent 4px 8px);border:1.5px dashed var(--muted)"></i>見守り</span><span><i style="background:var(--sunk);border:1px solid var(--line)"></i>待ち</span><span><i style="background:var(--ok-soft);border:1.5px dashed var(--ok)"></i>手が空いている</span><span><i style="background:var(--bad);height:2px"></i>いま</span></div>`;

const whoText = t => (t.wait ? '待ち(人は空く)' : t.who.map(pname).join('・') + (t.watch ? ` / 見守り:${pname(t.watch)}` : ''));

function statsHtml(p, P) {
  const c = clockOf(p);
  const w1 = windowOf(P.T, 1), w2 = windowOf(P.T, 2), b1 = windowOf(P.base, 1), b2 = windowOf(P.base, 2);
  const diff = (a, b) => (P.correct && a !== b ? `<div class="d up">補正で${Math.abs(a - b)}分${a < b ? '早く' : '遅く'}</div>` : `<div class="d">${P.correct ? '補正しても同じ' : 'ここから逆算した時刻'}</div>`);
  const kids = P.parts.filter(x => x.kind === 'child').map(x => x.id);
  const kidMin = Object.values(P.T).filter(t => !t.wait && t.fixed == null && t.who.some(w => kids.includes(w))).reduce((s, t) => s + t.dur, 0);
  return `<div class="stats">
    <div class="stat"><div class="k">1日目 台所に入る</div><div class="v">${c.hm(w1.a)}</div>${diff(w1.a, b1.a)}</div>
    <div class="stat"><div class="k">2日目 台所に入る</div><div class="v">${c.hm(w2.a)}</div>${diff(w2.a, b2.a)}</div>
    <div class="stat"><div class="k">子どもが担当する時間</div><div class="v">${kidMin}<span class="sub"> 分</span></div><div class="d">${kids.length ? kids.length + '人の合計' : '子どもは不参加'}</div></div>
    <div class="stat"><div class="k">いただきます</div><div class="v">${c.hm(P.T.eat.s)}</div><div class="d">${c.day(P.T.eat.s)}</div></div></div>`;
}

function issuesHtml(P) {
  const list = Object.values(P.T).filter(t => t.issue);
  if (!list.length) return '';
  return `<div class="card stack" style="gap:6px;border-color:var(--bad)"><b style="color:var(--bad)">担当に注意があります</b>${list.map(t => `<div class="sub">${esc(t.name)}:${esc(t.issue)}</div>`).join('')}<div class="sub">「設定」で参加する人や担当を変えられます。</div></div>`;
}

function viewPlan(p, P) {
  const c = clockOf(p);
  const seg = `<div class="seg" role="group" aria-label="表示する時間帯">${[['h48', '48時間'], ['d1', '1日目'], ['d2', '2日目']].map(([k, l]) => `<button data-plan="${k}" aria-pressed="${S.planView === k}">${l}</button>`).join('')}</div>`;
  if (S.planView === 'h48') {
    const w1 = windowOf(P.T, 1), w2 = windowOf(P.T, 2);
    return `${statsHtml(p, P)}${issuesHtml(P)}<div class="between">${seg}</div>
      <p class="sub" style="margin:0">上から下へ時間が流れます(${c.day(0)} 0時〜${c.day(DAY)} 24時)。黄色の枠を押すと、台所にいる時間を1分単位で見られます。</p>
      ${vtimeline(p, P, P.T, 0, END, 0.4, { minute: false, zooms: [{ a: w1.a, b: w1.b, view: 'd1', label: '1日目' }, { a: w2.a, b: w2.b, view: 'd2', label: '2日目' }] })}`;
  }
  const day = S.planView === 'd1' ? 1 : 2;
  const w = windowOf(P.T, day);
  const from = Math.floor((w.a - 5) / 5) * 5, to = Math.ceil((w.b + 5) / 5) * 5;
  const steps = w.list.slice().sort((a, b) => a.s - b.s || a.e - b.e);
  return `${statsHtml(p, P)}${issuesHtml(P)}<div class="between">${seg}</div>
    <p class="sub" style="margin:0">${day === 1 ? 'カレーを作って寝かせる日。ピーラーやまな板が足りないと、手が空いていても待たされます(設定で数を変えられます)。' : '「いただきます」から逆算して、ご飯・温め直し・サラダ・食卓の準備を同時に進めます。'}</p>
    ${legend}
    ${vtimeline(p, P, P.T, from, to, 6, { minute: true, workFrom: w.a, workTo: w.b })}
    <div class="card"><h3 style="font-size:15px;margin-bottom:6px">手順(時刻順)</h3>
    <table class="rec"><tbody>${steps.map(t => `<tr><td style="white-space:nowrap;font-weight:700;vertical-align:top">${c.hm(t.s)}</td><td>${esc(t.name)} <span class="sub">${t.dur}分</span><br><span class="sub">${esc(whoText(t))}</span>${t.issue ? `<div class="issue">${esc(t.issue)}</div>` : ''}</td></tr>`).join('')}</tbody></table></div>`;
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
    const role = t => (t.watch === pp.id ? `見守り(${t.who.map(pname).join('・')}が担当)` : t.who.length > 1 ? `${t.who.map(pname).join('・')}で` : 'ひとりで') + (t.watch && t.watch !== pp.id ? ` ・ ${pname(t.watch)}が見守り` : '');
    let body;
    if (cur) {
      const st = new Date(runs[cur.id].started_at).getTime();
      body = `<div class="meta">いまやっていること</div><div class="now">${esc(cur.name)}</div>
        <div class="between"><div class="meta">${esc(role(cur))} ・ 予定${cur.dur}分</div><div class="clock" data-elapsed="${st}" data-plan="${cur.dur}">0:00</div></div>
        <button class="bigbtn end" data-end="${cur.id}">終わった!</button>`;
    } else if (nxt.length) {
      const t = nxt[0];
      const wait = !depsDone(t) ? `<div class="waitnote">先に「${t.deps.filter(d => !ended(P.T[d])).map(d => esc(P.T[d].name)).join('」「')}」が終わるのを待ちます</div>` : '';
      body = `<div class="meta">次は ${c.hm(t.s)} ごろ</div><div class="now">${esc(t.name)}</div><div class="meta">${esc(role(t))} ・ ${t.dur}分</div>${wait}
        <button class="bigbtn start" data-start="${t.id}">始める</button>`;
    } else {
      body = `<div class="now">${day === 1 ? '今日の作業はおしまい' : 'あとは、いただきます!'}</div><div class="meta">ほかの人を手伝おう</div>`;
    }
    const later = solo ? nxt.slice(cur ? 0 : 1, 6) : [];
    const lastDone = mine.filter(ended).pop();
    return `<div class="pcard${cur ? ' active' : ''}"><div class="who">${dot(pp.id)}${esc(pp.name)}</div>${body}
      ${lastDone ? `<button class="undo" data-undo="${lastDone.id}">「${esc(lastDone.name)}」の記録を取り消す</button>` : ''}
      ${later.length ? `<ul class="next">${later.map(t => `<li><span class="tm">${c.hm(t.s)}</span><span>${esc(t.name)} <span class="sub">${t.dur}分</span></span></li>`).join('')}</ul>` : ''}</div>`;
  };
  const me = P.parts.some(x => x.id === S.me) ? S.me : 'all';
  const who = `<div class="who-pick" role="group" aria-label="この端末を使う人"><button data-me="all" aria-pressed="${me === 'all'}">みんな(タブレット)</button>${P.parts.map(pp => `<button data-me="${pp.id}" aria-pressed="${me === pp.id}">${dot(pp.id)}${esc(pp.name)}</button>`).join('')}</div>`;
  const solo = me !== 'all';
  const doneN = list.filter(ended).length;
  return `<div class="between"><div class="seg" role="group" aria-label="日">${[1, 2].map(d => `<button data-kday="${d}" aria-pressed="${day === d}">${d}日目</button>`).join('')}</div><span class="sub">${doneN}/${list.length} 完了${'wakeLock' in navigator ? ' ・ 画面は消えません' : ''}</span></div>
    ${who}
    ${timersHtml ? `<div class="timers">${timersHtml}</div>` : ''}
    <div class="pcards${solo ? ' solo' : ''}">${solo ? card(person(me), true) : P.parts.map(pp => card(pp, false)).join('')}</div>`;
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
// 「できそう」の作業を見守り付きで2回以上こなしたら、「できる」への格上げを提案する
function growthSuggestions(parts) {
  const out = [];
  parts.forEach(pp => SKILLS.forEach(s => {
    if (levelOf(pp, s.id) !== 1) return;
    const n = S.runs.filter(r => r.ended_at && (r.people || []).includes(pp.id) && TASK[r.task_id]?.skill === s.id).length;
    if (n >= 2) out.push({ pp, s, n });
  }));
  return out;
}

function viewReview(p, P) {
  const all = S.runs.filter(r => r.started_at && r.ended_at);
  const R = computeRatios(all, P.parts);
  const runs = runsOf(p.id);
  const rows = CURRY.filter(t => !t.wait && runs[t.id]?.ended_at);
  const sug = growthSuggestions(P.parts);
  return `${sug.length ? `<div class="card stack" style="gap:8px"><h2 style="font-family:var(--f-display);font-size:19px">できるようになったかも?</h2>${sug.map(x => `<div class="suggest"><span>${dot(x.pp.id)} <b>${esc(x.pp.name)}</b>は「${x.s.name}」を${x.n}回やりました</span><button class="btn go" data-promote="${x.pp.id}:${x.s.id}">「できる」にする</button></div>`).join('')}</div>` : ''}
    <div class="card stack" style="gap:8px"><h2 style="font-family:var(--f-display);font-size:19px">予定の何倍かかったか</h2>
    <p class="sub" style="margin:0">記録がまだない人は見本の数字(大人1.0倍・子ども1.3倍)です。台所で「始める」「終わった」を押すと、本当の数字に置き換わります。</p></div>
    <div class="ratios">${P.parts.map(pp => { const r = R[pp.id]; return `<div class="ratio"><div class="row" style="gap:6px">${dot(pp.id)}<b>${esc(pp.name)}</b>${r.sample ? '<span class="pill p-wait">見本</span>' : ''}</div>
      <div class="x" style="color:${pcolor(pp.id)}">×${r.ratio.toFixed(2)}</div>
      <div class="rbar"><i style="width:${Math.min(100, r.ratio / 2 * 100)}%;background:${pcolor(pp.id)}"></i><b style="left:50%"></b></div>
      <div class="sub" style="margin-top:4px">${r.sample ? 'まだ記録なし' : `予定${r.plan}分→実際${r.act}分`}</div></div>`; }).join('')}</div>
    <label class="switch card" for="sw-correct"><input type="checkbox" id="sw-correct" data-correct ${P.correct ? 'checked' : ''}><span>次の見積りを、前回までの記録で補正する<br><span class="sub">この料理以外の記録を使います</span></span></label>
    <div class="card"><h3 style="font-size:15px;margin-bottom:6px">この料理の記録</h3>
    ${rows.length ? `<table class="rec"><thead><tr><th>作業</th><th>予定</th><th>実際</th></tr></thead><tbody>${rows.map(t => { const r = runs[t.id]; const a = Math.max(1, Math.round((new Date(r.ended_at) - new Date(r.started_at)) / 60000)); return `<tr><td>${esc(t.name)}<br><span class="sub">${(r.people || []).map(pname).join('・')}</span></td><td>${t.d}分</td><td><b>${a}分</b> ${a > t.d ? `<span class="pill p-bad">+${a - t.d}</span>` : a < t.d ? `<span class="pill p-ok">${a - t.d}</span>` : ''}</td></tr>`; }).join('')}</tbody></table>` : '<p class="sub" style="margin:0">まだ記録がありません。</p>'}</div>`;
}

// ============ 設定 ============
function viewSettings(p, P) {
  const capRow = (k, label, opts) => `<div class="between"><span>${label}</span><div class="seg" role="group" aria-label="${label}の数">${opts.map(([v, l]) => `<button data-cap="${k}" data-v="${v}" aria-pressed="${P.caps[k] === v}">${l}</button>`).join('')}</div></div>`;
  const ov = p.settings?.assign || {};
  const editable = CURRY.filter(t => !t.wait && t.crew !== 'all');
  return `<div class="card stack"><h2 style="font-size:18px">参加する人</h2>
      ${chips(S.people, P.parts.map(x => x.id), 'data-part')}
      <p class="sub" style="margin:0">押すと参加・不参加が切り替わり、担当と工程が計算し直されます。</p></div>
    <div class="card stack"><h2 style="font-size:18px">作業の担当</h2>
      <p class="sub" style="margin:0">「自動」は、一人ひとりの「できること」から決めた担当です。手で選ぶこともできます。</p>
      <table class="asg"><tbody>${editable.map(t => { const a = P.T[t.id]; return `<tr><td>${esc(t.name)}<br><span class="sub">${skillName(t.skill)}${t.crew > 1 ? ` ・ ${t.crew}人` : ''}${a.watch ? ` ・ 見守り:${esc(pname(a.watch))}` : ''}</span>${a.issue ? `<div class="issue">${esc(a.issue)}</div>` : ''}</td>
        <td style="text-align:right"><select data-assign="${t.id}" aria-label="${esc(t.name)}の担当"><option value="">自動${!ov[t.id] ? `(${esc(a.who.map(pname).join('・'))})` : ''}</option>${P.parts.map(pp => `<option value="${pp.id}" ${ov[t.id]?.[0] === pp.id ? 'selected' : ''}>${esc(pp.name)}(${LEVELS[levelOf(pp, t.skill)]})</option>`).join('')}</select></td></tr>`; }).join('')}</tbody></table></div>
    <div class="card stack"><h2 style="font-size:18px">台所の道具</h2>
      ${capRow('peeler', 'ピーラー', [[1, '1本'], [2, '2本']])}
      ${capRow('board', 'まな板', [[1, '1枚'], [2, '2枚']])}
      ${capRow('knife', '包丁', [[1, '1本'], [2, '2本'], [3, '3本']])}
      ${capRow('stove', 'コンロ', [[1, '1口'], [2, '2口'], [3, '3口']])}</div>
    <div class="card stack"><h2 style="font-size:18px">家族</h2>
      <div class="between"><span>家族ID</span><b style="letter-spacing:.08em">${esc(S.family.family_code)}</b></div>
      <button class="btn" data-act="to-people">家族のメンバーと「できること」を編集</button>
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
  return `<div class="page stack">${demoBar()}
    <div class="bar"><button class="back" data-act="to-home" aria-label="料理の一覧へ戻る">‹</button><div style="min-width:0"><h1>${esc(p.title)}</h1><div class="goal">いただきます ${c.full(P.T.eat.s)}</div></div></div>
    ${body}</div>
    <nav class="tabbar" aria-label="画面の切り替え">${[['plan', '予定'], ['kitchen', '台所'], ['review', '振り返り'], ['settings', '設定']].map(([k, l]) => `<button data-tab="${k}" ${S.tab === k ? 'aria-current="page"' : ''}>${ICON[k]}${l}</button>`).join('')}</nav>`;
}

function render() {
  if (S.booting) { app.innerHTML = '<div class="page"><p class="sub">読み込み中…</p></div>'; return; }
  if (!S.family) S.view = 'welcome';
  if (S.view === 'project' && (!project() || !S.people.length)) S.view = 'home';
  const html = S.view === 'welcome' ? viewWelcome() : S.view === 'home' ? viewHome() : S.view === 'people' ? viewPeople() : viewProject();
  const focusId = document.activeElement?.id;
  app.innerHTML = html;
  if (focusId && /^pn-/.test(focusId)) document.getElementById(focusId)?.focus();
  keepAwake(S.view === 'project' && S.tab === 'kitchen');
}

// ============ 操作 ============
async function guard(fn) {
  if (S.busy) return;
  S.busy = true; S.err = '';
  try { await fn(); } catch (e) { S.err = e.message; toast(e.message); }
  S.busy = false; render();
}
const go = (view, extra = {}) => { Object.assign(S, { view, confirm: null }, extra); render(); window.scrollTo(0, 0); };

async function addPerson(kind, name) {
  const used = S.people.map(p => p.color);
  const color = [0, 1, 2, 3, 4, 5, 6, 7].find(c => !used.includes(c)) ?? S.people.length % 8;
  const row = { family_id: S.family.id, name, kind, color, sort: S.people.length, skills: defaultSkills(kind) };
  const p = await store.addPerson(row); S.people.push(p); return p;
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
      if (!S.newParts?.length) throw new Error('参加する人を1人以上選んでください');
      const goal = new Date(`${fd.get('date')}T${fd.get('time')}:00`);
      const p = await store.createProject(S.family.id, fd.get('title').trim(), goal.toISOString(), { caps: CAPS0, correct: false, participants: S.newParts });
      S.newParts = null;
      await refresh(); S.pid = p.id; LS.set('fc-pid', p.id); S.view = 'project'; S.tab = 'plan'; S.planView = 'h48';
    }
  });
});

app.addEventListener('click', e => {
  unlockAudio();
  const el = e.target.closest('button,[data-open]');
  if (!el) return;
  const d = el.dataset, p = project();
  if (d.act !== 'leave' && d.act !== 'del-project' && !d.delperson) S.confirm = null;

  // 画面移動
  if (d.act === 'to-home') { S.justCreated = null; S.pid = null; LS.set('fc-pid', null); return go('home'); }
  if (d.act === 'to-people') return go('people');
  if (d.open) { S.pid = d.open; LS.set('fc-pid', d.open); return go('project', { planView: 'h48', kday: null }); }
  if (d.tab) { S.tab = d.tab; LS.set('fc-tab', d.tab); return go('project', { kday: null }); }
  if (d.plan) return go('project', { planView: d.plan });
  if (d.me) { S.me = d.me; LS.set('fc-me', d.me); return render(); }
  if (d.kday) { S.kday = +d.kday; return render(); }

  // 家族のメンバー
  if (d.act === 'seed-people') {
    return guard(async () => { for (const [n, k] of [['父', 'adult'], ['母', 'adult'], ['上の子', 'child'], ['下の子', 'child']]) await addPerson(k, n); S.newParts = null; toast('4人を登録しました。「できること」はメンバー画面で変えられます'); });
  }
  if (d.addperson) return guard(async () => { await addPerson(d.addperson, d.addperson === 'adult' ? '大人' : '子ども'); S.newParts = null; });
  if (d.kind) { const [id, kind] = d.kind.split(':'); const pp = person(id); pp.kind = kind; render(); store.updatePerson(id, { kind }).catch(err => toast(err.message)); return; }
  if (d.color) { const [id, c] = d.color.split(':'); const pp = person(id); pp.color = +c; render(); store.updatePerson(id, { color: +c }).catch(err => toast(err.message)); return; }
  if (d.skill || d.promote) {
    const [id, sk, lvS] = (d.skill || d.promote + ':2').split(':');
    const pp = person(id), from = levelOf(pp, sk), to = +lvS;
    if (from === to) return;
    pp.skills = { ...(pp.skills || {}), [sk]: to };
    const log = { family_id: S.family.id, person_id: id, skill: sk, from_level: from, to_level: to };
    S.skillLog.unshift({ ...log, id: 'tmp', created_at: new Date().toISOString() });
    render();
    if (to > from) toast(`${pp.name}:${skillName(sk)}が「${LEVELS[to]}」になりました`);
    Promise.all([store.updatePerson(id, { skills: pp.skills }), store.addSkillLog(log)]).catch(err => toast(err.message));
    return;
  }
  if (d.delperson) {
    if (S.confirm !== 'dp:' + d.delperson) { S.confirm = 'dp:' + d.delperson; return render(); }
    S.confirm = null;
    return guard(async () => { await store.deletePerson(d.delperson); S.people = S.people.filter(x => x.id !== d.delperson); S.newParts = null; });
  }
  if (d.newpart) {
    const set = new Set(S.newParts || []); set.has(d.newpart) ? set.delete(d.newpart) : set.add(d.newpart);
    S.newParts = S.people.map(x => x.id).filter(id => set.has(id)); return render();
  }
  if (d.part) {
    const cur = participantsOf(p).map(x => x.id);
    const next = cur.includes(d.part) ? cur.filter(x => x !== d.part) : S.people.map(x => x.id).filter(id => cur.includes(id) || id === d.part);
    if (!next.length) return toast('参加する人は1人以上必要です');
    return saveSettings(p, { participants: next });
  }

  // 台所の記録
  const now = new Date().toISOString();
  const setRun = (tid, patch) => {
    const i = S.runs.findIndex(r => r.project_id === p.id && r.task_id === tid);
    const run = { project_id: p.id, family_id: S.family.id, task_id: tid, people: [], ...(i >= 0 ? S.runs[i] : {}), ...patch };
    if (i >= 0) S.runs[i] = run; else S.runs.push(run);
    render();
    return store.saveRun({ project_id: run.project_id, family_id: run.family_id, task_id: run.task_id, started_at: run.started_at ?? null, ended_at: run.ended_at ?? null, people: run.people || [] }).catch(err => { toast(err.message); refreshSoon(); });
  };
  if (d.start) { const T = planFor(p).T; setRun(d.start, { started_at: now, ended_at: null, people: T[d.start].who }); navigator.vibrate?.(30); return; }
  if (d.end) { setRun(d.end, { ended_at: now }); navigator.vibrate?.([30, 60, 30]); toast('記録しました'); return; }
  if (d.undo) { setRun(d.undo, { started_at: null, ended_at: null }); store.deleteRun(p.id, d.undo).catch(() => {}); return; }
  if (d.cap) return saveSettings(p, { caps: { ...CAPS0, ...(p.settings?.caps || {}), [d.cap]: +d.v } });

  if (d.act === 'leave') {
    if (S.confirm !== 'leave') { S.confirm = 'leave'; return render(); }
    return guard(async () => { await store.leaveFamily(S.family.id); Object.assign(S, { family: null, projects: [], runs: [], people: [], skillLog: [], pid: null, confirm: null, view: 'welcome' }); });
  }
  if (d.act === 'del-project') {
    if (S.confirm !== 'del') { S.confirm = 'del'; return render(); }
    return guard(async () => { await store.deleteProject(p.id); S.confirm = null; S.pid = null; S.view = 'home'; await refresh(); });
  }
});

app.addEventListener('change', e => {
  const t = e.target, p = project();
  if (t.matches('[data-correct]')) {
    saveSettings(p, { correct: t.checked });
    toast(t.checked ? '見積りを補正しました。予定の画面で開始時刻を確かめてください' : '補正をやめました');
  } else if (t.matches('[data-assign]')) {
    const a = { ...(p.settings?.assign || {}) };
    if (t.value) a[t.dataset.assign] = [t.value]; else delete a[t.dataset.assign];
    saveSettings(p, { assign: a });
  } else if (t.matches('[data-pname]')) {
    const name = t.value.trim().slice(0, 20); if (!name) return render();
    const pp = person(t.dataset.pname); pp.name = name;
    store.updatePerson(pp.id, { name }).catch(err => toast(err.message));
  }
});

render();
boot();
