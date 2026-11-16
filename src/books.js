  /* ---------- البحث عن الكتب والتعرّف من الصورة (بدون Claude) ---------- */
  function loadScriptOnce(src, globalName){
    if(window[globalName]) return Promise.resolve(window[globalName]);
    loadScriptOnce._p = loadScriptOnce._p || {};
    if(!loadScriptOnce._p[src]){
      loadScriptOnce._p[src] = new Promise(function(res, rej){
        var s = document.createElement('script'); s.src = src; s.async = true;
        s.onload = function(){ res(window[globalName]); };
        s.onerror = function(){ delete loadScriptOnce._p[src]; rej(new Error('load ' + src)); };
        document.head.appendChild(s);
      });
    }
    return loadScriptOnce._p[src];
  }
  function gbToBook(v){
    var i = v.volumeInfo || {};
    var ids = i.industryIdentifiers || [];
    var isbn = (ids.filter(function(x){ return x.type==='ISBN_13'; })[0] || ids.filter(function(x){ return x.type==='ISBN_10'; })[0] || {}).identifier || '';
    var img = i.imageLinks && (i.imageLinks.thumbnail || i.imageLinks.smallThumbnail);
    var syn = String(i.description||'').replace(/<[^>]+>/g, '');
    if(syn.length > 420) syn = syn.slice(0, 400).replace(/\s+\S*$/, '') + '…';
    return {
      title: i.title ? (i.title + (i.subtitle ? ': ' + i.subtitle : '')) : '',
      author: (i.authors||[]).join('، '),
      translator:'', publisher: i.publisher||'',
      year: i.publishedDate ? Number(String(i.publishedDate).slice(0,4)) || null : null,
      pages: i.pageCount || null, genre:'', series:'', synopsis: syn, isbn: isbn,
      coverUrl: img ? img.replace(/^http:/, 'https:').replace('&edge=curl', '') : ''
    };
  }
  function webBookSearch(q){
    var url = 'https://www.googleapis.com/books/v1/volumes?maxResults=12&printType=books&q=' + encodeURIComponent(q);
    return fetch(url).then(function(r){ if(!r.ok) throw {code:'net'}; return r.json(); }).then(function(d){
      var seen = {};
      return (d.items||[]).map(gbToBook).filter(function(b){
        if(!b.title) return false;
        var k = normalizeAr(b.title) + '|' + normalizeAr(b.author);
        if(seen[k]) return false; seen[k] = true; return true;
      }).slice(0, 8);
    });
  }
  function isbnLookup(isbn){
    return fetch('https://www.googleapis.com/books/v1/volumes?q=isbn:' + isbn).then(function(r){ return r.ok ? r.json() : {}; }).then(function(d){
      if(d.items && d.items.length){ var b = gbToBook(d.items[0]); b.isbn = b.isbn || isbn; return b; }
      return fetch('https://openlibrary.org/api/books?format=json&jscmd=data&bibkeys=ISBN:' + isbn).then(function(r){ return r.ok ? r.json() : {}; }).then(function(o){
        var x = o['ISBN:' + isbn]; if(!x) return null;
        return {title:x.title||'', author:(x.authors||[]).map(function(a){ return a.name; }).join('، '), translator:'',
          publisher:((x.publishers||[])[0]||{}).name||'', year:x.publish_date ? (Number(String(x.publish_date).match(/\d{4}/))||null) : null,
          pages:x.number_of_pages||null, genre:'', series:'', synopsis:'', isbn:isbn, coverUrl:(x.cover && (x.cover.large||x.cover.medium))||''};
      });
    }).catch(function(){ return null; });
  }
  function urlToCover(url, cb){
    fetch(url).then(function(r){ if(!r.ok) throw 0; return r.blob(); })
      .then(function(blob){ handleCoverFile(blob, cb); })
      .catch(function(){ cb(url); });
  }
  function readIsbnFromPhoto(file){
    function pick(texts){
      return texts.map(function(t){ return String(t||'').replace(/[^0-9X]/gi,''); })
        .filter(function(v){ return /^97[89]\d{10}$/.test(v) || /^\d{9}[\dX]$/i.test(v); })[0] || '';
    }
    var native = (typeof window.BarcodeDetector==='function' && typeof createImageBitmap==='function')
      ? createImageBitmap(file).then(function(bmp){ return new window.BarcodeDetector().detect(bmp); })
          .then(function(codes){ return pick((codes||[]).map(function(c){ return c.rawValue; })); }).catch(function(){ return ''; })
      : Promise.resolve('');
    return native.then(function(found){
      if(found) return found;
      return loadScriptOnce('https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js', 'ZXing').then(function(Z){
        var hints = new Map();
        hints.set(Z.DecodeHintType.POSSIBLE_FORMATS, [Z.BarcodeFormat.EAN_13, Z.BarcodeFormat.UPC_A, Z.BarcodeFormat.EAN_8]);
        hints.set(Z.DecodeHintType.TRY_HARDER, true);
        var reader = new Z.BrowserMultiFormatReader(hints);
        var url = URL.createObjectURL(file);
        return reader.decodeFromImageUrl(url).then(function(res){ URL.revokeObjectURL(url); return pick([res.getText()]); },
          function(){ URL.revokeObjectURL(url); return ''; });
      }).catch(function(){ return ''; });
    });
  }
  function ocrQueryFromPhoto(file){
    return loadScriptOnce('https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js', 'Tesseract').then(function(T){
      return T.recognize(file, 'ara+eng');
    }).then(function(r){
      var lines = String((r && r.data && r.data.text) || '').split('\n').map(function(l){ return l.replace(/[^؀-ۿA-Za-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim(); })
        .filter(function(l){ return l.replace(/[^؀-ۿA-Za-z]/g, '').length >= 3; });
      return lines.slice(0, 3).join(' ');
    }).catch(function(){ return ''; });
  }
  function identifyBookFromPhoto(file){
    var isbn = '';
    return readIsbnFromPhoto(file).then(function(code){
      isbn = code;
      if(isbn) return isbnLookup(isbn).then(function(b){ return b ? {book:b, viaBarcode:true} : null; });
      return null;
    }).then(function(hit){
      if(hit) return hit;
      return ocrQueryFromPhoto(file).then(function(q){
        if(!q) throw {code:'not_found'};
        return webBookSearch(q).then(function(list){
          if(!list.length) throw {code:'not_found'};
          return {book:list[0], viaBarcode:false, guess:true};
        });
      });
    }).then(function(r){
      var b = r.book;
      if(!b.isbn && isbn) b.isbn = isbn;
      /* لو صوّرتي الغلاف من قدّام نستخدم صورتك، ولو باركود نجيب الغلاف من النت */
      if(!r.viaBarcode) return new Promise(function(res){ handleCoverFile(file, function(d){ res({book:b, cover:d, guess:r.guess}); }); });
      if(!b.coverUrl) return {book:b, cover:null};
      return new Promise(function(res){ urlToCover(b.coverUrl, function(d){ res({book:b, cover:d}); }); });
    });
  }
  function photoErrorText(err){
    var c = err && err.code;
    if(c==='not_found') return 'ما عرفت الكتاب. جرّبي صورة أوضح للباركود (ورا الكتاب)، أو اكتبي اسمه.';
    return 'صار خطأ، تأكّدي من النت وجرّبي مرة ثانية.';
  }

