// 献立の型(テンプレート)、担当の自動割り当て、逆算の計算。画面やデータベースには依存しない部分。
export const DAY = 1440; // 1日 = 1440分
export const END = 2 * DAY; // 48時間
export const GOAL_MIN = DAY + 18 * 60; // テンプレート上の「いただきます」= 2日目18:00

const T0 = (day, h, m = 0) => day * DAY + h * 60 + m;

// 「できること」の種類
export const SKILLS = [
  { id: 'plan', name: '献立・買い物' },
  { id: 'wash', name: '洗う' },
  { id: 'peel', name: '皮むき' },
  { id: 'knife', name: '包丁' },
  { id: 'fire', name: '火を使う' },
  { id: 'measure', name: '計る・混ぜる' },
  { id: 'serve', name: '盛りつけ' },
  { id: 'clean', name: '片付け' },
];
export const skillName = id => (SKILLS.find(s => s.id === id) || { name: id }).name;
export const LEVELS = ['まだ', 'できそう', 'できる']; // 0 / 1(見守りで挑戦) / 2(ひとりで)
export const levelOf = (person, skill) => {
  const v = person?.skills?.[skill];
  if (v == null) return person?.kind === 'adult' ? 2 : 0;
  return typeof v === 'object' ? v.level ?? 0 : v;
};
// 新しく登録するときの「できること」の初期値
export function defaultSkills(kind) {
  if (kind === 'adult') return Object.fromEntries(SKILLS.map(s => [s.id, 2]));
  return { plan: 1, wash: 2, peel: 1, knife: 1, fire: 1, measure: 1, serve: 2, clean: 2 };
}

export const TOOLS = {
  stove: 'コンロ', pot: 'カレー鍋', board: 'まな板', knife: '包丁',
  peeler: 'ピーラー', sink: '流し', cooker: '炊飯器',
};

// skill=必要なできること / crew=人数('all'=参加者全員) / adultOnly=大人だけ / wait=人は空く待ち時間
// fixed=開始固定 / due=この時刻までに終える
export const CURRY = [
  { id: 'plan', name: '献立と買い物リストを決める', d: 30, skill: 'plan', crew: 'all', tools: [], deps: [], fixed: T0(0, 10) },
  { id: 'shop', name: 'スーパーへ買い出し', d: 60, skill: 'plan', crew: 'all', tools: [], deps: ['plan'], due: T0(0, 16) },
  { id: 'store', name: '買ったものを冷蔵庫へしまう', d: 10, skill: 'clean', crew: 2, tools: [], deps: ['shop'] },
  { id: 'hands', name: '手洗い・エプロン', d: 5, skill: 'wash', crew: 'all', tools: ['sink'], deps: ['store'] },
  { id: 'vwash', name: '野菜を洗う', d: 6, skill: 'wash', crew: 1, tools: ['sink'], deps: ['hands'] },
  { id: 'ppot', name: 'じゃがいもの皮むき', d: 10, skill: 'peel', crew: 1, tools: ['peeler'], deps: ['vwash'] },
  { id: 'pcar', name: 'にんじんの皮むき', d: 8, skill: 'peel', crew: 1, tools: ['peeler'], deps: ['vwash'] },
  { id: 'conion', name: '玉ねぎを切る', d: 8, skill: 'knife', crew: 1, tools: ['board', 'knife'], deps: ['hands'] },
  { id: 'cveg', name: 'じゃがいも・にんじんを切る', d: 12, skill: 'knife', crew: 1, tools: ['board', 'knife'], deps: ['ppot', 'pcar'] },
  { id: 'fonion', name: '玉ねぎを炒める', d: 10, skill: 'fire', crew: 1, tools: ['stove', 'pot'], deps: ['conion'] },
  { id: 'fmeat', name: '肉を入れて炒める', d: 5, skill: 'fire', crew: 1, tools: ['stove', 'pot'], deps: ['fonion'] },
  { id: 'fveg', name: '野菜を入れて炒める', d: 4, skill: 'fire', crew: 1, tools: ['stove', 'pot'], deps: ['fmeat', 'cveg'] },
  { id: 'simmer', name: '水を入れて煮込む', d: 20, wait: true, tools: ['stove', 'pot'], deps: ['fveg'] },
  { id: 'dishes', name: '使った道具を洗う', d: 15, skill: 'clean', crew: 2, tools: ['sink'], deps: ['cveg', 'conion'] },
  { id: 'roux', name: '火を止めてルーを溶かす', d: 5, skill: 'measure', crew: 1, tools: ['stove', 'pot'], deps: ['simmer', 'dishes'] },
  { id: 'thick', name: '弱火でとろみをつける', d: 10, wait: true, tools: ['stove', 'pot'], deps: ['roux'] },
  { id: 'cool', name: '粗熱をとる', d: 60, wait: true, tools: ['pot'], deps: ['thick'] },
  { id: 'fridge', name: '鍋ごと冷蔵庫へ', d: 5, skill: 'clean', crew: 1, adultOnly: true, tools: ['pot'], deps: ['cool'], due: T0(0, 20) },
  { id: 'rwash', name: 'お米をとぐ', d: 10, skill: 'wash', crew: 1, tools: ['sink'], deps: [] },
  { id: 'rice', name: 'ご飯を炊く', d: 50, wait: true, tools: ['cooker'], deps: ['rwash'] },
  { id: 'reheat', name: 'カレーを温め直す', d: 15, skill: 'fire', crew: 1, tools: ['stove', 'pot'], deps: ['fridge'] },
  { id: 'salad', name: 'サラダをつくる', d: 15, skill: 'knife', crew: 1, tools: ['board', 'knife'], deps: [] },
  { id: 'table', name: '食卓の準備', d: 10, skill: 'serve', crew: 2, tools: [], deps: [] },
  { id: 'serve', name: '盛りつけ', d: 5, skill: 'serve', crew: 'all', tools: ['pot'], deps: ['reheat', 'rice', 'salad', 'table'] },
  { id: 'eat', name: 'いただきます', d: 40, crew: 'all', tools: [], deps: ['serve'], fixed: T0(1, 18), goal: true },
  { id: 'clean', name: '片付け', d: 20, skill: 'clean', crew: 'all', tools: ['sink'], deps: ['eat'], fixed: T0(1, 18, 40) },
  { id: 'retro', name: '家族で振り返り', d: 10, crew: 'all', tools: [], deps: ['clean'], fixed: T0(1, 19) },
];
export const TASK = Object.fromEntries(CURRY.map(t => [t.id, t]));

// ---- 担当の自動割り当て ----
// できる子どもに優先して任せ、「できそう」の子には見守りの大人を付ける。偏らないよう担当時間も均す。
export function assign(people, overrides = {}) {
  const P = people;
  const load = Object.fromEntries(P.map(p => [p.id, 0]));
  const adults = P.filter(p => p.kind === 'adult');
  const out = {};
  const pickWatcher = (skill, exclude) => adults
    .filter(a => !exclude.includes(a.id) && levelOf(a, skill) >= 2)
    .sort((a, b) => load[a.id] - load[b.id])[0];

  for (const t of CURRY) {
    if (t.wait) { out[t.id] = { who: [], watch: null }; continue; }
    if (t.crew === 'all' || !P.length) { out[t.id] = { who: P.map(p => p.id), watch: null }; P.forEach(p => (load[p.id] += t.d)); continue; }
    const n = Math.min(t.crew, P.length);
    let who = [], watch = null, issue = '', manual = false;
    const ov = (overrides[t.id] || []).filter(id => P.some(p => p.id === id));
    if (ov.length) {
      who = ov; manual = true;
    } else {
      const cands = P.filter(p => levelOf(p, t.skill) >= 1 && (!t.adultOnly || p.kind === 'adult'))
        .filter(p => levelOf(p, t.skill) >= 2 || pickWatcher(t.skill, [p.id]))
        .map(p => ({ p, score: load[p.id] + (p.kind === 'adult' ? 20 : 0) + (levelOf(p, t.skill) === 1 ? 8 : 0) }))
        .sort((a, b) => a.score - b.score);
      who = cands.slice(0, n).map(c => c.p.id);
      if (!who.length) {
        const fb = (adults.length ? adults : P).slice().sort((a, b) => load[a.id] - load[b.id])[0];
        who = [fb.id]; issue = `「${skillName(t.skill)}」ができる人が参加していません`;
      }
    }
    const needsWatch = who.some(id => levelOf(P.find(p => p.id === id), t.skill) < 2);
    if (needsWatch) {
      const w = pickWatcher(t.skill, who);
      if (w) watch = w.id; else if (!issue) issue = '見守りできる大人が参加していません';
      if (who.some(id => levelOf(P.find(p => p.id === id), t.skill) === 0) && !issue) issue = '「まだ」の人が担当になっています';
    }
    who.forEach(id => (load[id] += t.d));
    if (watch) load[watch] += t.d * 0.5;
    out[t.id] = { who, watch, issue, manual };
  }
  return out;
}

// ---- 人ごとの「予定の何倍かかったか」 ----
// records = [{task_id, started_at, ended_at, people:[id...]}]
export function computeRatios(records, people) {
  const real = records.filter(r => r.started_at && r.ended_at && r.people?.length);
  const out = { useSample: real.length === 0 };
  const acc = Object.fromEntries(people.map(p => [p.id, { plan: 0, act: 0, n: 0 }]));
  real.forEach(r => {
    const t = TASK[r.task_id]; if (!t || t.wait) return;
    const a = Math.max(1, Math.round((new Date(r.ended_at) - new Date(r.started_at)) / 60000));
    r.people.forEach(id => { if (acc[id]) { acc[id].plan += t.d; acc[id].act += a; acc[id].n++; } });
  });
  people.forEach(p => {
    const x = acc[p.id];
    // 記録がない人は見本の倍率(大人1.0倍・子ども1.3倍)
    out[p.id] = x.n ? { ratio: x.act / x.plan, ...x, sample: false } : { ratio: p.kind === 'adult' ? 1 : 1.3, ...x, sample: true };
  });
  return out;
}

// ---- 逆算:道具と人の取り合いを考えながら、各作業をできるだけ遅く置く ----
export function schedule(asg, caps, ratios) {
  const T = {};
  CURRY.forEach(t => {
    const a = asg[t.id] || { who: [], watch: null };
    let d = t.d;
    if (ratios && !t.wait && a.who.length && t.fixed == null) d = Math.round(t.d * Math.max(...a.who.map(w => ratios[w]?.ratio ?? 1)));
    T[t.id] = { ...t, who: a.who, watch: a.watch, issue: a.issue, manual: a.manual, dur: Math.max(1, d) };
  });
  const succ = {};
  CURRY.forEach(t => (succ[t.id] = []));
  CURRY.forEach(t => t.deps.forEach(d => succ[d].push(t.id)));
  const capOf = r => (r.startsWith('p:') ? 1 : caps[r] ?? 1);
  const occ = {};
  const resOf = t => [...(t.wait ? [] : t.who.map(w => 'p:' + w)), ...(t.watch ? ['p:' + t.watch] : []), ...t.tools];
  const fits = (t, s) => {
    if (s < 0) return false;
    for (const r of resOf(t)) { const o = occ[r]; if (!o) continue; const c = capOf(r); for (let m = s; m < s + t.dur; m++) if (o[m] >= c) return false; }
    return true;
  };
  const put = (t, s) => {
    t.s = s; t.e = s + t.dur;
    for (const r of resOf(t)) { occ[r] = occ[r] || new Int8Array(END + 600); for (let m = Math.max(0, s); m < t.e; m++) occ[r][m]++; }
  };
  Object.values(T).filter(t => t.fixed != null).forEach(t => put(t, t.fixed));
  const done = new Set(Object.values(T).filter(t => t.fixed != null).map(t => t.id));
  let guard = 0;
  while (done.size < CURRY.length && guard++ < 200) {
    const ready = Object.values(T).filter(t => !done.has(t.id) && succ[t.id].every(s => done.has(s)));
    ready.forEach(t => { t.lf = Math.min(t.due ?? Infinity, ...succ[t.id].map(s => T[s].s)); if (t.lf === Infinity) t.lf = END; });
    ready.sort((a, b) => b.lf - a.lf);
    const t = ready[0];
    let s = t.lf - t.dur;
    while (s >= 0 && !fits(t, s)) s--;
    if (s < 0) s = t.lf - t.dur;
    put(t, s); done.add(t.id);
  }
  return T;
}

// 台所にいる時間帯(1日目=作って寝かせる / 2日目=仕上げ)
export function windowOf(T, day) {
  const skip = ['plan', 'shop', 'eat', 'clean', 'retro'];
  const list = Object.values(T).filter(t => !skip.includes(t.id) && (day === 1 ? t.s < DAY : t.s >= DAY));
  return { list, a: Math.min(...list.map(t => t.s)), b: Math.max(...list.map(t => t.e)) };
}
