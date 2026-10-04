// AL-RABI' Review — Arab Spring flashcards (Scriptable, iPhone)
// Paste into a new Scriptable script named exactly:  AS-Cards
// Cards unlock as you finish episodes in AS-Player (shared progress file).

const BASE = "https://iamrichardmaier-sudo.github.io/arab-spring-podcast/"; // <- change if your Pages URL differs
const STATE_FILE = "arab-spring-progress.json";

let fm = FileManager.iCloud();
try { fm.documentsDirectory(); } catch (e) { fm = FileManager.local(); }
const dir = fm.documentsDirectory();
const P = (n) => fm.joinPath(dir, n);

async function readJSON(name, fallback) {
  const p = P(name);
  try {
    if (fm.fileExists(p)) {
      try { if (fm.isFileStoredIniCloud(p) && !fm.isFileDownloaded(p)) await fm.downloadFileFromiCloud(p); } catch (e) {}
      return JSON.parse(fm.readString(p));
    }
  } catch (e) {}
  return fallback;
}
function writeJSON(name, obj) { fm.writeString(P(name), JSON.stringify(obj)); }

async function fetchData(file, cacheName, fallback) {
  try {
    const r = new Request(BASE + file + "?t=" + Date.now());
    r.timeoutInterval = 10;
    const j = await r.loadJSON();
    if (j) { writeJSON(cacheName, j); return j; }
  } catch (e) {}
  return await readJSON(cacheName, fallback);
}

// An episode's cards unlock when every earlier episode is finished.
// Episode 1 is always open, so unlocked = 1 + number of leading finished episodes.
function unlockInfo(eps, finished) {
  let k = 0;
  while (k < eps.length && finished.indexOf(eps[k].id) > -1) k++;
  const open = Math.min(k + 1, eps.length);
  return { openIds: eps.slice(0, open).map((e) => e.id), next: eps[open] && k < eps.length ? eps[Math.min(k, eps.length - 1)] : null, finishedCount: k };
}

async function buildWidget(eps, cards, st) {
  const w = new ListWidget();
  w.backgroundColor = new Color("#f7f2ea");
  w.setPadding(14, 14, 14, 14);
  const info = unlockInfo(eps, st.finished || []);
  const unlocked = cards.filter((c) => info.openIds.indexOf(c.ep) > -1);
  const cs = st.cards || {};
  const left = (cs.queue || []).length;
  const t = w.addText("ARAB SPRING REVIEW"); t.font = Font.boldSystemFont(11); t.textColor = new Color("#b3541f");
  w.addSpacer(6);
  const big = w.addText(String(left || unlocked.length)); big.font = Font.boldSystemFont(34); big.textColor = new Color("#2a2420");
  const sub = w.addText(left ? "cards left this pass" : "cards unlocked"); sub.font = Font.systemFont(12); sub.textColor = new Color("#7a6e66");
  w.addSpacer();
  const f = w.addText("Pass " + (cs.pass || 1) + " \u00B7 " + unlocked.length + " unlocked"); f.font = Font.systemFont(11); f.textColor = new Color("#7a6e66");
  w.url = URLScheme.forRunningScript();
  return w;
}

function pageHTML(payload) {
  const data = JSON.stringify(payload).replace(/</g, "\\u003c");
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Amiri:wght@400;700&display=swap" rel="stylesheet">
<style>
:root{--background:36 33% 97%;--foreground:24 10% 15%;--card:36 40% 95%;--primary:24 70% 45%;--primary-foreground:36 33% 97%;--muted:36 20% 92%;--muted-foreground:24 8% 50%;--border:36 20% 88%;--destructive:0 65% 52%;--success:145 50% 42%;--info:210 60% 50%;--shadow:0 2px 8px -2px hsl(24 20% 20% / .08),0 6px 20px -4px hsl(24 20% 20% / .06)}
@media (prefers-color-scheme:dark){:root{--background:24 12% 10%;--foreground:36 20% 92%;--card:24 10% 14%;--primary:24 75% 58%;--primary-foreground:24 15% 10%;--muted:24 8% 18%;--muted-foreground:36 8% 62%;--border:24 10% 24%;--destructive:0 62% 55%;--success:145 45% 48%;--shadow:0 2px 8px -2px hsl(0 0% 0% / .5),0 6px 20px -4px hsl(0 0% 0% / .4)}}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
html,body{margin:0;background:hsl(var(--background));color:hsl(var(--foreground));font-family:Inter,-apple-system,sans-serif;min-height:100%}
body{padding:calc(env(safe-area-inset-top) + 12px) 16px calc(env(safe-area-inset-bottom) + 20px)}
.wrap{max-width:448px;margin:0 auto}
.top{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:10px}
.top b{font-size:18px}.top span{font-size:12px;color:hsl(var(--muted-foreground))}
.bar{height:6px;border-radius:99px;background:hsl(var(--muted));overflow:hidden}
.bar i{display:block;height:100%;background:hsl(var(--primary));transition:width .3s}
.cnt{text-align:center;font-size:12px;color:hsl(var(--muted-foreground));margin:6px 0 14px;font-variant-numeric:tabular-nums}
.sw{position:relative;touch-action:pan-y}
.pers{perspective:1000px}
.card{position:relative;width:100%;min-height:340px;transform-style:preserve-3d;transition:transform .45s}
.card.flip{transform:rotateY(180deg)}
.face{position:absolute;inset:0;backface-visibility:hidden;-webkit-backface-visibility:hidden;border-radius:16px;background:hsl(var(--card));border:1px solid hsl(var(--border) / .5);box-shadow:var(--shadow);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:26px 22px;text-align:center;overflow:auto}
.back{transform:rotateY(180deg)}
.tag{font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:hsl(var(--primary));background:hsl(var(--primary) / .12);border-radius:99px;padding:4px 10px;margin-bottom:16px}
.front-t{font-size:32px;font-weight:700;line-height:1.2}
.ep{font-size:11px;color:hsl(var(--muted-foreground));margin-top:14px}
.hint{font-size:13px;color:hsl(var(--muted-foreground));margin-top:22px}
.small-q{font-size:15px;color:hsl(var(--muted-foreground));margin-bottom:10px}
.hr{width:100%;height:1px;background:hsl(var(--border));margin:10px 0 14px}
.ans{font-size:17px;line-height:1.5}
.arb{font-family:Amiri,serif;font-size:44px;line-height:1.5;margin:6px 0}
.link{font-size:12px;line-height:1.45;color:hsl(var(--muted-foreground));margin-top:14px}.link b{color:hsl(var(--primary))}
.btns{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px}
.btns button{border:0;border-radius:12px;padding:14px 8px;font-weight:600;font-size:15px;font-family:inherit;color:#fff}
.miss{background:hsl(var(--destructive))}.got{background:hsl(var(--success))}
.tip{font-size:11px;text-align:center;color:hsl(var(--muted-foreground));margin-top:8px}
.badge{position:absolute;top:12px;left:50%;transform:translateX(-50%);z-index:5;border-radius:99px;padding:6px 16px;font-weight:700;font-size:14px;color:#fff;display:none}
.box{background:hsl(var(--card));border:1px solid hsl(var(--border));border-radius:16px;padding:28px 22px;text-align:center;box-shadow:var(--shadow)}
.box h2{margin:0 0 8px}.box p{color:hsl(var(--muted-foreground));font-size:14px;line-height:1.5}
.pri{border:0;background:hsl(var(--primary));color:hsl(var(--primary-foreground));border-radius:12px;padding:14px 22px;font-weight:600;font-size:15px;margin-top:12px;font-family:inherit}
.lock{margin-top:16px;font-size:12px;text-align:center;color:hsl(var(--muted-foreground))}
</style></head><body><div class="wrap">
<div class="top"><b>Arab Spring Review</b><span id="pass"></span></div>
<div id="main"></div><div class="lock" id="lock"></div></div>
<script>
var DATA=${data};
var cards=DATA.cards,byId={};cards.forEach(function(c){byId[c.id]=c});
var C=DATA.cardState||{pass:1,queue:[],done:[],missed:[],stats:{}};
C.queue=C.queue||[];C.done=C.done||[];C.missed=C.missed||[];C.stats=C.stats||{};C.pass=C.pass||1;
window.AS_STATE=C;
var flipped=false;
function shuffle(a){a=a.slice();for(var i=a.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1));var t=a[i];a[i]=a[j];a[j]=t}return a}
function $(i){return document.getElementById(i)}
function esc(s){return String(s==null?"":s).replace(/[&<>"]/g,function(m){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[m]})}
function reconcile(){
  var ok=function(i){return !!byId[i]};
  C.queue=C.queue.filter(ok);C.done=C.done.filter(ok);C.missed=C.missed.filter(ok);
  var known={};C.queue.concat(C.done).forEach(function(i){known[i]=1});
  var fresh=cards.filter(function(c){return !known[c.id]}).map(function(c){return c.id});
  if(!C.queue.length&&!C.done.length){C.queue=shuffle(fresh)}
  else{fresh.forEach(function(id){var p=Math.floor(Math.random()*(C.queue.length+1));C.queue.splice(p,0,id)})}
}
function rate(good){
  var id=C.queue.shift();if(!id)return;C.done.push(id);
  var s=C.stats[id]||(C.stats[id]={ok:0,miss:0});
  if(good){s.ok++}else{s.miss++;C.missed.push(id)}
  flipped=false;show();
}
function nextPass(){
  var miss=C.missed.slice(),all=C.done.slice();
  var rest=all.filter(function(i){return miss.indexOf(i)<0});
  C.queue=shuffle(miss).concat(shuffle(rest));C.done=[];C.missed=[];C.pass++;flipped=false;show();
}
function cardHTML(c){
  var left=C.queue.length+C.done.length;
  return '<div class="bar"><i style="width:'+(left?C.done.length/left*100:0)+'%"></i></div>'+
  '<div class="cnt">'+(C.done.length+1)+' of '+left+'</div>'+
  '<div class="sw" id="sw"><span class="badge" id="badge"></span><div class="pers"><div class="card'+(flipped?' flip':'')+'" id="card">'+
  '<div class="face front"><span class="tag">'+esc(c.type)+'</span><div class="front-t">'+esc(c.front)+'</div><div class="ep">'+esc(c.epLabel)+'</div><div class="hint">Tap to flip</div></div>'+
  '<div class="face back"><div class="small-q">'+esc(c.front)+'</div><div class="hr"></div><div class="ans">'+esc(c.back)+'</div>'+
  (c.ar?'<div class="arb" dir="rtl">'+esc(c.ar)+'</div>':'')+
  (c.link?'<div class="link"><b>Connect it:</b> '+esc(c.link)+'</div>':'')+'</div></div></div></div>'+
  '<div class="btns" id="btns" style="visibility:'+(flipped?'visible':'hidden')+'"><button class="miss" id="bm">Missed it</button><button class="got" id="bg">Got it</button></div>'+
  '<div class="tip">Flip the card, then swipe left (missed) or right (got it).</div>';
}
function show(){
  $("pass").textContent="Pass "+C.pass+" \u00B7 "+cards.length+" cards unlocked";
  $("lock").textContent=DATA.lockMsg||"";
  var m=$("main");
  if(!cards.length){m.innerHTML='<div class="box"><h2>No cards yet</h2><p>Cards for the next episode are not added yet.</p></div>';return}
  if(!C.queue.length){
    var got=C.done.length-C.missed.length;
    m.innerHTML='<div class="box"><h2>Pass '+C.pass+' complete</h2><p>'+got+' got it \u00B7 '+C.missed.length+' missed. Every card was shown once. Missed cards come back first next pass.</p><button class="pri" id="np">Start pass '+(C.pass+1)+'</button></div>';
    $("np").onclick=nextPass;return}
  m.innerHTML=cardHTML(byId[C.queue[0]]);
  var card=$("card");card.onclick=function(){flipped=!flipped;card.className="card"+(flipped?" flip":"");$("btns").style.visibility=flipped?"visible":"hidden"};
  $("bm").onclick=function(e){e.stopPropagation();rate(false)};$("bg").onclick=function(e){e.stopPropagation();rate(true)};
  var sw=$("sw"),x0=null,y0=null,dx=0;
  sw.onpointerdown=function(e){if(!flipped)return;x0=e.clientX;y0=e.clientY;dx=0};
  sw.onpointermove=function(e){if(x0===null)return;dx=e.clientX-x0;sw.style.transform="translateX("+dx+"px) rotate("+dx*0.03+"deg)";
    var b=$("badge");if(Math.abs(dx)>90){b.style.display="block";b.textContent=dx>0?"Got it":"Missed it";b.style.background=dx>0?"hsl(var(--success))":"hsl(var(--destructive))"}else b.style.display="none"};
  sw.onpointerup=sw.onpointercancel=function(){if(x0===null)return;var d=dx;x0=null;sw.style.transform="";if(Math.abs(d)>=90&&flipped)rate(d>0)};
}
cards.forEach(function(c){c.epLabel=(c.epName||c.ep)});
reconcile();show();
</script></body></html>`;
}

async function main() {
  const epData = await fetchData("episodes.json", "as-episodes-cache.json", { episodes: [] });
  const cardData = await fetchData("cards.json", "as-cards-cache.json", { cards: [] });
  const st = await readJSON(STATE_FILE, {});
  st.finished = st.finished || [];
  const eps = epData.episodes;
  if (config.runsInWidget) {
    Script.setWidget(await buildWidget(eps, cardData.cards, st));
    Script.complete();
    return;
  }
  const info = unlockInfo(eps, st.finished);
  const epName = {};
  eps.forEach((e) => { epName[e.id] = e.moduleName + " \u00B7 Ep " + e.n; });
  const unlocked = cardData.cards.filter((c) => info.openIds.indexOf(c.ep) > -1).map((c) => Object.assign({}, c, { epName: epName[c.ep] }));
  const nextEp = eps[info.openIds.length];
  const lockedHere = nextEp ? cardData.cards.filter((c) => c.ep === nextEp.id).length : 0;
  const curEp = eps[info.openIds.length - 1];
  const lockMsg = nextEp
    ? "Finish " + curEp.moduleName + " Ep " + curEp.n + " (\u201C" + curEp.title + "\u201D) in the player to unlock " + nextEp.moduleName + " Ep " + nextEp.n + (lockedHere ? " (" + lockedHere + " cards)" : "") + "."
    : "All episodes unlocked.";
  const wv = new WebView();
  await wv.loadHTML(pageHTML({ cards: unlocked, cardState: st.cards || null, lockMsg: lockMsg }), BASE);
  let open = true;
  const shown = wv.present(true).then(() => { open = false; });
  while (open) {
    await new Promise((r) => Timer.schedule(2000, false, r));
    try {
      const raw = await wv.evaluateJavaScript("JSON.stringify(window.AS_STATE||null)", false);
      const s = JSON.parse(raw);
      if (s && s.queue) {
        const all = await readJSON(STATE_FILE, {});
        all.cards = s;
        writeJSON(STATE_FILE, all);
      }
    } catch (e) {}
  }
  await shown;
  Script.complete();
}
await main();
