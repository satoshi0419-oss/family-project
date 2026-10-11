// 献立の型(テンプレート)と、逆算の計算。画面やデータベースには依存しない部分。
export const DAY = 1440; // 1日 = 1440分
export const END = 2 * DAY; // 48時間
export const GOAL_MIN = DAY + 18 * 60; // テンプレート上の「いただきます」= 2日目18:00

const T0 = (day, h, m = 0) => day * DAY + h * 60 + m;

export const PEOPLE = [
  { id: 'dad', name: '父', role: '大人' },
  { id: 'mom', name: '母', role: '大人' },
  { id: 'k1', name: '上の子', role: '小6' },
  { id: 'k2', name: '下の子', role: '小学生' },
];
export const pname = id => (PEOPLE.find(p => p.id === id) || { name: '?' }).name;

export const TOOLS = {
  stove: 'コンロ', pot: 'カレー鍋', board: 'まな板', knife: '包丁(大人用)',
  kknife: '包丁(子ども用)', peeler: 'ピーラー', sink: '流し', cooker: '炊飯器',
};

// d=予定の分数 / who=手を動かす人 / watch=見守る大人 / wait=人は空く待ち時間 / fixed=開始固定 / due=この時刻までに終える
export const CURRY = [
  { id: 'plan', name: '献立と買い物リストを決める', d: 30, who: ['dad', 'mom', 'k1', 'k2'], tools: [], deps: [], fixed: T0(0, 10) },
  { id: 'shop', name: 'スーパーへ買い出し', d: 60, who: ['dad', 'k1', 'k2'], tools: [], deps: ['plan'], due: T0(0, 16) },
  { id: 'store', name: '買ったものを冷蔵庫へしまう', d: 10, who: ['k1', 'k2'], tools: [], deps: ['shop'] },
  { id: 'hands', name: '手洗い・エプロン', d: 5, who: ['dad', 'mom', 'k1', 'k2'], tools: ['sink'], deps: ['store'] },
  { id: 'vwash', name: '野菜を洗う', d: 6, who: ['k2'], tools: ['sink'], deps: ['hands'] },
  { id: 'ppot', name: 'じゃがいもの皮むき', d: 10, who: ['k1'], tools: ['peeler'], deps: ['vwash'] },
  { id: 'pcar', name: 'にんじんの皮むき', d: 8, who: ['k2'], tools: ['peeler'], deps: ['vwash'] },
  { id: 'conion', name: '玉ねぎを切る', d: 8, who: ['dad'], tools: ['board', 'knife'], deps: ['hands'] },
  { id: 'cveg', name: 'じゃがいも・にんじんを切る', d: 12, who: ['k1'], watch: 'mom', tools: ['board', 'kknife'], deps: ['ppot', 'pcar'] },
  { id: 'fonion', name: '玉ねぎを炒める', d: 10, who: ['mom'], tools: ['stove', 'pot'], deps: ['conion'] },
  { id: 'fmeat', name: '肉を入れて炒める', d: 5, who: ['k1'], watch: 'mom', tools: ['stove', 'pot'], deps: ['fonion'] },
  { id: 'fveg', name: '野菜を入れて炒める', d: 4, who: ['k1'], watch: 'mom', tools: ['stove', 'pot'], deps: ['fmeat', 'cveg'] },
  { id: 'simmer', name: '水を入れて煮込む', d: 20, who: [], wait: true, tools: ['stove', 'pot'], deps: ['fveg'] },
  { id: 'dishes', name: '使った道具を洗う', d: 15, who: ['dad', 'k2'], tools: ['sink'], deps: ['cveg', 'conion'] },
  { id: 'roux', name: '火を止めてルーを溶かす', d: 5, who: ['k2'], watch: 'dad', tools: ['stove', 'pot'], deps: ['simmer', 'dishes'] },
  { id: 'thick', name: '弱火でとろみをつける', d: 10, who: [], wait: true, tools: ['stove', 'pot'], deps: ['roux'] },
  { id: 'cool', name: '粗熱をとる', d: 60, who: [], wait: true, tools: ['pot'], deps: ['thick'] },
  { id: 'fridge', name: '鍋ごと冷蔵庫へ', d: 5, who: ['dad'], tools: ['pot'], deps: ['cool'], due: T0(0, 20) },
  { id: 'rwash', name: 'お米をとぐ', d: 10, who: ['k2'], tools: ['sink'], deps: [] },
  { id: 'rice', name: 'ご飯を炊く', d: 50, who: [], wait: true, tools: ['cooker'], deps: ['rwash'] },
  { id: 'reheat', name: 'カレーを温め直す', d: 15, who: ['mom'], tools: ['stove', 'pot'], deps: ['fridge'] },
  { id: 'salad', name: 'サラダをつくる', d: 15, who: ['k1'], watch: 'dad', tools: ['board', 'kknife'], deps: [] },
  { id: 'table', name: '食卓の準備', d: 10, who: ['dad', 'k2'], tools: [], deps: [] },
  { id: 'serve', name: '盛りつけ', d: 5, who: ['dad', 'mom', 'k1', 'k2'], tools: ['pot'], deps: ['reheat', 'rice', 'salad', 'table'] },
  { id: 'eat', name: 'いただきます', d: 40, who: ['dad', 'mom', 'k1', 'k2'], tools: [], deps: ['serve'], fixed: T0(1, 18), goal: true },
  { id: 'clean', name: '片付け', d: 20, who: ['dad', 'k1', 'k2'], tools: ['sink'], deps: ['eat'], fixed: T0(1, 18, 40) },
  { id: 'retro', name: '家族で振り返り', d: 10, who: ['dad', 'mom', 'k1', 'k2'], tools: [], deps: ['clean'], fixed: T0(1, 19) },
];

// 見本の実績(記録がまだない家族向け)
export const SAMPLE = { vwash: 9, ppot: 13, pcar: 13, conion: 7, cveg: 15, fonion: 9, fmeat: 6, fveg: 5, dishes: 18, roux: 7, rwash: 15, salad: 17, table: 12, store: 12 };

const minutesOf = r => Math.max(1, Math.round((new Date(r.ended_at) - new Date(r.started_at)) / 60000));

// 人ごとの「予定の何倍かかったか」。records = [{task_id, started_at, ended_at}]
export function computeRatios(records) {
  const real = records.filter(r => r.started_at && r.ended_at);
  const useSample = real.length === 0;
  const byTask = {};
  if (useSample) Object.entries(SAMPLE).forEach(([k, v]) => (byTask[k] = [v]));
  else real.forEach(r => (byTask[r.task_id] = byTask[r.task_id] || []).push(minutesOf(r)));
  const acc = {};
  PEOPLE.forEach(p => (acc[p.id] = { plan: 0, act: 0, n: 0 }));
  CURRY.forEach(t => {
    if (t.wait || !t.who.length || !byTask[t.id]) return;
    byTask[t.id].forEach(a => t.who.forEach(w => { acc[w].plan += t.d; acc[w].act += a; acc[w].n++; }));
  });
  const out = { useSample };
  PEOPLE.forEach(p => { const x = acc[p.id]; out[p.id] = { ratio: x.plan ? x.act / x.plan : 1, ...x }; });
  return out;
}

// 逆算:道具と人の取り合いを考えながら、各作業をできるだけ遅く置く
export function schedule(caps, ratios) {
  const T = {};
  CURRY.forEach(t => {
    let d = t.d;
    if (ratios && !t.wait && t.who.length) d = Math.round(t.d * Math.max(...t.who.map(w => ratios[w].ratio)));
    T[t.id] = { ...t, dur: Math.max(1, d) };
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
    for (const r of resOf(t)) { occ[r] = occ[r] || new Int8Array(END + 600); for (let m = s; m < t.e; m++) occ[r][m]++; }
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
