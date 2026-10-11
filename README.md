# わが家のカレー工程表(family-cooking)

家族で料理するときに、「いただきます」の時刻から逆算して、だれが・いつ・何をするかを決めるアプリ。
スマホ・タブレットでの利用が前提。

- 画面:Vite + 素のJavaScript(`src/`)
- データ:Supabase(`supabase/` のSQLを SQL Editor で実行)
- 公開:Vercel(プロジェクト名 `family-cooking`)

## 手元で動かす
```
npm install
# .env.local に以下を書く(publishable key は公開してよい鍵)
# VITE_SUPABASE_URL=https://xxxx.supabase.co
# VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxx
npm run dev
```
`.env.local` が無いと「お試しモード」(端末の中だけに保存)で動きます。
