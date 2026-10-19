/* ICAO 4 Trainer — service worker: offline cache + daily reminder */
var CACHE = "icao4-v3";
var IMG = "icao4-img";   /* картинки Wikimedia — кэш навсегда, для офлайна */

self.addEventListener("install", function(e){
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(function(c){ return c.addAll(["./", "./index.html", "./mock.html", "./icon-192.png"]); }).catch(function(){}));
});

self.addEventListener("activate", function(e){
  e.waitUntil((async function(){
    var keys = await caches.keys();
    for (var i=0;i<keys.length;i++){
      if (keys[i]!==CACHE && keys[i]!=="icao4-cfg" && keys[i]!==IMG) await caches.delete(keys[i]);
    }
    await self.clients.claim();
  })());
});

function pageKey(url){
  var u = new URL(url);
  return /mock\.html$/.test(u.pathname) ? "./mock.html" : "./index.html";
}

self.addEventListener("fetch", function(e){
  var req = e.request, url = req.url;
  /* страницы (index.html, mock.html): сначала сеть, офлайн — из кэша */
  if (req.mode === "navigate" || /\/(index|mock)\.html(\?|$)/.test(url)) {
    var key = pageKey(url);
    e.respondWith(
      fetch(req).then(function(r){
        if (r && r.ok) { var cp = r.clone(); caches.open(CACHE).then(function(c){ c.put(key, cp); }); }
        return r;
      }).catch(function(){
        return caches.match(key).then(function(r){ return r || caches.match("./index.html"); });
      })
    );
    return;
  }
  /* картинки Wikimedia: из кэша, если есть; иначе скачать и сохранить */
  if (/^https:\/\/(commons|upload)\.wikimedia\.org\//.test(url) && req.method === "GET") {
    e.respondWith(
      caches.open(IMG).then(function(c){
        return c.match(req).then(function(hit){
          if (hit) return hit;
          return fetch(req).then(function(r){
            if (r && (r.ok || r.type === "opaque")) c.put(req, r.clone());
            return r;
          });
        });
      })
    );
    return;
  }
  e.respondWith(
    caches.match(req).then(function(r){ return r || fetch(req); })
  );
});

/* конфиг напоминаний хранится в Cache Storage (localStorage в SW недоступен) */
async function getCfg(){
  try { var c = await caches.open("icao4-cfg"); var r = await c.match("cfg"); return r ? await r.json() : {}; }
  catch(e){ return {}; }
}
async function setCfg(cfg){
  var c = await caches.open("icao4-cfg");
  await c.put("cfg", new Response(JSON.stringify(cfg)));
}

self.addEventListener("message", function(e){
  var d = e.data;
  if (d && d.type === "cfg") {
    e.waitUntil((async function(){
      var cfg = await getCfg();
      cfg.reminderHour = d.reminderHour;
      cfg.enabled = d.enabled;
      if (d.body) cfg.body = d.body;
      await setCfg(cfg);
    })());
  }
});

self.addEventListener("periodicsync", function(e){
  if (e.tag !== "icao4-reminder") return;
  e.waitUntil((async function(){
    var cfg = await getCfg();
    if (cfg.enabled === false) return;
    var now = new Date();
    var today = now.getFullYear()+"-"+("0"+(now.getMonth()+1)).slice(-2)+"-"+("0"+now.getDate()).slice(-2);
    var hour = (cfg.reminderHour == null) ? 19 : cfg.reminderHour;
    if (now.getHours() >= hour && cfg.lastNotif !== today) {
      cfg.lastNotif = today;
      await setCfg(cfg);
      await self.registration.showNotification("ICAO 4 Trainer ✈️", {
        body: cfg.body || "Пора заниматься! План на сегодня ждёт — 20 минут в день держат форму до экзамена.",
        icon: "./icon-192.png",
        badge: "./icon-192.png",
        tag: "icao4-daily"
      });
    }
  })());
});

self.addEventListener("notificationclick", function(e){
  e.notification.close();
  e.waitUntil(self.clients.matchAll({type:"window", includeUncontrolled:true}).then(function(cs){
    if (cs.length) return cs[0].focus();
    return self.clients.openWindow("./");
  }));
});
