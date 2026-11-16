  /* ---------- تحديث الأغلفة لأعلى جودة ---------- */
  function imgSize(url){
    return new Promise(function(res){
      if(!url) return res(0);
      var im = new Image(), done = false;
      var t = setTimeout(function(){ if(!done){ done = true; res(0); } }, 15000);
      im.onload = function(){ if(done) return; done = true; clearTimeout(t); res(im.naturalWidth || 0); };
      im.onerror = function(){ if(done) return; done = true; clearTimeout(t); res(0); };
      im.src = url;
    });
  }
  function bigGoogle(url){
    if(!url || url.indexOf('books.google') === -1) return url;
    return url.replace(/&zoom=\d/, '&zoom=1').replace(/&fife=[^&]*/, '') + '&fife=w800';
  }
  function coverCandidates(item){
    var c = [];
    var isbn = String(item.isbn || '').replace(/[^0-9X]/gi, '');
    if(isbn) c.push('https://covers.openlibrary.org/b/isbn/' + isbn + '-L.jpg?default=false');
    var q = (item.title + ' ' + (item.author && /[؀-ۿ]/.test(item.author) === /[؀-ۿ]/.test(item.title) ? item.author : '')).trim();
    return webBookSearch(q).catch(function(){ return []; }).then(function(list){
      list.forEach(function(b){
        if(titleMatch(item.title, b.title) < 2) return;
        if(b.coverUrl){ c.push(bigGoogle(b.coverUrl)); if(b.coverUrl.indexOf('-M.jpg') !== -1) c.push(b.coverUrl.replace('-M.jpg', '-L.jpg')); }
        if(b.isbn && !isbn) c.push('https://covers.openlibrary.org/b/isbn/' + b.isbn + '-L.jpg?default=false');
      });
      return c.filter(function(u, i){ return c.indexOf(u) === i; }).slice(0, 5);
    });
  }
  function bestCoverFor(item){
    return Promise.all([imgSize(item.cover), coverCandidates(item)]).then(function(r){
      var cur = r[0], cands = r[1];
      return Promise.all(cands.map(imgSize)).then(function(sizes){
        var best = null, bw = 0;
        sizes.forEach(function(w, i){ if(w > bw){ bw = w; best = cands[i]; } });
        /* نقترح بس إذا الجديد أوضح بفرق واضح */
        if(!best || bw < 300 || bw < cur * 1.4) return null;
        return {url:best, width:bw, cur:cur};
      });
    }).catch(function(){ return null; });
  }
  function openCoverUpgrade(){
    var items = STATE.books.map(function(b){ return {item:b, wish:false}; }).concat(STATE.shoppingList.map(function(s){ return {item:s, wish:true}; }));
    closeOverlay('covers-overlay');
    var body = h('div', {}, []);
    var stop = false;
    var prog = h('p', {class:'datalist-note'}, [items.length + ' كتاب. أدوّر لكل واحد على غلاف أوضح من اللي عندك، وأوريك القديم والجديد جنب بعض عشان تختارين. الكتب اللي ما ألقى لها أوضح ما أقترب منها.']);
    var startBtn = h('button', {class:'btn', onclick:run}, ['ابدئي']);
    body.appendChild(prog); body.appendChild(h('div', {class:'actions-row'}, [startBtn]));
    function run(){
      startBtn.remove();
      var results = h('div', {}, []);
      var applyBtn = h('button', {class:'btn', disabled:true, onclick:apply}, ['احفظي المختار']);
      body.appendChild(results); body.appendChild(h('div', {class:'actions-row'}, [applyBtn]));
      var found = [], done = 0, next = 0;
      function worker(){
        if(stop || next >= items.length) return Promise.resolve();
        var x = items[next++];
        return bestCoverFor(x.item).then(function(r){
          done++;
          prog.textContent = 'أدوّر… ' + done + '/' + items.length + ' · لقيت أوضح لـ ' + (found.length + (r ? 1 : 0));
          if(!r) return;
          var cb = h('input', {type:'checkbox'}); cb.checked = true;
          found.push({x:x, url:r.url, cb:cb});
          var box = 'width:60px;height:88px;object-fit:cover;border-radius:3px;flex:none;';
          results.appendChild(h('label', {class:'rating-list-item', style:'display:flex; gap:10px; align-items:center; cursor:pointer;'}, [
            cb,
            x.item.cover ? h('img', {src:x.item.cover, style:box + 'opacity:.75;'}) : h('div', {style:box + 'background:var(--shelf);'}, []),
            h('span', {style:'color:var(--ink-soft);'}, ['←']),
            h('img', {src:r.url, style:box}),
            h('div', {style:'flex:1;'}, [
              h('div', {style:'font-weight:700; font-size:13.5px;'}, [x.item.title + (x.wish ? ' (الأمنيات)' : '')]),
              h('div', {style:'font-size:11.5px; color:var(--ink-soft);'}, [(r.cur ? 'القديم ' + r.cur + 'px' : 'بدون غلاف') + ' ← الجديد ' + r.width + 'px'])
            ])
          ]));
          applyBtn.disabled = false;
        }).then(worker);
      }
      Promise.all([worker(), worker(), worker()]).then(function(){
        prog.textContent = 'خلصت: لقيت غلاف أوضح لـ ' + found.length + ' من ' + items.length + '. شيلي ✓ عن أي غلاف مو نفس نسختك.';
      });
      function apply(){
        var chosen = found.filter(function(f){ return f.cb.checked; });
        if(!chosen.length){ toast('ما اخترتِ شي'); return; }
        applyBtn.disabled = true;
        var i = 0;
        var chain = Promise.resolve();
        chosen.forEach(function(f){
          chain = chain.then(function(){ return new Promise(function(res){
            urlToCover(f.url, function(d){ f.data = d; i++; prog.textContent = 'أجهّز الأغلفة ' + i + '/' + chosen.length; res(); });
          }); });
        });
        chain.then(function(){
          mutate(function(){ chosen.forEach(function(f){ f.x.item.cover = f.data; }); });
          closeOverlay('covers-overlay');
          toast('تحدّث ' + chosen.length + ' غلاف ✓');
        });
      }
    }
    var modal = h('div', {class:'modal'}, [
      h('div', {class:'modal-head'}, [h('h2', {}, ['أغلفة بأعلى جودة']), h('button', {class:'icon-btn', onclick:function(){ stop = true; closeOverlay('covers-overlay'); }}, ['✕'])]),
      body
    ]);
    document.body.appendChild(h('div', {id:'covers-overlay', class:'overlay'}, [modal]));
  }

