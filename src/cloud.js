  /* ================= رفّي المستقلة: الحفظ في Supabase ================= */
  var SB_URL = 'https://zttdyyhcsgpxwotfiubj.supabase.co';
  var SB_KEY = 'sb_publishable_cKgnT_xvunPMyuYuL5X3bQ_NHotLl2M';
  var sb = window.supabase.createClient(SB_URL, SB_KEY);
  var cloudUser = null;
  var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  function newId(){ return (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c){ var r=Math.random()*16|0; return (c==='x'?r:(r&3|8)).toString(16); }); }
  uid = newId;

  /* --- تحويل الأسماء بين التطبيق والقاعدة --- */
  function snake(k){ return k.replace(/[A-Z]/g, function(m){ return '_' + m.toLowerCase(); }); }
  function camel(k){ return k.replace(/_([a-z])/g, function(m, c){ return c.toUpperCase(); }); }
  var COLS = {
    books: {text:['title','author','translator','publisher','genre','format','vibe','status','synopsis','authorBio','review','seriesName','readWith','bookmarkStyle','isbn'],
            int:['totalPages','rating','desire','seriesIndex'], bool:['owned','followSeries'], date:['dateAdded','dateStarted','dateFinished']},
    sessions: {text:['note','mood'], int:['fromPage','toPage','minutes'], date:['date'], uuid:['bookId']},
    wishlist: {text:['title','author','translator','genre','format','seriesName','notes'], int:['seriesIndex','priority'], bool:['autoAdded'], date:['dateAdded'], json:['options'], uuid:['bookId']},
    mood_log: {text:['mood','source'], date:['date']}
  };
  var SKIP = {id:1, cover:1, _coverPath:1, _coverSig:1};
  function toRow(table, o){
    var c = COLS[table], row = {id:o.id, extra:{}}, known = {};
    ['text','int','bool','date','json','uuid'].forEach(function(t){ (c[t]||[]).forEach(function(k){ known[k] = t; }); });
    Object.keys(o).forEach(function(k){
      if(SKIP[k]) return;
      var v = o[k], t = known[k];
      if(!t){ if(v !== undefined) row.extra[k] = v; return; }
      if(t==='int'){ v = (v===''||v==null||isNaN(Number(v))) ? null : Math.round(Number(v)); }
      else if(t==='bool'){ v = !!v; }
      else if(t==='date'){ v = (typeof v==='string' && /^\d{4}-\d{2}-\d{2}/.test(v)) ? v.slice(0,10) : null; if(v===null && o[k]) row.extra[k] = o[k]; }
      else if(t==='uuid'){ v = (typeof v==='string' && UUID_RE.test(v)) ? v : null; }
      else if(t==='text'){ v = v==null ? '' : String(v); }
      row[snake(k)] = v;
    });
    if(table==='books' || table==='wishlist') row.cover_path = o._coverPath || null;
    if((table==='books' || table==='wishlist') && o.cover && !o._coverPath && o.cover.indexOf('data:')!==0) row.extra.coverUrl = o.cover;
    if(table==='mood_log' && !row.mood) row.mood = '';
    if(table==='books' && !row.title) row.title = 'بدون عنوان';
    if(table==='wishlist' && !row.title) row.title = 'بدون عنوان';
    return row;
  }
  function fromRow(row){
    var o = {};
    Object.keys(row).forEach(function(k){
      if(k==='user_id' || k==='extra' || k==='cover_path' || k==='is_favorite' || k==='created_at') return;
      var v = row[k]; if(v===null) return;
      o[camel(k)] = v;
    });
    if(row.extra) Object.keys(row.extra).forEach(function(k){ o[k] = row.extra[k]; });
    if(row.cover_path) o._coverPath = row.cover_path;
    if(o.coverUrl){ if(!o._coverPath) o.cover = o.coverUrl; delete o.coverUrl; }
    return o;
  }

  /* --- معرّفات قديمة (من رفّي داخل Claude) تتحوّل لمعرّفات القاعدة --- */
  function normalizeIds(){
    var map = {};
    function fix(list){ (list||[]).forEach(function(x){ if(!x.id || !UUID_RE.test(x.id)){ var n = newId(); if(x.id) map[x.id] = n; x.id = n; } }); }
    fix(STATE.books); fix(STATE.sessions); fix(STATE.shoppingList); fix(STATE.goals); fix(STATE.moodLog);
    if(!Object.keys(map).length) return;
    STATE.sessions.forEach(function(s){ if(map[s.bookId]) s.bookId = map[s.bookId]; });
    STATE.shoppingList.forEach(function(s){ if(s.bookId && map[s.bookId]) s.bookId = map[s.bookId]; });
    STATE.favoriteBookIds = STATE.favoriteBookIds.map(function(id){ return map[id] || id; });
    if(STATE.currentBookId && map[STATE.currentBookId]) STATE.currentBookId = map[STATE.currentBookId];
  }

  /* --- الأغلفة --- */
  function dataUrlToBlob(d){
    var p = d.split(','), mime = (p[0].match(/data:([^;]+)/)||[])[1] || 'image/jpeg', bin = atob(p[1]), u = new Uint8Array(bin.length);
    for(var i=0;i<bin.length;i++) u[i] = bin.charCodeAt(i);
    return new Blob([u], {type:mime});
  }
  function uploadCover(item){
    var blob = dataUrlToBlob(item.cover);
    var ext = blob.type==='image/webp' ? 'webp' : (blob.type==='image/png' ? 'png' : 'jpg');
    var path = cloudUser.id + '/' + item.id + '-' + Date.now().toString(36) + '.' + ext;
    return sb.storage.from('covers').upload(path, blob, {contentType:blob.type, upsert:true}).then(function(r){
      if(r.error) throw r.error;
      var old = item._coverPath;
      item._coverPath = path; item._coverSig = item.cover;
      if(old && old!==path) sb.storage.from('covers').remove([old]);
    });
  }
  function syncCovers(){
    var jobs = [];
    STATE.books.concat(STATE.shoppingList).forEach(function(it){
      if(typeof it.cover==='string' && it.cover.indexOf('data:')===0 && it._coverSig!==it.cover) jobs.push(it);
      else if(!it.cover && it._coverPath){ sb.storage.from('covers').remove([it._coverPath]); delete it._coverPath; delete it._coverSig; }
    });
    var chain = Promise.resolve();
    var fails = [];
    jobs.forEach(function(it){ chain = chain.then(function(){ return uploadCover(it).catch(function(e){ fails.push((e && (e.message||e.error)) || String(e)); }); }); });
    return chain.then(function(){ return fails; });
  }

  /* --- المزامنة: نرسل بس اللي تغيّر --- */
  var synced = {};
  function buildRows(){
    var rows = {
      books: STATE.books.map(function(b, i){ var r = toRow('books', b); r.extra._i = i; r.is_favorite = STATE.favoriteBookIds.indexOf(b.id)!==-1; return r; }),
      sessions: STATE.sessions.map(function(s, i){ var r = toRow('sessions', s); r.extra._i = i; return r; }),
      wishlist: STATE.shoppingList.map(function(s, i){ var r = toRow('wishlist', s); r.extra._i = i; return r; }),
      mood_log: STATE.moodLog.map(function(m, i){ var r = toRow('mood_log', m); r.extra._i = i; return r; }),
      goals: STATE.goals.map(function(g){ return {id:g.id, data:g}; })
    };
    var names = {};
    (STATE.favoriteAuthors||[]).forEach(function(n){ names[n] = true; });
    Object.keys(STATE.authorBios||{}).forEach(function(n){ if(!(n in names)) names[n] = false; });
    Object.keys(STATE.authorAliases||{}).forEach(function(n){ if(!(n in names)) names[n] = false; });
    rows.favorite_authors = Object.keys(names).map(function(n){
      return {name:n, is_favorite:names[n], bio:(STATE.authorBios||{})[n]||'', aliases:(STATE.authorAliases||{})[n]||[]};
    });
    var extra = {};
    Object.keys(STATE).forEach(function(k){
      if(['books','sessions','shoppingList','moodLog','goals','favoriteAuthors','authorBios','authorAliases','favoriteBookIds','earnedBadgeIds','currentBookId'].indexOf(k)===-1) extra[k] = STATE[k];
    });
    rows.user_settings = [{user_id:cloudUser.id, palette:(STATE.settings&&STATE.settings.palette)||'', hidden:(STATE.settings&&STATE.settings.hidden)||[],
      earned_badge_ids:STATE.earnedBadgeIds||[], current_book_id:STATE.currentBookId||null, extra:extra, updated_at:new Date().toISOString()}];
    return rows;
  }
  var KEY_OF = {favorite_authors:'name', user_settings:'user_id'};
  function syncTable(t, list){
    var key = KEY_OF[t] || 'id', prev = synced[t] || {}, next = {}, changed = [], gone = [];
    list.forEach(function(r){
      var s = JSON.stringify(t==='user_settings' ? Object.assign({}, r, {updated_at:0}) : r);
      next[r[key]] = s; if(prev[r[key]]!==s) changed.push(r);
    });
    Object.keys(prev).forEach(function(k){ if(!(k in next)) gone.push(k); });
    var ops = [];
    if(changed.length){
      for(var i=0;i<changed.length;i+=200){
        ops.push(sb.from(t).upsert(changed.slice(i,i+200), {onConflict: t==='favorite_authors' ? 'user_id,name' : key}).then(function(r){ if(r.error) throw r.error; }));
      }
    }
    if(gone.length) ops.push(sb.from(t).delete().in(key, gone).then(function(r){ if(r.error) throw r.error; }));
    return Promise.all(ops).then(function(){ synced[t] = next; });
  }
  var syncing = null, syncAgain = false, coverFails = [];
  function cloudSave(){
    if(!cloudUser) return;
    if(syncing){ syncAgain = true; return; }
    setSyncBadge('saving');
    syncing = Promise.resolve().then(function(){
      normalizeIds();
      return syncCovers();
    }).then(function(fails){
      coverFails = fails || [];
      var rows = buildRows();
      /* الكتب أول، بعدين اللي يعتمد عليها */
      return syncTable('books', rows.books).then(function(){
        return Promise.all(['sessions','wishlist','mood_log','goals','favorite_authors','user_settings'].map(function(t){ return syncTable(t, rows[t]); }));
      });
    }).then(function(){
      if(coverFails.length) setSyncBadge('error', 'الكتب انحفظت، بس ' + coverFails.length + ' غلاف ما انرفع: ' + coverFails[0]);
      else setSyncBadge('ok');
    }, function(err){
      console.warn('sync failed', err); setSyncBadge('error', (err && (err.message || err.details || err.hint)) || String(err));
    }).then(function(){
      syncing = null;
      if(syncAgain){ syncAgain = false; cloudSave(); }
    });
  }
  window.addEventListener('beforeunload', function(e){ if(syncing){ e.preventDefault(); e.returnValue = ''; } });

  var syncBadge = null;
  function setSyncBadge(s, detail){
    if(!syncBadge){
      syncBadge = h('div', {style:'position:fixed; top:10px; left:12px; z-index:30; font-size:11px; padding:4px 10px; border-radius:20px; background:var(--panel); border:1px solid var(--line); color:var(--ink-soft); transition:opacity .4s; max-width:70vw; cursor:pointer;', onclick:function(){ if(syncBadge._err){ syncBadge._err = false; cloudSave(); } }}, []);
      document.body.appendChild(syncBadge);
    }
    clearTimeout(syncBadge._t);
    syncBadge.style.opacity = '1';
    if(s==='saving') syncBadge.textContent = 'أحفظ…';
    else if(s==='ok'){ syncBadge.textContent = 'محفوظ ✓'; syncBadge._t = setTimeout(function(){ syncBadge.style.opacity = '0'; }, 1500); }
    else { syncBadge._err = true; syncBadge.textContent = 'ما انحفظ (اضغطي لإعادة المحاولة): ' + (detail||''); syncBadge.style.color = 'var(--danger)'; return; }
    syncBadge._err = false;
    syncBadge.style.color = 'var(--ink-soft)';
  }

  /* --- تحميل مكتبتك من القاعدة --- */
  function fetchAll(t){
    var all = [];
    function page(from){
      return sb.from(t).select('*').range(from, from+999).then(function(r){
        if(r.error) throw r.error;
        all = all.concat(r.data);
        return r.data.length===1000 ? page(from+1000) : all;
      });
    }
    return page(0);
  }
  function cloudLoad(){
    var T = ['books','sessions','wishlist','mood_log','goals','favorite_authors','user_settings'];
    return Promise.all(T.map(fetchAll)).then(function(res){
      var d = {}; T.forEach(function(t, i){ d[t] = res[i]; });
      function ord(list){ return list.map(fromRow).sort(function(a, b){ return (a._i==null?1e9:a._i) - (b._i==null?1e9:b._i); }).map(function(o){ delete o._i; return o; }); }
      var st = d.user_settings[0] || null;
      var extra = (st && st.extra) || {};
      Object.keys(STATE).forEach(function(k){ delete STATE[k]; });
      Object.keys(extra).forEach(function(k){ STATE[k] = extra[k]; });
      STATE.books = ord(d.books);
      STATE.favoriteBookIds = d.books.filter(function(b){ return b.is_favorite; }).map(function(b){ return b.id; });
      STATE.sessions = ord(d.sessions);
      STATE.shoppingList = ord(d.wishlist);
      STATE.moodLog = ord(d.mood_log);
      STATE.goals = d.goals.map(function(g){ var o = g.data || {}; o.id = g.id; return o; });
      STATE.favoriteAuthors = d.favorite_authors.filter(function(a){ return a.is_favorite!==false; }).map(function(a){ return a.name; });
      STATE.authorBios = {}; STATE.authorAliases = {};
      d.favorite_authors.forEach(function(a){ if(a.bio) STATE.authorBios[a.name] = a.bio; if(a.aliases && a.aliases.length) STATE.authorAliases[a.name] = a.aliases; });
      STATE.earnedBadgeIds = (st && st.earned_badge_ids) || [];
      if(st && st.current_book_id) STATE.currentBookId = st.current_book_id;
      STATE.settings = STATE.settings || {palette:'burgundy', hidden:[]};
      if(st && st.palette) STATE.settings.palette = st.palette;
      STATE.settings.hidden = (st && st.hidden) || STATE.settings.hidden || [];
      STATE.goals = STATE.goals || []; STATE.moodLog = STATE.moodLog || [];
      /* اللي جا من القاعدة يعتبر محفوظ */
      synced = {};
      var rows = buildRows();
      Object.keys(rows).forEach(function(t){
        var key = KEY_OF[t] || 'id', m = {};
        rows[t].forEach(function(r){ m[r[key]] = JSON.stringify(t==='user_settings' ? Object.assign({}, r, {updated_at:0}) : r); });
        synced[t] = m;
      });
      if(!d.user_settings.length) delete synced.user_settings;
      /* روابط الأغلفة */
      var items = STATE.books.concat(STATE.shoppingList).filter(function(x){ return x._coverPath; });
      if(!items.length) return;
      var paths = items.map(function(x){ return x._coverPath; });
      var chunks = [];
      for(var i=0;i<paths.length;i+=100) chunks.push(paths.slice(i,i+100));
      return Promise.all(chunks.map(function(c){ return sb.storage.from('covers').createSignedUrls(c, 60*60*24*30); })).then(function(rs){
        var urls = {};
        rs.forEach(function(r){ (r.data||[]).forEach(function(u){ if(u.signedUrl) urls[u.path] = u.signedUrl; }); });
        items.forEach(function(x){ if(urls[x._coverPath]){ x.cover = urls[x._coverPath]; x._coverSig = x.cover; } });
      });
    });
  }

  /* --- شاشة الدخول --- */
  function showLogin(msg){
    var email = h('input', {type:'email', placeholder:'الإيميل', autocomplete:'email', dir:'ltr', style:'width:100%; padding:11px 12px; border-radius:10px; border:1px solid var(--line); background:var(--ground); color:var(--ink); font-family:inherit; font-size:16px; text-align:center;'});
    var pass = h('input', {type:'password', placeholder:'كلمة السر', autocomplete:'current-password', dir:'ltr', style:'width:100%; padding:11px 12px; border-radius:10px; border:1px solid var(--line); background:var(--ground); color:var(--ink); font-family:inherit; font-size:16px; text-align:center; margin-top:10px;'});
    var note = h('p', {class:'empty-hint', style:'min-height:20px; margin-top:10px;'}, [msg||'']);
    function go(signup){
      var e = email.value.trim(), p = pass.value;
      if(!e || p.length < 6){ note.textContent = 'اكتبي الإيميل وكلمة سر ٦ أحرف أو أكثر'; return; }
      note.textContent = 'لحظة…';
      var call = signup ? sb.auth.signUp({email:e, password:p, options:{emailRedirectTo: location.origin + location.pathname}}) : sb.auth.signInWithPassword({email:e, password:p});
      call.then(function(r){
        if(r.error){ note.textContent = r.error.message==='Invalid login credentials' ? 'الإيميل أو كلمة السر غلط' : r.error.message; return; }
        if(signup && !r.data.session){ note.textContent = 'أرسلنا لك إيميل تأكيد، أكّديه وارجعي سجّلي دخول'; return; }
      });
    }
    var box = h('div', {id:'login-overlay', class:'overlay', style:'align-items:center;'}, [
      h('div', {class:'modal', style:'border-radius:18px; max-width:380px; text-align:center;'}, [
        h('h1', {class:'display', style:'font-size:40px; margin-bottom:4px;'}, ['رفّي']),
        h('p', {class:'empty-hint', style:'margin-bottom:16px;'}, ['لكل كتاب زاوية، ولكل يوم صفحة']),
        email, pass,
        h('div', {class:'actions-row', style:'justify-content:center;'}, [
          h('button', {class:'btn', onclick:function(){ go(false); }}, ['دخول']),
          h('button', {class:'btn secondary', onclick:function(){ go(true); }}, ['حساب جديد'])
        ]),
        note
      ])
    ]);
    pass.addEventListener('keydown', function(ev){ if(ev.key==='Enter') go(false); });
    closeOverlay('login-overlay');
    document.body.appendChild(box);
  }
  function signOut(){ sb.auth.signOut().then(function(){ location.reload(); }); }

  /* --- التشغيل --- */
  var booted = false;
  function startCloud(){
    var app = document.getElementById('app');
    if(app) app.innerHTML = '<p class="empty-hint" style="text-align:center;margin-top:40vh;">أفتح رفّك…</p>';
    sb.auth.onAuthStateChange(function(ev, session){
      var u = session && session.user;
      if(!u){ if(!booted) showLogin(); return; }
      if(booted || (cloudUser && cloudUser.id===u.id)) return;
      cloudUser = u;
      closeOverlay('login-overlay');
      cloudLoad().then(function(){ booted = true; bootApp(); }, function(err){
        console.warn(err); showLogin('ما قدرت أفتح مكتبتك: ' + (err.message||err));
      });
    });
  }

  /* --- حفظ الملفات (نسخة احتياطية، إكسل) بدون Claude --- */
  downloadsCap = {save:function(o){
    return new Promise(function(res){
      var url = URL.createObjectURL(new Blob([o.data]));
      var a = h('a', {href:url, download:o.filename, style:'display:none;'}, []);
      document.body.appendChild(a); a.click();
      setTimeout(function(){ URL.revokeObjectURL(url); a.remove(); res(); }, 1000);
    });
  }};
