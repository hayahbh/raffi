(function(){
  var KEY='__fakedb'; function db(){ try{ return JSON.parse(localStorage.getItem(KEY)) || {rows:{}, files:{}, user:null}; }catch(e){ return {rows:{}, files:{}, user:null}; } }
  function save(d){ localStorage.setItem(KEY, JSON.stringify(d)); }
  window.__calls = [];
  var listeners = [];
  function q(t){
    var api = {
      _t:t,
      select:function(){ return {range:function(a,b){ var d=db(); var r=(d.rows[t]||[]).slice().reverse().slice(a,b+1); return Promise.resolve({data:JSON.parse(JSON.stringify(r)), error:null}); }}; },
      upsert:function(rows, opt){ window.__calls.push(['upsert',t,rows.length]); var d=db(); var keys=(opt&&opt.onConflict||'id').split(','); d.rows[t]=d.rows[t]||[];
        rows.forEach(function(r){ r=JSON.parse(JSON.stringify(r)); if(!r.user_id) r.user_id=d.user.id;
          if(t==='books' && !r.title) throw new Error('null title');
          var i=d.rows[t].findIndex(function(x){ return keys.every(function(k){ return x[k]===r[k]; }); });
          if(i>=0) d.rows[t][i]=Object.assign(d.rows[t][i], r); else d.rows[t].push(r); });
        save(d); return Promise.resolve({error:null}); },
      delete:function(){ return {in:function(k, vals){ window.__calls.push(['delete',t,vals.length]); var d=db(); d.rows[t]=(d.rows[t]||[]).filter(function(x){ return vals.indexOf(x[k])<0; }); save(d); return Promise.resolve({error:null}); }}; }
    };
    return api;
  }
  window.supabase = {createClient:function(){ return {
    from:q,
    auth:{
      onAuthStateChange:function(cb){ listeners.push(cb); var d=db(); setTimeout(function(){ cb('INITIAL_SESSION', d.user?{user:d.user}:null); },10); },
      signInWithPassword:function(o){ var d=db(); d.user={id:'11111111-1111-4111-8111-111111111111', email:o.email}; save(d); setTimeout(function(){ listeners.forEach(function(cb){ cb('SIGNED_IN',{user:d.user}); }); },10); return Promise.resolve({data:{session:{}}, error:null}); },
      signUp:function(o){ return this.signInWithPassword(o); },
      signOut:function(){ var d=db(); d.user=null; save(d); return Promise.resolve({}); }
    },
    storage:{from:function(){ return {
      upload:function(path, blob){ window.__calls.push(['upload',path]); var d=db(); d.files[path]=blob.size; save(d); return Promise.resolve({data:{path:path}, error:null}); },
      remove:function(p){ var d=db(); p.forEach(function(x){ delete d.files[x]; }); save(d); return Promise.resolve({}); },
      createSignedUrls:function(paths){ return Promise.resolve({data:paths.map(function(p){ return {path:p, signedUrl:'data:image/gif;base64,R0lGODlhAQABAAAAACw='}; })}); }
    }; }}
  }; }};
})();
