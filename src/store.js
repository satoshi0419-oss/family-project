// データの置き場所。Supabaseの設定があればSupabase、なければこの端末の中だけで動く「お試しモード」。
import { createClient } from '@supabase/supabase-js';

const URL = import.meta.env.VITE_SUPABASE_URL;
const KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const isDemo = !(URL && KEY);

const ERR = {
  wrong_code_or_pass: '家族IDか合言葉がちがいます。もう一度確かめてください',
  pass_too_short: '合言葉は4文字以上にしてください',
  not_signed_in: '端末の準備ができていません。ページを開き直してください',
};
const friendly = e => {
  const m = e?.message || String(e);
  const key = Object.keys(ERR).find(k => m.includes(k));
  if (key) return ERR[key];
  if (/anonymous/i.test(m)) return 'Supabaseで匿名サインインがオフになっています(Authentication → Sign In / Providers)';
  return '通信に失敗しました:' + m;
};

// ---------- Supabase版 ----------
function supabaseStore() {
  const sb = createClient(URL, KEY, { auth: { persistSession: true, autoRefreshToken: true } });
  let channel = null;
  const must = ({ data, error }) => { if (error) throw new Error(friendly(error)); return data; };
  return {
    async init() {
      const { data } = await sb.auth.getSession();
      if (!data.session) { const r = await sb.auth.signInAnonymously(); if (r.error) throw new Error(friendly(r.error)); }
    },
    async myFamily() {
      const rows = must(await sb.from('families').select('id,name,family_code').order('created_at'));
      return rows[0] || null;
    },
    async createFamily(name, pass) {
      const rows = must(await sb.rpc('create_family', { p_name: name, p_pass: pass }));
      return rows[0];
    },
    async joinFamily(code, pass) { return must(await sb.rpc('join_family', { p_code: code, p_pass: pass })); },
    async leaveFamily(fid) {
      const { data } = await sb.auth.getUser();
      must(await sb.from('family_members').delete().eq('family_id', fid).eq('user_id', data.user.id));
    },
    async projects(fid) { return must(await sb.from('cook_projects').select('*').eq('family_id', fid).order('created_at', { ascending: false })); },
    async createProject(fid, title, goalAt, settings) {
      return must(await sb.from('cook_projects').insert({ family_id: fid, title, goal_at: goalAt, settings }).select().single());
    },
    async saveSettings(pid, settings) { must(await sb.from('cook_projects').update({ settings }).eq('id', pid)); },
    async deleteProject(pid) { must(await sb.from('cook_projects').delete().eq('id', pid)); },
    async runs(fid) { return must(await sb.from('task_runs').select('*').eq('family_id', fid)); },
    async saveRun(run) { must(await sb.from('task_runs').upsert(run, { onConflict: 'project_id,task_id' })); },
    // 取り消しは行を消さずに空にする(消すとリアルタイム同期で他の端末に届かないため)
    async deleteRun(pid, tid) { must(await sb.from('task_runs').update({ started_at: null, ended_at: null }).eq('project_id', pid).eq('task_id', tid)); },
    async people(fid) { return must(await sb.from('family_people').select('*').eq('family_id', fid).order('sort').order('created_at')); },
    async addPerson(row) { return must(await sb.from('family_people').insert(row).select().single()); },
    async updatePerson(id, patch) { must(await sb.from('family_people').update(patch).eq('id', id)); },
    async deletePerson(id) { must(await sb.from('family_people').delete().eq('id', id)); },
    async skillLog(fid) { return must(await sb.from('skill_log').select('*').eq('family_id', fid).order('created_at', { ascending: false })); },
    async addSkillLog(row) { must(await sb.from('skill_log').insert(row)); },
    subscribe(fid, onChange) {
      if (channel) sb.removeChannel(channel);
      channel = sb.channel('family-' + fid)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'task_runs', filter: `family_id=eq.${fid}` }, onChange)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'cook_projects', filter: `family_id=eq.${fid}` }, onChange)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'family_people', filter: `family_id=eq.${fid}` }, onChange)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'skill_log', filter: `family_id=eq.${fid}` }, onChange)
        .subscribe();
    },
  };
}

// ---------- お試し版(この端末の中だけ。同じ端末の別タブとは同期) ----------
function demoStore() {
  const K = 'family-cooking-demo';
  const load = () => { try { return JSON.parse(localStorage.getItem(K)) || {}; } catch { return {}; } };
  let db = { family: null, projects: [], runs: [], people: [], skillLog: [], ...load() };
  const bc = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(K) : null;
  let listener = null;
  const commit = () => { try { localStorage.setItem(K, JSON.stringify(db)); } catch {} bc?.postMessage('x'); };
  if (bc) bc.onmessage = () => { db = { ...db, ...load() }; listener?.(); };
  const uid = () => crypto.randomUUID();
  return {
    async init() {},
    async myFamily() { return db.family; },
    async createFamily(name, pass) {
      if (!pass || pass.length < 4) throw new Error(ERR.pass_too_short);
      const code = Array.from({ length: 6 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');
      db.family = { id: uid(), name, family_code: code, pass }; commit();
      return { family_id: db.family.id, family_code: code };
    },
    async joinFamily(code, pass) {
      if (db.family && db.family.family_code === code.toUpperCase().trim() && db.family.pass === pass) return db.family.id;
      throw new Error('お試しモードでは、この端末で作った家族にだけ入れます');
    },
    async leaveFamily() { db = { family: null, projects: [], runs: [], people: [], skillLog: [] }; commit(); },
    async projects() { return [...db.projects].sort((a, b) => b.created_at.localeCompare(a.created_at)); },
    async createProject(fid, title, goalAt, settings) {
      const p = { id: uid(), family_id: fid, title, goal_at: goalAt, template: 'curry', settings: settings || {}, created_at: new Date().toISOString() };
      db.projects.push(p); commit(); return p;
    },
    async saveSettings(pid, settings) { const p = db.projects.find(x => x.id === pid); if (p) p.settings = settings; commit(); },
    async deleteProject(pid) { db.projects = db.projects.filter(p => p.id !== pid); db.runs = db.runs.filter(r => r.project_id !== pid); commit(); },
    async runs() { return db.runs; },
    async saveRun(run) {
      const i = db.runs.findIndex(r => r.project_id === run.project_id && r.task_id === run.task_id);
      if (i >= 0) db.runs[i] = { ...db.runs[i], ...run }; else db.runs.push(run);
      commit();
    },
    async deleteRun(pid, tid) { db.runs = db.runs.filter(r => !(r.project_id === pid && r.task_id === tid)); commit(); },
    async people() { return [...db.people].sort((a, b) => a.sort - b.sort); },
    async addPerson(row) { const p = { id: uid(), created_at: new Date().toISOString(), sort: 0, color: 0, skills: {}, ...row }; db.people.push(p); commit(); return p; },
    async updatePerson(id, patch) { const p = db.people.find(x => x.id === id); if (p) Object.assign(p, patch); commit(); },
    async deletePerson(id) { db.people = db.people.filter(p => p.id !== id); commit(); },
    async skillLog() { return [...db.skillLog].sort((a, b) => b.created_at.localeCompare(a.created_at)); },
    async addSkillLog(row) { db.skillLog.push({ id: uid(), created_at: new Date().toISOString(), ...row }); commit(); },
    subscribe(fid, onChange) { listener = onChange; },
  };
}

export const store = isDemo ? demoStore() : supabaseStore();
