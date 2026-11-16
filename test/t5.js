const {chromium}=require('playwright');const fs=require('fs');
(async()=>{const b=await chromium.launch();const ctx=await b.newContext({viewport:{width:820,height:1100}});const p=await ctx.newPage();
const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('dialog',d=>d.accept());
await ctx.route('**/*',r=>{const u=r.request().url();
 if(u.includes('supabase.min.js'))return r.fulfill({body:fs.readFileSync('test/fake-supabase.js','utf8'),contentType:'text/javascript'});
 if(u.startsWith('file:'))return r.continue(); if(u.includes('xlsx'))return r.fulfill({body:'',contentType:'text/javascript'}); return r.abort();});
await p.goto('file://'+process.cwd()+'/index.html');await p.waitForTimeout(500);
await p.fill('#login-overlay input[type=email]','h@x.com');await p.fill('#login-overlay input[type=password]','secret123');await p.click('#login-overlay .btn');await p.waitForTimeout(800);
await p.click('.tab >> text=إحصائياتي');await p.waitForTimeout(300);
const [fc]=await Promise.all([p.waitForEvent('filechooser'), p.click('text=استعادة من ملف')]);await fc.setFiles('/home/claude/raffi-private/raffi-import.json');await p.waitForTimeout(8000);
// go offline: make fake supabase fail network
await ctx.setOffline(true);
await p.evaluate(()=>{ localStorage.setItem('__offline','1'); });
await p.reload();await p.waitForTimeout(1500);
await p.click('.tab >> text=مكتبتي');await p.waitForTimeout(400);
console.log('offline: login?', !!await p.$('#login-overlay'), 'cards', await p.$$eval('.book-card',x=>x.length));
// add a wishlist item offline
await p.click('.tab >> text=الأمنيات');await p.waitForTimeout(300);
await p.click('text=+ كتاب جديد للقائمة');await p.waitForTimeout(300);
await p.fill('#shop-add-overlay input[type=text]','كتاب بدون نت');
await p.click('#shop-add-overlay >> text=أضيفيه للقائمة');await p.waitForTimeout(2500);
console.log('badge', await p.evaluate(()=>[...document.querySelectorAll('div')].map(d=>d.textContent).find(t=>t&&t.startsWith('محفوظ على جهازك'))));
console.log('in db before online', await p.evaluate(()=>JSON.parse(localStorage.getItem('__fakedb')).rows.wishlist.some(w=>w.title==='كتاب بدون نت')));
await ctx.setOffline(false); await p.evaluate(()=>{ localStorage.removeItem('__offline'); window.dispatchEvent(new Event('online')); });await p.waitForTimeout(3000);
console.log('in db after online', await p.evaluate(()=>JSON.parse(localStorage.getItem('__fakedb')).rows.wishlist.some(w=>w.title==='كتاب بدون نت')));
console.log(errs);await b.close();})();
