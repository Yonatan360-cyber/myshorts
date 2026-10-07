// MyShorts — כמו יוטיוב: הפיד לומד אותך לבד ומסדר את עצמו. בלי אחוזים, בלי כפתורים.
// לייק / תגובה / שיתוף / הרשמה = אוהב • דילוג מהיר / 👎 = לא מעניין • צפייה ארוכה = אוהב
// כל סרטון חדש שנכנס מדורג מיד לפי הטעם שלך. חוזרים לאתר? הפרופיל נשמר והפיד כבר מסודר.

const FALLBACK = [
  { id: "0Hbvujme7E0", title: "I don't know about that one… 🧐 #Shorts", channel: "@viral", likes: 1500000, source: "yt" },
  { id: "hVqN18yb0WE", title: "Put the dogs away bro… #shorts #dogs 🐶", channel: "@theboys", likes: 842000, source: "yt" },
  { id: "XsCU7Gc4U60", title: "Boy and Bobo try Hypnosis 😂 #funny", channel: "@bobo", likes: 231500, source: "yt" },
  { id: "xoL7quFlcAg", title: "Tung Tung Sahur — Jesus or Devil? 😇😈", channel: "@brainrot", likes: 512000, source: "yt" },
  { id: "5mv-xr5U4Ss", title: "This Flavor Combo Was Amazing! 🥤", channel: "@foodie", likes: 98400, source: "yt" },
  { id: "NRZV-OZo6lA", title: "DID YOU PUT A MOD IN THIS? #shorts", channel: "@gamer", likes: 176300, source: "yt" },
  { id: "csGs-nxbSaI", title: "Our most viral video of 2025! 👶", channel: "@family", likes: 2100000, source: "yt" },
  { id: "9F9OPCi5hzA", title: "It's always bangs 😭 #Shorts", channel: "@jordi", likes: 250600, source: "yt" },
];

// ================= LIVE: גילוי אוטומטי של שרתים חיים =================
// שרת מת? האתר שואל את api.invidious.io מי חי עכשיו — מתרפא לבד, בלי עדכון קוד.
const FALLBACK_HOSTS = ["https://invidious.f5.si", "https://pipedapi.adminforge.de"];
let apiHosts = null;
async function getApiHosts(){
  if (apiHosts) return apiHosts;
  try {
    const saved = JSON.parse(localStorage.getItem("ms_hosts") || "null");
    if (saved && Date.now() - saved.t < 24*3600*1000 && saved.hosts?.length){ apiHosts = saved.hosts; return apiHosts; }
  } catch(e){}
  const found = [];
  try{
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 10000);
    const r = await fetch("https://api.invidious.io/instances.json", { signal: ctl.signal });
    clearTimeout(t);
    if (r.ok){
      const list = await r.json();
      for (const [uri, info] of list){
        if (info && info.api === true) found.push("https://" + String(uri).replace(/^https?:\/\//, ""));
        if (found.length >= 8) break;
      }
    }
  }catch(e){}
  apiHosts = [...found, ...FALLBACK_HOSTS.filter(h => !found.includes(h))];
  try { localStorage.setItem("ms_hosts", JSON.stringify({ t: Date.now(), hosts: apiHosts })); } catch(e){}
  return apiHosts;
}
async function apiFetch(pathInv, pathPiped){
  const hosts = await getApiHosts();
  for (const base of hosts){
    const isPiped = base.includes("pipedapi");
    try{
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 8000);
      const r = await fetch(base + (isPiped ? pathPiped : pathInv), { signal: ctl.signal });
      clearTimeout(t);
      if (!r.ok) continue;
      return { data: await r.json(), piped: isPiped };
    }catch(e){}
  }
  throw new Error("no live host");
}
const MORE_QUERIES = ["#shorts viral", "#shorts funny", "#shorts music", "#shorts gaming", "#shorts food", "#shorts dance", "#shorts israel", "#shorts 2026"];

const key = s => s.source + ":" + s.id;
let master = [];
let view = [];
let feedIds = view;
let seen = new Set();
let players = {};
let wantsPlay = null;
let playSpeed = 1;
let currentIndex = 0;
let muted = true;
let ytReady = false;
let homeMode = true;
let pinnedKey = null;
let enterT = Date.now();
let queryCursor = 0;

const feed = document.getElementById("feed");
const toast = document.getElementById("toast");
const liveStatus = document.getElementById("liveStatus");
window.__ms = { get players(){ return players; }, get view(){ return view; }, get qi(){ return currentIndex; } };

function showToast(msg){
  toast.textContent = msg;
  toast.classList.add("show");
  clearTimeout(showToast.t);
  showToast.t = setTimeout(() => toast.classList.remove("show"), 2400);
}
const fmt = n => n == null ? "•" : n >= 1e6 ? (n/1e6).toFixed(1)+"M" : n >= 1e3 ? (n/1e3).toFixed(1)+"K" : ""+n;
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const likeKey = s => "like_" + s.source + "_" + s.id;
const isLiked = s => localStorage.getItem(likeKey(s)) === "1" || localStorage.getItem("like_" + s.id) === "1";

// ================= הטעם שלך (נשמר בין ביקורים) =================
const STOP = new Set(["the","and","for","you","with","this","that","from","shorts","short","video","tiktok","youtube","fyp","viral","funny","trend","trending","part","vs","new","best","2025","2026","2024","get","got","all","are","was","were","what","when","who","how","has","have","had","will","just","like","more","fypシ","foryou","foryoupage","duet","dance","challenge","fun","day","my","של","את","עם","על","זה","גם","כי","לא","אני","אתה","הוא","היא","מה","מי","כל","עוד","רק","יותר","איך","למה","כמו","אבל","אם","או","אל","עד","בין","אין","יש","שלך","שלי"]);
function keywords(title){
  return (String(title || "").toLowerCase().match(/[\u0590-\u05FFa-z0-9]{2,}/g) || [])
    .filter(w => !STOP.has(w)).slice(0, 12);
}
let profile = { kw: {}, ch: {}, src: { yt: 0, tt: 0 } };
try { Object.assign(profile, JSON.parse(localStorage.getItem("ms_profile") || "{}")); profile.src = profile.src || { yt: 0, tt: 0 }; } catch(e){}
function saveProfile(){
  try { localStorage.setItem("ms_profile", JSON.stringify(profile)); } catch(e){}
  updateTaste();
}
function bump(s, w){
  if (!s) return;
  keywords(s.title).forEach(k => profile.kw[k] = (profile.kw[k] || 0) + w);
  if (s.channel) profile.ch[s.channel] = (profile.ch[s.channel] || 0) + w;
  if (s.source) profile.src[s.source] = (profile.src[s.source] || 0) + w * 0.3;
  saveProfile();
  rerankTail();
}
function score(s){
  let sc = 0;
  keywords(s.title).forEach(k => sc += profile.kw[k] || 0);
  sc += (profile.ch[s.channel] || 0) * 2;
  sc += (profile.src[s.source] || 0);
  if (s.fresh) sc += 0.5;
  return sc;
}
function profileStrength(){
  let t = 0;
  for (const k in profile.kw) t += Math.abs(profile.kw[k]);
  return t;
}
// דירוג עם קצת סקרנות: בהתחלה מגוון, עם הזמן מדויק יותר (כמו יוטיוב)
const chanPenalty = {};
function rankKey(s){
  return score(s) + Math.random() * (profileStrength() < 6 ? 3 : 0.6) - (chanPenalty[s.channel] || 0) * 4;
}
function updateTaste(){
  const chip = document.getElementById("tasteChip");
  if (!chip) return;
  const top = Object.entries(profile.kw).filter(([,v]) => v > 0).sort((a,b) => b[1]-a[1]).slice(0,3).map(([k]) => k);
  chip.textContent = top.length ? `👃 קולט שאתה בקטע של: ${top.join(" • ")}` : "👃 עדיין לומד אותך... תעשה לייקים ותדלג על מה שלא מעניין";
}

// ================= שורטס חיים (יוטיוב) =================
function toShortYT(item){
  const url = item.url || "";
  const m = url.match(/v=([A-Za-z0-9_-]{6,15})/);
  if (!m) return null;
  if (item.duration && item.duration > 0 && item.duration > 70) return null;
  if (item.isShort === false) return null;
  return { id: m[1], title: item.title || "Short #" + m[1], channel: item.uploaderName ? "@" + item.uploaderName.replace(/\s+/g,"") : "@youtube", likes: item.views ?? null, fresh: true, source: "yt" };
}
function toShortInv(item){
  if (!item || (item.type && item.type !== "video") || !item.videoId) return null;
  if (item.lengthSeconds && item.lengthSeconds > 70) return null;
  const author = String(item.author || "youtube").replace(/\s+/g, "");
  return { id: item.videoId, title: item.title || "Short", channel: "@" + author, likes: item.viewCount ?? null, fresh: true, source: "yt" };
}
function normalize(items, piped){
  const arr = Array.isArray(items) ? items : (items?.items || []);
  return (Array.isArray(arr) ? arr : []).map(it => piped ? toShortYT(it) : toShortInv(it)).filter(Boolean);
}
async function fetchTrendingLive(){
  const k = ytKey();
  if (k){
    const r = await officialSearch(k, "#shorts").catch(() => []);
    const ok = await keepShorts(r);
    if (ok.length) return ok;
  }
  try { return await localFetch("/api/trending"); } catch(e){}
  const { data, piped } = await apiFetch("/api/v1/trending?region=IL", "/trending?region=IL");
  return await keepShorts(normalize(data, piped).slice(0, 40));
}
async function fetchSearchLive(q){
  const k = ytKey();
  if (k){
    const r = await officialSearch(k, q + " #shorts").catch(() => []);
    const ok = await keepShorts(r);
    if (ok.length) return ok;
  }
  try { return await localFetch("/api/search?q=" + encodeURIComponent(q)); } catch(e){}
  const { data, piped } = await apiFetch("/api/v1/search?q=" + encodeURIComponent(q) + "&type=video", "/search?q=" + encodeURIComponent(q) + "&filter=videos");
  return await keepShorts(normalize(data, piped).slice(0, 30));
}
// מסנן שורטס-בלבד לתוצאות ממקורות חיצוניים (השרת המקומי כבר מסנן)
async function keepShorts(list){
  if (!list.length || !location.protocol.startsWith("http")) return list;
  try{
    const r = await fetch("/api/verify?ids=" + list.map(s => s.id).join(","));
    if (!r.ok) return list;
    const m = await r.json();
    const f = list.filter(s => m[s.id] !== false);
    return f.length ? f : list;
  }catch(e){ return list; }
}
// משיכה ישירה מהשרת המקומי (אותו מחשב — בלי CORS, בלי מפתח, בלי מתווכים)
async function localFetch(path){
  if (!location.protocol.startsWith("http")) throw new Error("no local server");
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 45000);
  try{
    const r = await fetch(path, { signal: ctl.signal });
    if (!r.ok) throw new Error("bad");
    const j = await r.json();
    if (!Array.isArray(j) || !j.length) throw new Error("empty");
    return j;
  } finally { clearTimeout(t); }
}
// חיבור רשמי ליוטיוב (כשיש מפתח API שמור)
const ytKey = () => (localStorage.getItem("ms_ytkey") || "").trim();
const decodeHtml = s => String(s ?? "").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
async function officialSearch(k, q, related){
  const u = "https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=25"
    + (related ? "&relatedToVideoId=" + related : "&videoDuration=short&q=" + encodeURIComponent(q))
    + "&key=" + encodeURIComponent(k);
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 12000);
  try{
    const r = await fetch(u, { signal: ctl.signal });
    if (!r.ok) throw new Error("yt api " + r.status);
    const j = await r.json();
    return (j.items || []).filter(it => it.id?.videoId).map(it => ({
      id: it.id.videoId, title: decodeHtml(it.snippet.title),
      channel: "@" + String(it.snippet.channelTitle || "youtube").replace(/\s+/g, ""),
      likes: null, fresh: true, source: "yt"
    }));
  } finally { clearTimeout(t); }
}
// לולאת טעם: כשהפרופיל מזהה טעם — מושכים עוד שורטס-מאומתים באותו סגנון ומדרגים לפי הפרופיל.
let tasteCooldown = 0;
async function pullTaste(){
  if (!homeMode) return;
  const now = Date.now();
  if (now - tasteCooldown < 60000) return;
  const top = Object.entries(profile.kw).filter(([,v]) => v >= 3).sort((a,b) => b[1]-a[1]).slice(0, 2).map(([k]) => k);
  if (!top.length) return;
  tasteCooldown = now;
  try{
    const added = [];
    for (const kw of top){
      let res = [];
      try { res = await localFetch("/api/search?q=" + encodeURIComponent(kw + " #shorts")); }
      catch(e){ res = await fetchSearchLive(kw).catch(() => []); }
      res.forEach(s => { if (addVideo(s)) added.push(s); });
      if (added.length >= 6) break;
    }
    const vis = added;
    if (!vis.length) return;
    vis.forEach(s => view.push(s));
    feedIds = view;
    appendRows(vis);
    rerankTail();
    showToast("🎯 מביא עוד בסגנון: " + top.join(", "));
  }catch(e){}
}
// "יוטיוב ממליץ כי אהבת" — ההמלצות של יוטיוב עצמו, לא ניחוש שלנו
let relCooldown = 0;
async function pullRelated(s){
  if (!homeMode) return;
  const now = Date.now();
  if (now - relCooldown < 30000) return;
  relCooldown = now;
  try{
    let rel = [];
    const k = ytKey();
    if (k) rel = await officialSearch(k, "", s.id).catch(() => []);
    if (!rel.length) rel = await localFetch("/api/related?id=" + s.id).catch(() => []);
    const fresh = rel.filter(r => !seen.has(key(r)));
    if (!fresh.length) return;
    fresh.forEach(r => addVideo(r));
    const vis = fresh;
    vis.forEach(r => view.push(r));
    feedIds = view;
    appendRows(vis);
    rerankTail();
    showToast("🎯 יוטיוב מצא עוד סרטונים כמוהו!");
  }catch(e){}
}
// ניסיון חיבור ידני (לחיצה על שורת הסטטוס)
async function retryLive(manual){
  if (retryLive.busy) return;
  retryLive.busy = true;
  try{
    setLive("⏳ מנסה להתחבר ל-LIVE...");
    apiHosts = null;
    try { localStorage.removeItem("ms_hosts"); } catch(e){}
    const live = await fetchTrendingLive();
    const fresh = live.filter(s => !seen.has(key(s)));
    fresh.forEach(s => { addVideo(s); });
    const vis = homeMode ? fresh : [];
    vis.forEach(s => view.push(s));
    feedIds = view;
    appendRows(vis);
    rerankTail();
    setLive(`🔴 LIVE מחובר! • ${master.length} סרטונים בפיד • מתרענן כל 5 דק׳`);
    if (manual) showToast(fresh.length ? `🔴 מחובר! +${fresh.length} שורטס חיים` : "🔴 מחובר! הפיד מעודכן");
  }catch(e){
    setLive("⚠️ אין חיבור ל-LIVE — לחץ כאן לנסות שוב 🔄");
    if (manual) showToast("עדיין אין חיבור 😕 נסה שוב בעוד דקה");
  }
  retryLive.busy = false;
}

// ================= פיד =================
function addVideo(s){
  if (seen.has(key(s))) return false;
  seen.add(key(s));
  master.push(s);
  return true;
}
function destroyPlayers(){
  Object.values(players).forEach(p => { try { p.destroy && p.destroy(); } catch(e){} });
  players = {};
}
// נגנים עצלנים: נגן נוצר רק כשמתקרבים אליו — הפיד נשאר חלק גם עם עשרות סרטונים
const preloader = new IntersectionObserver(entries => {
  entries.forEach(en => {
    if (!en.isIntersecting) return;
    const s = view[+en.target.dataset.index];
    if (s && s.source === "yt" && ytReady && !players[key(s)]){
      createPlayer(s);
      preloader.unobserve(en.target);
    }
  });
}, { root: feed, rootMargin: "150% 0px 150% 0px" });
function nearViewport(row){
  const fh = feed.clientHeight || 600, st = feed.scrollTop;
  const top = row.offsetTop, h = row.offsetHeight || 600;
  return (top + h > st - 1.5 * fh) && (top < st + 2.5 * fh);
}
// ---- נתונים אמיתיים פר-סרטון (צפיות/תמונת ערוץ — מהשרת המקומי, בלי מפתח) ----
function metaLine(s){
  const v = s.views != null ? `👁 ${fmt(s.views)} צפיות` : "👁 …";
  const dt = s.date ? ` • ${s.date.split("-").reverse().join(".")}` : "";
  return v + dt;
}
function refreshCard(s){
  const row = feed.querySelector(`[data-vk="${key(s)}"]`);
  if (!row) return;
  const av = row.querySelector(".avatar");
  if (av && s.avatar && !av.querySelector("img")) av.innerHTML = `<img src="${esc(s.avatar)}" alt="" loading="lazy">`;
  const ml = row.querySelector(".meta-line");
  if (ml) ml.innerHTML = metaLine(s);
}
async function ensureDetails(s){
  if (s._det || !location.protocol.startsWith("http")) return;
  s._det = true;
  try{
    const r = await fetch("/api/video?id=" + s.id);
    if (!r.ok) return;
    const d = await r.json();
    let changed = false;
    if (d.avatar && !s.avatar){ s.avatar = d.avatar; changed = true; }
    if (d.views != null && s.views == null){ s.views = d.views; changed = true; }
    if (d.channelId && !s.channelId) s.channelId = d.channelId;
    if (d.date && !s.date){ s.date = d.date; changed = true; }
    if (changed) refreshCard(s);
  }catch(e){}
  ensureBatchStats();
}
// ---- סטטיסטיקות רשמיות (לייקים מדויקים — דורש מפתח API, קריאה אחת ל-50 סרטונים) ----
let statsTimer = 0;
function ensureBatchStats(){
  const k = ytKey();
  if (!k) return;
  clearTimeout(statsTimer);
  statsTimer = setTimeout(async () => {
    const ids = [...new Set(view.filter(s => s.source === "yt" && !s._api).map(s => s.id))].slice(0, 50);
    if (!ids.length) return;
    try{
      const r = await fetch("https://www.googleapis.com/youtube/v3/videos?part=statistics&id=" + ids.join(",") + "&key=" + encodeURIComponent(k));
      if (!r.ok) return;
      const j = await r.json();
      (j.items || []).forEach(it => {
        const s = master.find(m => m.source === "yt" && m.id === it.id);
        if (!s) return;
        s._api = true;
        const st = it.statistics || {};
        if (st.likeCount != null) s.ytLikes = parseInt(st.likeCount, 10);
        if (st.viewCount != null) s.views = parseInt(st.viewCount, 10);
        const row = feed.querySelector(`[data-vk="${key(s)}"]`);
        if (row){
          const lc = row.querySelector(".like-count");
          if (lc && s.ytLikes != null){ lc.textContent = fmt(s.ytLikes); lc.style.display = ""; }
          const ml = row.querySelector(".meta-line");
          if (ml) ml.innerHTML = metaLine(s);
        }
      });
    }catch(e){}
  }, 800);
}

function onRowVisible(i){
  if (i < 0 || i >= view.length || !view[i]) return;
  if (wantsPlay !== key(view[i])) wantsPlay = null;
  if (i !== currentIndex){
    const dwell = (Date.now() - enterT) / 1000;
    const prev = view[currentIndex];
    if (prev){
      if (dwell >= 8) bump(prev, Math.min(3, dwell / 10));
      else if (dwell < 1 && dwell > 0.3) bump(prev, -1.5);
      else if (dwell < 2.5 && dwell >= 1) bump(prev, -0.5);
    }
    enterT = Date.now();
    currentIndex = i;
    ensureDetails(view[i]);
  }
  const k = key(view[i]);
  if (!players[k] && ytReady){ wantsPlay = k; createPlayer(view[i]); }
  Object.entries(players).forEach(([pk,p]) => { try { pk === k ? p.playVideo() : p.pauseVideo(); } catch(e){} });
  const np = players[k];
  if (np) setTimeout(() => {
    try{
      const cur = view[currentIndex];
      if (!cur || key(cur) !== k || !np.getPlayerState) return;
      const st = np.getPlayerState();
      if (st === -1 || st === 5) np.playVideo();
    }catch(e){}
  }, 700);
  try { history.replaceState(null, "", "?s=" + shareCode(view[i])); } catch(e){}
  if (i >= view.length - 4) loadMore();
}
const observer = new IntersectionObserver(entries => {
  entries.forEach(en => { if (en.isIntersecting) onRowVisible(+en.target.dataset.index); });
}, { root: feed, threshold: 0.6 });
// גיבוי למקרה שה-observer קפוא (טאב ברקע, דפדפנים משונים): חישוב מתמטי מ-scrollTop
let fallbackTick = 0;
function fallbackCheck(){
  if (!view.length) return;
  const mid = feed.scrollTop + (feed.clientHeight || 600) / 2;
  let best = 0, bestD = Infinity;
  const rows = feed.children;
  for (let n = 0; n < rows.length; n++){
    const r = rows[n];
    if (!r.dataset || r.dataset.index === undefined) continue;
    const d = Math.abs((r.offsetTop + r.offsetHeight / 2) - mid);
    if (d < bestD){ bestD = d; best = +r.dataset.index; }
  }
  if (best !== currentIndex) onRowVisible(best);
}
setInterval(fallbackCheck, 1500);
feed.addEventListener("scroll", () => {
  const now = Date.now();
  if (now - fallbackTick < 800) return;
  fallbackTick = now;
  fallbackCheck();
}, { passive: true });

function shareCode(s){ return s.id; }

function render(){
  destroyPlayers();
  feed.innerHTML = "";
  feedIds = view;
  currentIndex = 0; enterT = Date.now();
  const loader = document.createElement("div");
  loader.className = "loader"; loader.id = "feedLoader";
  loader.textContent = "⬇️ גלול לעוד...";
  feed.appendChild(loader);
  view.forEach((s, i) => buildRow(s, i));
  view.forEach((s, i) => {
    const row = feed.querySelector(`[data-index="${i}"]`);
    if (!row) return;
    observer.observe(row);
    preloader.observe(row);
    if (i < 6 && s.source === "yt" && ytReady) createPlayer(s);
  });
}
// מסדר מחדש רק את מה שעוד לא ראית — בלי לקטוע את הסרטון הנוכחי ובלי לטעון מחדש
function rerankTail(){
  if (!homeMode || view.length < 3) return;
  const cur = Math.min(currentIndex, view.length - 1);
  const head = view.slice(0, cur + 1);
  const tail = view.slice(cur + 1).sort((a,b) => rankKey(b) - rankKey(a));
  view = [...head, ...tail]; feedIds = view;
  const loader = document.getElementById("feedLoader");
  view.forEach((s, i) => {
    const row = feed.querySelector(`[data-vk="${key(s)}"]`);
    if (row){ row.dataset.index = i; if (loader) feed.insertBefore(row, loader); }
  });
}
function appendRows(items){
  items.forEach(s => {
    buildRow(s, view.indexOf(s));
    const row = feed.querySelector(`[data-vk="${key(s)}"]`);
    if (!row) return;
    observer.observe(row);
    preloader.observe(row);
    if (s.source === "yt" && ytReady && view.indexOf(s) < currentIndex + 4) createPlayer(s);
  });
}

function buildRow(s, i){
  const row = document.createElement("div");
  row.className = "short-row";
  row.dataset.index = i;
  row.dataset.vk = key(s);
  const media = `<div class="yt-holder" id="ytp_${s.source}_${esc(s.id)}"></div>`;
  row.innerHTML = `
    <div class="player-card">
      ${media}
      <div class="tap-layer"></div>
      <div class="center-icon show">▶</div>
      <div class="spinner"></div>
      ${s.fresh ? '<div class="new-badge">🆕</div>' : ""}
      <button class="mute-btn" title="קול">🔇</button>
      <button class="spd-btn" title="מהירות ניגון">1×</button>
      <div class="bottom-info">
        <div class="chan" title="פתח את הערוץ">
          <div class="avatar">${s.avatar ? `<img src="${esc(s.avatar)}" alt="" loading="lazy">` : esc((s.channel || "@")[1] || "M")}</div>
          <b>${esc(s.channel)}</b>
          <button class="more-btn" title="עוד שורטס מהערוץ הזה">עוד ▸</button>
        </div>
        <div class="title">${esc(s.title)}</div>
        <div class="meta-line">${metaLine(s)}</div>
      </div>
      <div class="progress"><i></i></div>
    </div>
    <div class="actions">
      <div class="act ${isLiked(s) ? "liked" : ""}">
        <button class="like-btn" title="סימון מקומי (לייק אמיתי ביוטיוב דורש התחברות לגוגל)">${isLiked(s) ? "❤️" : "🤍"}</button><span class="like-count"${s.ytLikes != null ? "" : ' style="display:none"'}>${s.ytLikes != null ? fmt(s.ytLikes) : ""}</span>
      </div>
      <div class="act"><button class="dis-btn">👎</button><span>לא בשבילי</span></div>
      <div class="act"><button class="c-btn">💬</button><span>תגובות</span></div>
      <div class="act"><button class="share-btn">↗️</button><span>שתף</span></div>
    </div>`;
  const loader = document.getElementById("feedLoader");
  if (loader) feed.insertBefore(row, loader); else feed.appendChild(row);

  row.querySelector(".like-btn").onclick = e => {
    e.stopPropagation();
    const on = isLiked(s);
    localStorage.setItem(likeKey(s), on ? "0" : "1");
    e.target.textContent = on ? "🤍" : "❤️";
    e.target.closest(".act").classList.toggle("liked", !on);
    bump(s, on ? -3 : 3);
    if (!on){ pullRelated(s); pullTaste(); }
  };
  row.querySelector(".dis-btn").onclick = e => {
    e.stopPropagation();
    bump(s, -4);
    chanPenalty[s.channel] = (chanPenalty[s.channel] || 0) + 1;
    showToast("הבנתי 👍 נראה לך פחות כאלה");
    setTimeout(() => goTo(currentIndex + 1), 350);
  };
  row.querySelector(".more-btn").onclick = e => { e.stopPropagation(); moreFromChannel(s); };
  row.querySelector(".chan").onclick = e => {
    e.stopPropagation();
    const url = s.channelId ? "https://www.youtube.com/channel/" + s.channelId
      : "https://www.youtube.com/results?search_query=" + encodeURIComponent(s.channel || "");
    window.open(url, "_blank");
    bump(s, 2);
    pullRelated(s);
    pullTaste();
  };
  row.querySelector(".share-btn").onclick = e => {
    e.stopPropagation();
    const link = (location.protocol === "file:" ? location.href.split("?")[0] : location.origin + location.pathname) + "?s=" + shareCode(s);
    navigator.clipboard?.writeText(link).then(() => showToast("הקישור שלך הועתק! 🔗")).catch(() => showToast(link));
    bump(s, 2);
  };
  row.querySelector(".c-btn").onclick = e => { e.stopPropagation(); openComments(s); };
  const icon = row.querySelector(".center-icon");
  row.querySelector(".tap-layer").onclick = () => {
    if (muted){ toggleMute(); document.querySelectorAll(".mute-btn").forEach(b => b.textContent = "🔊"); }
    const elId = "ytp_" + s.source + "_" + s.id;
    if (players[key(s)] && !document.getElementById(elId)) delete players[key(s)];
    if (!players[key(s)]){
      wantsPlay = key(s);
      createPlayer(s);
      if (icon){ icon.textContent = "⏳"; icon.classList.add("show"); }
      return;
    }
    togglePlay(+row.dataset.index, icon);
  };
  row.querySelector(".mute-btn").onclick = e => { e.stopPropagation(); toggleMute(); document.querySelectorAll(".mute-btn").forEach(b => b.textContent = muted ? "🔇" : "🔊"); };
  const spd = row.querySelector(".spd-btn");
  spd.textContent = playSpeed + "×";
  spd.onclick = e => {
    e.stopPropagation();
    const steps = [1, 1.25, 1.5, 2, 0.5];
    playSpeed = steps[(steps.indexOf(playSpeed) + 1) % steps.length];
    Object.values(players).forEach(p => { try { p.setPlaybackRate && p.setPlaybackRate(playSpeed); } catch(_){} });
    document.querySelectorAll(".spd-btn").forEach(b => b.textContent = playSpeed + "×");
    showToast("⏩ מהירות: " + playSpeed + "×");
  };
}

function createPlayer(s){
  const k = key(s);
  if (players[k]) return;
  if (!document.getElementById("ytp_" + s.source + "_" + s.id)) return;
  if (!window.YT?.Player){
    if (!window.__ytLoading){
      window.__ytLoading = true;
      const sc = document.createElement("script");
      sc.src = "https://www.youtube.com/iframe_api";
      document.body.appendChild(sc);
    }
    return;
  }
  try{
    players[k] = new YT.Player("ytp_" + s.source + "_" + s.id, {
      videoId: s.id,
      playerVars: { autoplay: 0, controls: 0, modestbranding: 1, rel: 0, loop: 1, playlist: s.id, playsinline: 1, disablekb: 1, iv_load_policy: 3 },
      events: {
        onReady: e => {
          try { muted ? e.target.mute() : e.target.unMute(); } catch(_){}
          try { if (playSpeed !== 1 && e.target.setPlaybackRate) e.target.setPlaybackRate(playSpeed); } catch(_){}
          // playVideo right at onReady is often swallowed — retry until it takes (never override a real pause)
          [400, 1200, 2500].forEach(ms => setTimeout(() => {
            try{
              const cur = view[currentIndex];
              if (wantsPlay !== k && (!cur || key(cur) !== k)) return;
              if (!e.target.getPlayerState) return;
              const st = e.target.getPlayerState();
              if (st === -1 || st === 5) e.target.playVideo();
              else if (st === 1) wantsPlay = null;
            }catch(_){}
          }, ms));
        },
        onStateChange: e => {
          const row = feed.querySelector(`[data-vk="${k}"]`);
          if (!row) return;
          const ic = row.querySelector(".center-icon");
          const sp = row.querySelector(".spinner");
          if (e.data === YT.PlayerState.PLAYING){
            ic.classList.remove("show");
            if (sp) sp.remove();
          } else if (e.data === YT.PlayerState.PAUSED){
            if (wantsPlay === k) wantsPlay = null;
            ic.textContent = "▶"; ic.classList.add("show");
          } else if (e.data === YT.PlayerState.ENDED){
            const v = master.find(m => key(m) === k);
            if (v){ v._loops = (v._loops || 0) + 1; if (v._loops >= 2 && !v._loopBonus){ v._loopBonus = true; bump(v, 2); } }
            try { e.target.playVideo(); } catch(_){}
          }
        },
        onError: () => {
          const card = feed.querySelector(`[data-vk="${k}"] .player-card`);
          if (card && !card.querySelector(".blocked")){
            const spin = card.querySelector(".spinner");
            if (spin) spin.remove();
            const d = document.createElement("div");
            d.className = "blocked";
            d.innerHTML = `<div style="font-size:44px">🙈</div><p>הסרטון חסם הטמעה.<br>אפשר לצפות ביוטיוב:</p><a href="https://www.youtube.com/shorts/${s.id}" target="_blank">צפה ביוטיוב ▶</a>`;
            card.appendChild(d);
          }
        }
      }
    });
  }catch(e){}
}

window.onYouTubeIframeAPIReady = () => {
  ytReady = true;
  feed.querySelectorAll(".short-row").forEach(row => {
    const s = view[+row.dataset.index];
    if (s && s.source === "yt" && !players[key(s)] && nearViewport(row)) createPlayer(s);
  });
  setInterval(updateProgress, 300);
};

function togglePlay(i, icon){
  const s = view[i];
  const p = s && players[key(s)];
  if (!p?.getPlayerState) return;
  if (p.getPlayerState() === YT.PlayerState.PLAYING) p.pauseVideo();
  else { p.playVideo(); if (icon){ icon.textContent = "▶"; icon.classList.add("show"); setTimeout(() => icon.classList.remove("show"), 500); } }
}
function toggleMute(){
  muted = !muted;
  Object.values(players).forEach(p => { try { muted ? p.mute() : (p.unMute(), p.setVolume(80)); } catch(e){} });
  showToast(muted ? "🔇 שקט" : "🔊 יש קול!");
}
function updateProgress(){
  const s = view[currentIndex];
  const p = s && players[key(s)];
  try{
    if (p?.getDuration){
      const d = p.getDuration(), t = p.getCurrentTime();
      if (d){
        feed.querySelector(`[data-index="${currentIndex}"] .progress i`)?.style.setProperty("width", (t/d*100) + "%");
        const sc = view[currentIndex];
        if (sc && !sc._watchBonus && t / d > 0.8){ sc._watchBonus = true; bump(sc, 2); }
      }
    }
  }catch(e){}
}
function goTo(i){
  i = Math.max(0, Math.min(view.length - 1, i));
  feed.querySelector(`[data-index="${i}"]`)?.scrollIntoView({ behavior: "smooth" });
}
document.addEventListener("keydown", e => {
  if (e.target.tagName === "INPUT") return;
  if (e.key === "ArrowDown"){ e.preventDefault(); goTo(currentIndex + 1); }
  if (e.key === "ArrowUp"){ e.preventDefault(); goTo(currentIndex - 1); }
  if (e.code === "Space"){ e.preventDefault(); const r = feed.querySelector(`[data-index="${currentIndex}"]`); if (r) togglePlay(currentIndex, r.querySelector(".center-icon")); }
  if (e.key === "m" || e.key === "M") toggleMute();
});

// ================= סינון מקור =================
function applyView(){
  let v = [...master];
  v = [...v].sort((a,b) => rankKey(b) - rankKey(a));
  if (pinnedKey){
    const idx = v.findIndex(s => key(s) === pinnedKey);
    if (idx > 0){ const [d] = v.splice(idx, 1); v.unshift(d); }
  }
  view = v; feedIds = view;
  render();
}
function goHome(){
  homeMode = true;
  document.querySelectorAll("#pills button").forEach(x => x.classList.remove("on"));
  document.querySelector('#pills button[data-q="#shorts"]')?.classList.add("on");
  applyView(); goTo(0);
}
document.querySelector(".logo").onclick = goHome;

// ================= טעינה / אינסוף / רענון =================
function setLive(txt){ if (liveStatus) liveStatus.textContent = txt; }
// עוד שורטס מהערוץ הזה — נמשך אמיתי מדף השורטס של הערוץ ביוטיוב
async function moreFromChannel(s){
  if (!s.channelId || !location.protocol.startsWith("http")) return showToast("אין מזהה ערוץ לסרטון הזה");
  showToast("⏳ מביא עוד " + (s.channel || "מהערוץ") + "...");
  try{
    const list = await (await fetch("/api/channel?id=" + s.channelId)).json();
    const fresh = (Array.isArray(list) ? list : []).filter(x => !seen.has(key(x)));
    if (!fresh.length) return showToast("זה כל מה שיש לערוץ כרגע");
    fresh.forEach(x => addVideo(x));
    fresh.forEach(x => view.push(x));
    feedIds = view;
    appendRows(fresh);
    rerankTail();
    showToast(`➕ נוספו ${fresh.length} שורטס של ${s.channel}`);
  }catch(e){ showToast("נכשל — נסה שוב"); }
}
// טיימר שינה — עוצר את הניגון אחרי X דקות
let sleepTimer = 0;
const sleepSteps = [0, 15, 30, 60];
let sleepIdx = 0;
function initSleep(){
  const b = document.getElementById("sleepBtn");
  if (!b) return;
  b.style.opacity = ".5";
  b.onclick = () => {
    clearTimeout(sleepTimer);
    sleepIdx = (sleepIdx + 1) % sleepSteps.length;
    const m = sleepSteps[sleepIdx];
    b.style.opacity = m ? "1" : ".5";
    if (!m) return showToast("⏲ טיימר כבוי");
    showToast(`⏲ אעצור בעוד ${m} דקות`);
    sleepTimer = setTimeout(() => {
      const s = view[currentIndex];
      const p = s && players[key(s)];
      try { p && p.pauseVideo && p.pauseVideo(); } catch(e){}
      showToast("😴 לילה טוב — נעצר");
      sleepIdx = 0;
      b.style.opacity = ".5";
    }, m * 60 * 1000);
  };
}
function parseDeep(){
  const v = new URLSearchParams(location.search).get("s");
  if (!v) return null;
  if (/^[A-Za-z0-9_-]{6,15}$/.test(v)) return { id: v, title: "שורט משותף 🔗 " + v, channel: "@shared", likes: 1000, source: "yt" };
  return null;
}

async function initialLoad(){
  updateTaste();
  initSleep();
  homeMode = true;
  const deep = parseDeep();
  if (deep){ addVideo(deep); pinnedKey = key(deep); }
  FALLBACK.forEach(s => addVideo({ ...s }));
  applyView();
  liveStatus.style.cursor = "pointer";
  liveStatus.title = "לחץ לנסות להתחבר שוב";
  liveStatus.onclick = () => retryLive(true);
  setLive("⏳ מושך ישירות מיוטיוב...");
  try{
    let live = await fetchTrendingLive();
    if (live.filter(s => !seen.has(key(s))).length < 8){
      const extra = await fetchSearchLive("#shorts").catch(() => []);
      live = [...live, ...extra];
    }
    const fresh = live.filter(s => !seen.has(key(s)));
    if (fresh.length){
      fresh.forEach(s => addVideo(s));
      applyView();
      setLive(`🔴 LIVE • ${fresh.length} שורטס חיים נטענו • מתרענן כל 5 דק׳`);
      showToast(`🔴 נטענו ${fresh.length} שורטס חיים!`);
    } else setLive("⚠️ הטרנדים ריקים כרגע — לחץ כאן לנסות שוב 🔄");
  }catch(e){ setLive("⚠️ אין חיבור ל-LIVE — לחץ כאן לנסות שוב 🔄"); }
  setTimeout(() => {
    if (!window.YT || !window.YT.Player) showToast("⚠️ נגן יוטיוב לא נטען — בדוק חיבור ורענן (F5)");
    else if (!view.length) showToast("אין סרטונים — לחץ על שורת הסטטוס לנסות שוב");
  }, 9000);
}

let loadingMore = false;
async function loadMore(){
  if (loadingMore || !homeMode) return;
  loadingMore = true;
  try{
    const q = MORE_QUERIES[queryCursor++ % MORE_QUERIES.length];
    const more = await fetchSearchLive(q);
    const added = more.filter(s => addVideo(s));
    if (added.length){
      added.forEach(s => view.push(s));
      feedIds = view;
      appendRows(added);
      rerankTail();
      setLive(`🔴 LIVE • ${master.length} סרטונים בפיד • מתרענן כל 5 דק׳`);
    }
  }catch(e){}
  loadingMore = false;
}
setInterval(async () => {
  if (!homeMode) return;
  try{
    const live = await fetchTrendingLive();
    const fresh = live.filter(s => !seen.has(key(s)));
    if (!fresh.length) return;
    fresh.forEach(s => { addVideo(s); view.push(s); });
    feedIds = view;
    appendRows(fresh);
    rerankTail();
    setLive(`🔴 LIVE • ${fresh.length} שורטס חדשים דורגו לפי הטעם שלך • סה״כ ${master.length}`);
    showToast(`🔥 ${fresh.length} שורטס חדשים עלו!`);
    pullTaste();
  }catch(e){}
}, 5 * 60 * 1000);

// ================= חיפוש / קישורים / קטגוריות =================
function parseYT(url){
  const m = String(url).match(/(?:shorts\/|youtu\.be\/|v=|embed\/)([A-Za-z0-9_-]{6,15})/);
  return m ? m[1] : null;
}
async function doSearch(){
  const v = document.getElementById("addLinkInput").value.trim();
  if (!v) return;
  const yt = parseYT(v);
  if (yt){
    if (location.protocol.startsWith("http")){
      showToast("⏳ בודק שזה שורט...");
      try{
        const r = await fetch("/api/video?id=" + yt);
        const d = await r.json();
        if (d && d.isShort === false){ showToast("זה סרטון רגיל, לא שורט — האתר מציג רק שורטס"); return; }
      }catch(e){}
    }
    location.href = location.pathname + "?s=" + yt; return;
  }
  homeMode = false;
  showToast("🔍 מחפש " + v + "...");
  try{
    const res = await fetchSearchLive(v + " #shorts");
    if (!res.length) return showToast("לא נמצאו שורטס 😕");
    res.forEach(s => addVideo(s));
    view = res.filter(s => master.includes(s));
    feedIds = view; render(); goTo(0);
    showToast(`נמצאו ${res.length} שורטס ל־"${v}"`);
  }catch(e){ showToast("החיפוש נכשל — נסה שוב"); }
}
document.getElementById("addLinkBtn").onclick = doSearch;
document.getElementById("addLinkInput").addEventListener("keydown", e => { if (e.key === "Enter") doSearch(); });
document.getElementById("pills").addEventListener("click", async e => {
  const b = e.target.closest("button[data-q]");
  if (!b) return;
  document.querySelectorAll("#pills button").forEach(x => x.classList.remove("on"));
  b.classList.add("on");
  const q = b.dataset.q;
  homeMode = false;
  showToast("🔍 טוען " + b.textContent + "...");
  try{
    const res = await fetchSearchLive(q);
    if (!res.length) return showToast("לא נמצא 😕");
    res.forEach(s => addVideo(s));
    view = res.filter(s => master.includes(s));
    feedIds = view; render(); goTo(0);
  }catch(e){ showToast("נכשל — נסה שוב"); }
});

// ---- פאנל מפתח API ----
const keyPanel = document.getElementById("keyPanel");
function refreshKeyState(){
  const has = !!ytKey();
  document.getElementById("keyState").textContent = has ? "🟢 מפתח שמור — חיבור רשמי פעיל" : "⚪ בלי מפתח — מושך ישירות דרך השרת המקומי";
  const inp = document.getElementById("keyInput");
  if (document.activeElement !== inp) inp.value = ytKey();
}
document.getElementById("keyBtn").onclick = e => { e.stopPropagation(); keyPanel.classList.toggle("open"); refreshKeyState(); };
document.addEventListener("click", e => { if (!e.target.closest("#keyPanel") && !e.target.closest("#keyBtn")) keyPanel.classList.remove("open"); });
document.getElementById("saveKey").onclick = () => {
  const v = document.getElementById("keyInput").value.trim();
  if (!v) return showToast("הדבק מפתח קודם");
  try { localStorage.setItem("ms_ytkey", v); } catch(e){}
  refreshKeyState();
  keyPanel.classList.remove("open");
  showToast("🔑 נשמר! מחבר רשמית...");
  retryLive(true);
};
document.getElementById("delKey").onclick = () => { try { localStorage.removeItem("ms_ytkey"); } catch(e){} refreshKeyState(); showToast("המפתח נמחק"); };

// ================= תגובות אמיתיות (דורש מפתח — יוטיוב לא חושף תגובות בלעדיו) =================
const drawer = document.getElementById("commentsDrawer");
const backdrop = document.getElementById("drawerBackdrop");
let commentVideo = null;
function timeAgo(iso){
  const t = (Date.now() - new Date(iso).getTime()) / 1000;
  if (!(t >= 0)) return "";
  if (t < 60) return "לפני פחות מדקה";
  if (t < 3600){ const m = Math.floor(t/60); return m <= 1 ? "לפני דקה" : m === 2 ? "לפני שתי דקות" : `לפני ${m} דקות`; }
  if (t < 86400){ const h = Math.floor(t/3600); return h === 1 ? "לפני שעה" : h === 2 ? "לפני שעתיים" : `לפני ${h} שעות`; }
  if (t < 86400*30){ const d = Math.floor(t/86400); return d === 1 ? "אתמול" : d === 2 ? "לפני יומיים" : `לפני ${d} ימים`; }
  if (t < 86400*365){ const mo = Math.floor(t/(86400*30)); return mo <= 2 ? "לפני חודש" + (mo === 2 ? "יים" : "") : `לפני ${mo} חודשים`; }
  const y = Math.floor(t/(86400*365)); return y === 1 ? "לפני שנה" : y === 2 ? "לפני שנתיים" : `לפני ${y} שנים`;
}
async function openComments(s){
  commentVideo = key(s);
  const list = document.getElementById("commentsList");
  drawer.classList.add("open"); backdrop.classList.add("show");
  const k = ytKey();
  if (!k){
    document.getElementById("commentsCount").textContent = "";
    list.innerHTML = `<div class="no-key"><div style="font-size:40px">💬</div>
      <p><b>תגובות אמיתיות</b> דורשות מפתח YouTube חינמי.</p>
      <p>יוטיוב לא חושף תגובות בלי מפתח רשמי — ואני לא ממציא תגובות.</p>
      <button id="goKey">הוסף מפתח 🔑 (2 דקות, חינם)</button></div>`;
    document.getElementById("goKey").onclick = () => { drawer.classList.remove("open"); backdrop.classList.remove("show"); keyPanel.classList.add("open"); refreshKeyState(); };
    return;
  }
  document.getElementById("commentsCount").textContent = "…";
  list.innerHTML = `<div class="loader">⏳ טוען תגובות אמיתיות מיוטיוב...</div>`;
  try{
    const r = await fetch("https://www.googleapis.com/youtube/v3/commentThreads?part=snippet&videoId=" + s.id + "&maxResults=30&order=relevance&key=" + encodeURIComponent(k));
    if (!r.ok) throw new Error(String(r.status));
    const j = await r.json();
    const items = j.items || [];
    document.getElementById("commentsCount").textContent = items.length ? items.length + "+" : "";
    list.innerHTML = "";
    if (!items.length) list.innerHTML = `<div class="loader">אין תגובות פתוחות לסרטון הזה.</div>`;
    items.forEach(it => {
      const sn = it.snippet.topLevelComment.snippet;
      const d = document.createElement("div");
      d.className = "comment";
      d.innerHTML = `<div class="avatar small">${sn.authorProfileImageUrl ? `<img src="${esc(sn.authorProfileImageUrl)}" alt="" loading="lazy">` : esc(String(sn.authorDisplayName || "?")[0])}</div><div class="body"><b></b><span class="c-time"></span><p></p><span class="c-likes"></span></div>`;
      d.querySelector("b").textContent = "@" + sn.authorDisplayName;
      d.querySelector(".c-time").textContent = " • " + timeAgo(sn.publishedAt);
      d.querySelector("p").textContent = sn.textDisplay;
      d.querySelector(".c-likes").textContent = sn.likeCount ? "👍 " + fmt(sn.likeCount) : "";
      list.appendChild(d);
    });
  }catch(e){
    document.getElementById("commentsCount").textContent = "";
    list.innerHTML = `<div class="loader">התגובות חסומות לסרטון הזה או שהמפתח לא תקין.</div>`;
  }
}
document.getElementById("closeComments").onclick = () => { drawer.classList.remove("open"); backdrop.classList.remove("show"); };
backdrop.onclick = () => { drawer.classList.remove("open"); backdrop.classList.remove("show"); };

initialLoad();
