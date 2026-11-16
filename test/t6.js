const {chromium}=require('playwright');const fs=require('fs');
(async()=>{const b=await chromium.launch();const ctx=await b.newContext({viewport:{width:820,height:1100}});const p=await ctx.newPage();
const errs=[];p.on('pageerror',e=>errs.push(e.message));
await ctx.route('**/*',r=>{const u=r.request().url();
 if(u.includes('supabase.min.js'))return r.fulfill({body:fs.readFileSync('test/fake-supabase.js','utf8'),contentType:'text/javascript'});
 if(u.includes('googleapis.com/books'))return r.fulfill({status:429,body:'{}',headers:{'access-control-allow-origin':'*'}});
 if(u.includes('openlibrary.org/search'))return r.fulfill({body:JSON.stringify({docs:[{title:'Pulp',author_name:['Ed Brubaker','Sean Phillips'],first_publish_year:2020,number_of_pages_median:72,cover_i:123,isbn:['9781534316973']}]}),contentType:'application/json',headers:{'access-control-allow-origin':'*'}});
 if(u.startsWith('file:'))return r.continue(); if(u.includes('xlsx'))return r.fulfill({body:'',contentType:'text/javascript'}); return r.abort();});
await p.goto('file://'+process.cwd()+'/index.html');await p.waitForTimeout(500);
await p.fill('#login-overlay input[type=email]','h@x.com');await p.fill('#login-overlay input[type=password]','secret123');await p.click('#login-overlay .btn');await p.waitForTimeout(800);
for(const x of await p.$$('.topbar button')){ if((await x.textContent()).includes('🔍')) await x.click(); }
await p.waitForTimeout(300);await p.fill('#global-search-overlay input','Pulp');await p.click('text=دوّري لي خارج رفّي');await p.waitForTimeout(800);
console.log((await p.$eval('#global-search-overlay', e=>e.innerText)).split('\n').slice(4,9).join(' | '));
console.log(errs);await b.close();})();
