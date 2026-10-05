// One-tap installer: downloads the latest AS-Player from GitHub and saves it as the
// Scriptable script "AS-Player" (replacing the old one). Run it again any time to update.
const URL = "https://raw.githubusercontent.com/iamrichardmaier-sudo/arab-spring-podcast/claude/brave-albattani-gmyx04/scriptable/AS-Player.js";

let fm = FileManager.iCloud();
try { fm.documentsDirectory(); } catch (e) { fm = FileManager.local(); }
const path = fm.joinPath(fm.documentsDirectory(), "AS-Player.js");

const a = new Alert();
try {
  const r = new Request(URL + "?t=" + Date.now());
  const code = await r.loadString();
  if (r.response.statusCode !== 200 || code.indexOf("AL-RABI") < 0) throw new Error("HTTP " + r.response.statusCode);
  fm.writeString(path, code);
  a.title = "AS-Player installed";
  a.message = "Updated (" + Math.round(code.length / 1024) + " KB). Open AS-Player now?";
  a.addAction("Open");
  a.addCancelAction("Later");
  if ((await a.present()) === 0) Safari.open("scriptable:///run/AS-Player");
} catch (e) {
  a.title = "Install failed";
  a.message = String(e);
  a.addAction("OK");
  await a.present();
}
Script.complete();
