/* ICAO 4 Trainer — service worker: offline cache + daily reminder */
var CACHE = "icao4-v2";

self.addEventListener("install", function(e){
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(function(c){ return c.addAll(["./", "./index.html", "./icon-192.png"]); }).catch(function(){}));
});

self.addEventListener("activate", function(e){
  e.waitUntil((async function(){
    var keys = await caches.keys();
    for (var i=0;i<keys.length;i++){
      if (keys[i]!==CACHE && keys[i]!=="icao4-cfg") await caches.delete(keys[i]);
    }
    await self.clients.claim();
  })());
});

/* network-first для index.html: обновления подтягиваются сами, офлайн — из кэша */
self.addEventListener("fetch", function(e){
  if (e.request.mode === "navigate" || /index\.html$/.test(e.request.url)) {
    e.respondWith(
      fetch(e.request).then(function(r){
        var cp = r.clone();
        caches.open(CACHE).then(function(c){ c.put("./index.html", cp); });
        return r;
      }).catch(function(){ return caches.match("./index.html"); })
    );
    return;
  }
  e.respondWith(
    caches.match(e.request).then(function(r){ return r || fetch(e.request); })
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
