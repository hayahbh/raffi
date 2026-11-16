  /* ---------- من صفحة الكتاب: دوّري على الناقص أو غلاف أوضح ---------- */
  function openItemLookup(item, wish, reopen){
    closeOverlay('lookup-overlay');
    var body = h('div', {}, [h('p', {class:'empty-hint'}, ['أدوّر في النت… (ثواني)'])]);
    var modal = h('div', {class:'modal'}, [
      h('div', {class:'modal-head'}, [h('h2', {}, ['دوّري على الناقص']), h('button', {class:'icon-btn', onclick:function(){ closeOverlay('lookup-overlay'); }}, ['✕'])]),
      body
    ]);
    document.body.appendChild(h('div', {id:'lookup-overlay', class:'overlay', onclick:function(e){ if(e.target.id==='lookup-overlay') closeOverlay('lookup-overlay'); }}, [modal]));
    Promise.all([enrichOne(item), bestCoverFor(item)]).then(function(r){
      var info = r[0], cov = r[1], rows = [], picks = [];
      body.innerHTML = '';
      var coverUrl = cov ? cov.url : (!item.cover && info && info.book.coverUrl ? info.book.coverUrl : null);
      if(coverUrl){
        var cb = h('input', {type:'checkbox'}); cb.checked = true;
        picks.push({key:'cover', val:coverUrl, cb:cb});
        var box = 'width:70px;height:102px;object-fit:cover;border-radius:3px;';
        rows.push(h('label', {class:'rating-list-item', style:'display:flex; gap:10px; align-items:center; cursor:pointer;'}, [
          cb, item.cover ? h('img', {src:item.cover, style:box + 'opacity:.75;'}) : h('div', {style:box + 'background:var(--shelf);'}, []),
          h('span', {style:'color:var(--ink-soft);'}, ['←']), h('img', {src:coverUrl, style:box}),
          h('div', {style:'font-size:12px; color:var(--ink-soft);'}, [cov ? ((cov.cur ? 'القديم ' + cov.cur + 'px' : 'بدون غلاف') + ' ← الجديد ' + cov.width + 'px') : 'غلاف من النت'])
        ]));
      }
      if(info){
        var b = info.book;
        ENRICH_FIELDS.forEach(function(f){
          if(item[f[1]] || !b[f[0]]) return;
          if(wish && (f[1]==='totalPages' || f[1]==='synopsis' || f[1]==='publisher')) return;
          var cb2 = h('input', {type:'checkbox'}); cb2.checked = info.score >= 2;
          picks.push({key:f[1], val:b[f[0]], cb:cb2});
          rows.push(h('label', {class:'rating-list-item', style:'display:flex; gap:10px; align-items:flex-start; cursor:pointer;'}, [
            cb2, h('div', {style:'flex:1;'}, [h('div', {style:'font-size:12px; color:var(--ink-soft);'}, [f[2]]), h('div', {style:'font-size:13.5px;'}, [String(b[f[0]])])])
          ]));
        });
        if(rows.length) body.appendChild(h('p', {class:'datalist-note'}, ['لقيت: ' + b.title + (b.author ? ' · ' + b.author : '') + (info.score < 2 ? ' — تأكّدي، ممكن مو نفس الكتاب' : '')]));
      }
      if(!rows.length){ body.appendChild(h('p', {class:'empty-hint'}, ['ما لقيت شي ناقص أو غلاف أوضح من اللي عندك.'])); return; }
      rows.forEach(function(r2){ body.appendChild(r2); });
      var saveBtn = h('button', {class:'btn', onclick:function(){
        var chosen = picks.filter(function(p){ return p.cb.checked; });
        if(!chosen.length){ toast('ما اخترتِ شي'); return; }
        saveBtn.disabled = true;
        var c = chosen.filter(function(p){ return p.key==='cover'; })[0];
        (c ? new Promise(function(res){ urlToCover(c.val, function(d){ c.val = d; res(); }); }) : Promise.resolve()).then(function(){
          mutate(function(){ chosen.forEach(function(p){ item[p.key] = p.key==='totalPages' ? Number(p.val)||0 : p.val; }); });
          closeOverlay('lookup-overlay');
          toast('تحدّث ✓');
          if(reopen) reopen();
        });
      }}, ['احفظي المختار']);
      body.appendChild(h('div', {class:'actions-row'}, [saveBtn]));
    });
  }

