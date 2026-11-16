import re, sys, json
src, out = sys.argv[1], sys.argv[2]
s = open(src).read()
s = s[s.index('<!doctype html>', 10):].rstrip()
while s.endswith('</body></html>'): s = s[:-len('</body></html>')].rstrip()
s += '\n'
R = '/home/claude/raffi-app/src/'
def rep(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, (n, old[:80])
    s = s.replace(old, new)
# 1) empty state
i = s.index('<script id="state-data" type="application/json">') + len('<script id="state-data" type="application/json">')
j = s.index('</script>', i)
s = s[:i] + '{}' + s[j:]
# 2) supabase lib
rep('<script id="app-logic">', '<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js"></script>\n<script id="app-logic">')
# 3) photo functions -> standalone version
a = s.index('  /* ---------- book from photo (barcode or cover) ---------- */')
b = s.index('  function handleCoverFile(file, cb){')
s = s[:a] + open(R+'books.js').read() + s[b:]
# 4) web search -> Google Books
a = s.index("      var getSample = (window.claude && typeof claude.use==='function') ? claude.use('sample') : Promise.resolve(null);\n      Promise.resolve(getSample).then(function(sample){\n        if(!sample){ webMsg(")
end = "          var list = (res && Array.isArray(res.books)) ? res.books : [];"
b = s.index(end, a) + len(end)
s = s[:a] + "      Promise.resolve(null).then(function(){\n        return webBookSearch(q).then(function(list){" + s[b:]
rep("النتائج من معرفة Claude، فتأكّدي من التفاصيل قبل ما تضيفين.", "النتائج من Google Books، فتأكّدي من التفاصيل قبل ما تضيفين.")
rep("synopsis:b.synopsis||'', series:b.series||''});", "synopsis:b.synopsis||'', series:b.series||'', coverUrl:b.coverUrl||''});")
rep("      f.synopsis.value = prefill.synopsis||''; f.seriesName.value = prefill.series||'';\n    }",
    "      f.synopsis.value = prefill.synopsis||''; f.seriesName.value = prefill.series||'';\n      if(prefill.coverUrl) urlToCover(prefill.coverUrl, function(d){ coverData = d; coverPreview.innerHTML = ''; coverPreview.appendChild(h('img', {src:d, style:'width:100%;height:100%;object-fit:cover;'})); });\n    }")
# 5) cloud layer + boot
cloud = open(R+'cloud.js').read()
rep("  /* ---------- boot ---------- */\n  var restoredView = null;",
    cloud + open(R+'series.js').read() + "\n  doSave = function(){ saveView(); cloudSave(); };\n\n  /* ---------- boot ---------- */\n  function bootApp(){\n  var restoredView = null;")
rep("  setTimeout(checkBadges, 500);\n})();", "  setTimeout(checkBadges, 500);\n  }\n  startCloud();\n})();")
# 6) sign out
rep("h('button', {class:'btn secondary', onclick:restoreBackup}, ['استعادة من ملف'])",
    "h('button', {class:'btn secondary', onclick:restoreBackup}, ['استعادة من ملف']), h('button', {class:'btn ghost', onclick:signOut}, ['تسجيل خروج'])")
# 7) PWA bits
rep('<title>رفّي</title>\n<link rel="preconnect"', '<title>رفّي</title>\n<link rel="manifest" href="manifest.json">\n<meta name="theme-color" content="#3a121c">\n<meta name="apple-mobile-web-app-capable" content="yes">\n<link rel="apple-touch-icon" href="icon.png">\n<link rel="preconnect"')
assert 'claude.use(\'sample\')' not in s
open(out, 'w').write(s)
print('ok', len(s))
# (أُضيفت لاحقًا) متابعة السلاسل
s = open(out).read()
for a, b in [
  ("cloudLoad().then(function(){ booted = true; bootApp(); }", "cloudLoad().then(function(){ booted = true; bootApp(); setTimeout(maybeCheckSeries, 4000); }"),
  ("      h('button', {class:'btn', onclick:openAddShoppingItemModal}, ['+ كتاب جديد للقائمة'])\n    ]));",
   "      h('div', {class:'actions-row'}, [h('button', {class:'btn', onclick:openAddShoppingItemModal}, ['+ كتاب جديد للقائمة']), h('button', {class:'btn secondary', onclick:function(){ checkSeriesNow(true); }}, ['🔔 دوّري على أجزاء جديدة'])])\n    ]));")]:
    if a in s: s = s.replace(a, b)
open(out, 'w').write(s)
# زر «عبّي المعلومات من النت» في شاشة الكتاب الجديد
s = open(out).read()
a = "      h('label', {}, ['اسم الكتاب *']), f.title,\n      (function(){\n        var link = h('a', {class:'link-btn'"
if a in s and 'عبّي المعلومات من النت' not in s:
    s = s.replace(a, open(R + 'fill-button.txt').read(), 1)
open(out, 'w').write(s)
# تكميل المعلومات الناقصة
s = open(out).read()
if 'function openEnrichTool' not in s:
    s = s.replace("  doSave = function(){ saveView(); cloudSave(); };", open(R+'enrich.js').read() + "  doSave = function(){ saveView(); cloudSave(); };", 1)
    a = "    wrap.appendChild(h('div', {class:'card'}, [\n      h('h2', {}, ['نسخة احتياطية']),"
    s = s.replace(a, open(R+'enrich-card.txt').read() + a, 1)
open(out, 'w').write(s)
