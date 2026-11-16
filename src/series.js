  /* ---------- متابعة السلاسل: يدوّر على الأجزاء الجديدة في Google Books ---------- */
  var SERIES_EVERY = 7*24*60*60*1000;
  function followedSeries(){
    var map = {};
    STATE.books.forEach(function(b){
      if(!b.followSeries || !b.seriesName) return;
      var k = normalizeAr(b.seriesName);
      if(!map[k]) map[k] = {name:b.seriesName, author:b.author||'', idx:{}};
      if(b.seriesIndex) map[k].idx[b.seriesIndex] = true;
    });
    STATE.shoppingList.forEach(function(s){
      var k = s.seriesName && normalizeAr(s.seriesName);
      if(k && map[k] && s.seriesIndex) map[k].idx[s.seriesIndex] = true;
    });
    return Object.keys(map).map(function(k){ return map[k]; });
  }
  function volNumber(title, series){
    var rest = String(title).replace(series, ' ');
    var m = rest.match(/(?:vol\.?|volume|#|الجزء|ج|المجلد|book|no\.?)\s*(\d{1,3})/i) || rest.match(/(?:^|\s)(\d{1,3})(?:\s|$|:)/);
    return m ? Number(m[1]) : null;
  }
  function findNewSeriesParts(){
    var series = followedSeries();
    var known = {};
    STATE.books.concat(STATE.shoppingList).forEach(function(x){ known[normalizeAr(x.title)] = true; });
    var dismissed = (STATE.settings.seriesDismissed || []);
    var found = [];
    var chain = Promise.resolve();
    series.forEach(function(s){
      chain = chain.then(function(){
        var ar = /[\u0600-\u06FF]/, au = s.author ? s.author.split(/[،,]| و/)[0].trim() : '';
        var q = 'intitle:"' + s.name + '"' + (au && ar.test(au) === ar.test(s.name) ? ' inauthor:"' + au + '"' : '');
        return webBookSearch(q).catch(function(){ return []; }).then(function(list){
          var ns = normalizeAr(s.name), n = 0;
          list.forEach(function(b){
            var nt = normalizeAr(b.title);
            if(n >= 5 || known[nt] || nt.indexOf(ns) === -1 || dismissed.indexOf(nt) !== -1) return;
            var v = volNumber(b.title, s.name);
            if(v && s.idx[v]) return;
            known[nt] = true; n++;
            found.push({series:s.name, seriesIndex:v, book:b});
          });
        });
      });
    });
    return chain.then(function(){ return found; });
  }
  function checkSeriesNow(manual){
    if(!followedSeries().length){ if(manual) toast('ما فيه سلاسل تتابعينها. فعّلي «أتابع هالسلسلة» من صفحة الكتاب.'); return; }
    if(manual) toast('أدوّر على أجزاء جديدة…');
    findNewSeriesParts().then(function(found){
      mutate(function(){ STATE.settings.seriesCheckedAt = Date.now(); });
      if(!found.length){ if(manual) toast('ما لقيت أجزاء جديدة حاليًا'); return; }
      showSeriesFinds(found);
    }).catch(function(){ if(manual) toast('ما قدرت أدوّر، تأكّدي من النت'); });
  }
  function maybeCheckSeries(){
    var last = (STATE.settings && STATE.settings.seriesCheckedAt) || 0;
    if(Date.now() - last > SERIES_EVERY) checkSeriesNow(false);
  }
  function showSeriesFinds(found){
    closeOverlay('series-overlay');
    var checks = [];
    var rows = found.map(function(f){
      var cb = h('input', {type:'checkbox'}); cb.checked = true; checks.push(cb);
      var b = f.book;
      var cover = b.coverUrl ? h('div', {class:'book-cover', style:'width:46px;height:66px;flex:none;'}, [h('img', {src:b.coverUrl})])
        : h('div', {class:'book-cover placeholder', style:'width:46px;height:66px;flex:none;background:linear-gradient(160deg,' + coverColor(b.title) + ',' + coverColor(b.title) + 'cc);'}, []);
      return h('label', {class:'rating-list-item', style:'display:flex; gap:10px; align-items:center; cursor:pointer;'}, [
        cb, cover,
        h('div', {style:'flex:1;'}, [
          h('div', {style:'font-weight:700; font-size:14px;'}, [b.title]),
          h('div', {style:'font-size:12px; color:var(--ink-soft);'}, [[f.series, b.author, b.year ? 'سنة ' + b.year : ''].filter(Boolean).join(' · ')])
        ])
      ]);
    });
    var modal = h('div', {class:'modal'}, [
      h('div', {class:'modal-head'}, [h('h2', {}, ['أجزاء جديدة من سلاسلك']), h('button', {class:'icon-btn', onclick:function(){ closeOverlay('series-overlay'); }}, ['✕'])]),
      h('p', {class:'datalist-note'}, ['لقيتها في Google Books. اختاري اللي تبينه ينضاف للأمنيات، واللي تشيلين علامته ما أقترحه لك مرة ثانية.']),
      h('div', {}, rows),
      h('div', {class:'actions-row'}, [
        h('button', {class:'btn', onclick:function(){
          var added = 0;
          mutate(function(){
            STATE.settings.seriesDismissed = STATE.settings.seriesDismissed || [];
            found.forEach(function(f, i){
              var b = f.book;
              if(!checks[i].checked){ STATE.settings.seriesDismissed.push(normalizeAr(b.title)); return; }
              STATE.shoppingList.push({id:uid(), title:b.title, author:b.author||'', genre:'', format:'ورقي', seriesName:f.series,
                seriesIndex:f.seriesIndex||null, autoAdded:true, cover:b.coverUrl||null, notes:'', dateAdded:todayISO(), priority:0, options:[], isbn:b.isbn||''});
              added++;
            });
          });
          closeOverlay('series-overlay');
          if(added) toast('انضاف ' + added + ' للأمنيات 🔔');
        }}, ['أضيفي المختار للأمنيات'])
      ])
    ]);
    document.body.appendChild(h('div', {id:'series-overlay', class:'overlay', onclick:function(e){ if(e.target.id==='series-overlay') closeOverlay('series-overlay'); }}, [modal]));
  }

