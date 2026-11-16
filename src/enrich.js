  /* ---------- تكميل المعلومات الناقصة (غلاف، كاتب، دار، صفحات، نبذة) ---------- */
  var ENRICH_FIELDS = [['author','author','الكاتب'], ['publisher','publisher','الدار'], ['pages','totalPages','الصفحات'], ['synopsis','synopsis','النبذة'], ['isbn','isbn','ISBN']];
  function missingOf(x, isWish){
    var m = [];
    if(!x.cover) m.push('cover');
    ENRICH_FIELDS.forEach(function(f){
      if(f[1]==='isbn' || (isWish && (f[1]==='totalPages' || f[1]==='synopsis' || f[1]==='publisher'))) return;
      if(!x[f[1]]) m.push(f[1]);
    });
    return m;
  }
  function titleMatch(a, b){
    var x = normalizeAr(a).toLowerCase().replace(/[^؀-ۿa-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
    var y = normalizeAr(b).toLowerCase().replace(/[^؀-ۿa-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
    if(!x || !y) return 0;
    if(x===y) return 3;
    if(x.indexOf(y)===0 || y.indexOf(x)===0) return 2;
    if(x.indexOf(y)!==-1 || y.indexOf(x)!==-1) return 1;
    return 0;
  }
  function enrichOne(item){
    var p = item.isbn ? isbnLookup(item.isbn).then(function(b){ return b ? [b] : []; }) : Promise.resolve([]);
    return p.then(function(list){
      if(list.length) return list;
      return webBookSearch((item.title + ' ' + (item.author && !/[؀-ۿ]/.test(item.author) === !/[؀-ۿ]/.test(item.title) ? item.author : '')).trim());
    }).then(function(list){
      var best = null, score = 0;
      list.forEach(function(b){ var s = titleMatch(item.title, b.title); if(s > score){ score = s; best = b; } });
      return best ? {book:best, score:score} : null;
    }).catch(function(){ return null; });
  }
  function openEnrichTool(){
    var items = [];
    STATE.books.forEach(function(b){ var m = missingOf(b, false); if(m.length) items.push({item:b, wish:false, missing:m}); });
    STATE.shoppingList.forEach(function(s){ var m = missingOf(s, true); if(m.length) items.push({item:s, wish:true, missing:m}); });
    var onlyCover = items.filter(function(x){ return x.missing.indexOf('cover')!==-1; }).length;
    closeOverlay('enrich-overlay');
    var body = h('div', {}, []);
    var status = h('p', {class:'datalist-note'}, [items.length + ' كتاب ناقصه شي (' + onlyCover + ' بدون غلاف). أدوّر لكل واحد في النت، وأوريك اللي لقيته عشان تتأكدين قبل ما أحفظه. ما أغيّر أي معلومة كاتبتها أنتِ، بس أعبّي الفاضي.']);
    var startBtn = h('button', {class:'btn', onclick:run}, ['ابدئي']);
    var scopeSel = h('select', {style:'margin-top:8px;'}, [h('option', {value:'cover'}, ['اللي بدون غلاف بس']), h('option', {value:'all'}, ['كل اللي ناقصه شي'])]);
    body.appendChild(status); body.appendChild(scopeSel); body.appendChild(h('div', {class:'actions-row'}, [startBtn]));
    var stop = false;
    function run(){
      var list = scopeSel.value==='cover' ? items.filter(function(x){ return x.missing.indexOf('cover')!==-1; }) : items;
      if(!list.length){ toast('ما فيه شي ناقص 👌'); return; }
      body.innerHTML = '';
      var prog = h('p', {class:'datalist-note'}, ['أدوّر… 0/' + list.length]);
      var results = h('div', {}, []);
      var applyBtn = h('button', {class:'btn', disabled:true, onclick:apply}, ['احفظي المختار']);
      body.appendChild(prog); body.appendChild(results); body.appendChild(h('div', {class:'actions-row'}, [applyBtn]));
      var found = [], done = 0, next = 0;
      function worker(){
        if(stop || next >= list.length) return Promise.resolve();
        var x = list[next++];
        return enrichOne(x.item).then(function(r){
          done++; prog.textContent = 'أدوّر… ' + done + '/' + list.length + ' · لقيت ' + (found.length + (r ? 1 : 0));
          if(!r) return;
          var b = r.book, changes = {};
          if(x.missing.indexOf('cover')!==-1 && b.coverUrl) changes.cover = b.coverUrl;
          ENRICH_FIELDS.forEach(function(f){ if(x.missing.indexOf(f[1])!==-1 && b[f[0]]) changes[f[1]] = b[f[0]]; });
          if(!x.item.isbn && b.isbn && Object.keys(changes).length) changes.isbn = b.isbn;
          if(!Object.keys(changes).length) return;
          var cb = h('input', {type:'checkbox'}); cb.checked = r.score >= 2;
          found.push({x:x, changes:changes, cb:cb});
          var lines = Object.keys(changes).filter(function(k){ return k!=='cover'; }).map(function(k){
            var lab = (ENRICH_FIELDS.filter(function(f){ return f[1]===k; })[0]||[])[2] || k;
            var v = String(changes[k]); return lab + ': ' + (v.length > 70 ? v.slice(0, 70) + '…' : v);
          });
          results.appendChild(h('label', {class:'rating-list-item', style:'display:flex; gap:10px; align-items:flex-start; cursor:pointer;'}, [
            cb,
            changes.cover ? h('img', {src:changes.cover, style:'width:46px;height:66px;object-fit:cover;border-radius:3px;flex:none;'}) : null,
            h('div', {style:'flex:1;'}, [
              h('div', {style:'font-weight:700; font-size:13.5px;'}, [x.item.title + (x.wish ? ' (الأمنيات)' : '')]),
              h('div', {style:'font-size:11.5px; color:var(--ink-soft);'}, ['لقيت: ' + b.title + (b.author ? ' · ' + b.author : '') + (r.score < 2 ? ' — تأكّدي، ممكن مو نفسه' : '')]),
              lines.length ? h('div', {style:'font-size:11.5px; margin-top:3px;'}, [lines.join(' · ')]) : null
            ])
          ]));
          applyBtn.disabled = false;
        }).then(worker);
      }
      Promise.all([worker(), worker(), worker()]).then(function(){
        prog.textContent = 'خلصت: لقيت معلومات لـ ' + found.length + ' من ' + list.length + '. اللي عليه ✓ تطابقه قوي، والباقي تأكّدي منه.';
      });
      function apply(){
        var chosen = found.filter(function(f){ return f.cb.checked; });
        if(!chosen.length){ toast('ما اخترتِ شي'); return; }
        applyBtn.disabled = true; prog.textContent = 'أجهّز الأغلفة…';
        var chain = Promise.resolve();
        chosen.forEach(function(f){
          if(f.changes.cover) chain = chain.then(function(){ return new Promise(function(res){ urlToCover(f.changes.cover, function(d){ f.changes.cover = d; res(); }); }); });
        });
        chain.then(function(){
          mutate(function(){
            chosen.forEach(function(f){
              Object.keys(f.changes).forEach(function(k){ if(!f.x.item[k]) f.x.item[k] = k==='totalPages' ? Number(f.changes[k])||0 : f.changes[k]; });
            });
          });
          closeOverlay('enrich-overlay');
          toast('تحدّث ' + chosen.length + ' كتاب ✓');
        });
      }
    }
    var modal = h('div', {class:'modal'}, [
      h('div', {class:'modal-head'}, [h('h2', {}, ['كمّلي المعلومات الناقصة']), h('button', {class:'icon-btn', onclick:function(){ stop = true; closeOverlay('enrich-overlay'); }}, ['✕'])]),
      body
    ]);
    document.body.appendChild(h('div', {id:'enrich-overlay', class:'overlay'}, [modal]));
  }

