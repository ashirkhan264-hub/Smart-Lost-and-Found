const DB={get:(k,d)=>{try{return JSON.parse(localStorage.getItem('slf_'+k))??d}catch(e){return d}},set:(k,v)=>localStorage.setItem('slf_'+k,JSON.stringify(v))};
const CATS=['Electronics','Bags','Wallet/Cards','Keys','Clothing','Books/Stationery','Other'];
const LOCS=['Library','Cafeteria','Main Gate','Admin Block','CS Department','Mosque','Sports Ground','Hostel','Other'];
const ICON={
 Electronics:'<rect x="7" y="2.5" width="10" height="19" rx="2"/><path d="M10 5h4M11 18.5h2"/>',
 Bags:'<path d="M6 8h12l1 13H5L6 8Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2M8 13h8v4H8z"/>',
 'Wallet/Cards':'<rect x="3" y="6" width="18" height="14" rx="2"/><path d="M3 9h18M16 14h2"/>',
 Keys:'<circle cx="8" cy="9" r="4"/><path d="m11 12 8 8m-3-3 2-2m-5-1 2-2"/>',
 Clothing:'<path d="m8 4 4 2 4-2 5 4-3 3-2-2v12H8V9l-2 2-3-3 5-4Z"/>',
 'Books/Stationery':'<path d="M4 4h7a3 3 0 0 1 3 3v13a3 3 0 0 0-3-3H4z"/><path d="M20 4h-3a3 3 0 0 0-3 3v13a3 3 0 0 1 3-3h3z"/>',
 Other:'<path d="m3 7 9-4 9 4-9 4-9-4Z"/><path d="M3 7v10l9 4 9-4V7M12 11v10"/>'
};
const $=(s,r=document)=>r.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function iconFor(category){return `<svg class="category-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[category]||ICON.Other}</svg>`}
function animateCount(element,value,duration=850){
 const target=Number(value);
 if(!element||!Number.isFinite(target))return;
 if(window.matchMedia('(prefers-reduced-motion: reduce)').matches){element.textContent=Math.round(target).toLocaleString();return}
 const start=performance.now();
 const step=now=>{
  const progress=Math.min(1,(now-start)/duration);
  const eased=1-Math.pow(1-progress,3);
  element.textContent=Math.round(target*eased).toLocaleString();
  if(progress<1)requestAnimationFrame(step);
 };
 requestAnimationFrame(step);
}
function animateCounts(root=document){root.querySelectorAll('[data-count]').forEach(element=>animateCount(element,element.dataset.count))}
const uid=()=>Math.random().toString(36).slice(2,9);
const day=(o=0)=>new Date(Date.now()-o*864e5).toISOString().slice(0,10);
const opts=(a,all)=>(all?`<option value="">${all}</option>`:'')+a.map(x=>`<option>${x}</option>`).join('');
(function seed(){
 if(DB.get('seeded'))return;
 DB.set('users',[{name:'Admin',email:'admin@campus.edu',pass:'admin123',role:'admin',blocked:false},{name:'Ali Student',email:'student@campus.edu',pass:'user123',role:'user',blocked:false},{name:'Sara Khan',email:'sara@campus.edu',pass:'user123',role:'user',blocked:false}]);
 const mk=(type,title,category,color,location,d,desc,owner,status='approved')=>({id:uid(),type,title,category,color,location,date:day(d),desc,owner,status,img:''});
 DB.set('items',[
  mk('lost','Black Samsung phone','Electronics','Black','Library',1,'Samsung phone with cracked back cover, black case','student@campus.edu'),
  mk('found','Black phone with cracked cover','Electronics','Black','Library',0,'Samsung phone found on library desk, cracked back','sara@campus.edu'),
  mk('lost','Blue leather wallet','Wallet/Cards','Blue','Cafeteria',2,'Blue wallet with student card inside','sara@campus.edu'),
  mk('found','Blue wallet','Wallet/Cards','Blue','Cafeteria',1,'Blue leather wallet, student card inside','student@campus.edu'),
  mk('found','Bunch of keys','Keys','Silver','Main Gate',3,'Three keys with a red keychain','sara@campus.edu'),
  mk('lost','Grey hoodie','Clothing','Grey','Sports Ground',4,'Grey hoodie size M with university logo','sara@campus.edu','pending')]);
 DB.set('claims',[]);DB.set('seeded',1);
})();
const me=()=>DB.get('users',[]).find(u=>u.email===DB.get('session'));
function need(role){const u=me();if(!u||(role&&u.role!==role)){location.href='login.html';throw 0}return u}
function logout(){localStorage.removeItem('slf_session');location.href='index.html'}
function toast(m){const t=$('#toast');t.textContent=m;t.style.display='block';clearTimeout(t._t);t._t=setTimeout(()=>t.style.display='none',2600)}
const APP_API='http://localhost:5000/api';
function layout(active){
 const u=me();
 const L=[['index.html','Home'],['search.html','Search items'],['report.html','Report item'],['matches.html','My matches'],['my-reports.html','My reports']];
 if(u&&u.role==='admin')L.push(['admin.html','Admin']);
 document.body.insertAdjacentHTML('afterbegin',`<nav><div class="wrap"><b><svg class="brand-mark" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 5 5"/></svg> Smart Lost &amp; Found</b>${L.map(l=>`<a href="${l[0]}" class="${l[0]===active?'on':''}">${l[1]}</a>`).join('')}${u?`<a href="#" onclick="logout()">Logout (${esc(u.name.split(' ')[0])})</a>`:'<a href="login.html">Login</a>'}</div></nav><div id="toast"></div>
 <dialog id="claimDlg"><form onsubmit="return submitClaim(event)"><h3>Send claim request</h3><p class="meta" id="claimFor"></p><label>Proof of ownership / details</label><textarea id="claimMsg" rows="4" required placeholder="Describe something only the owner would know"></textarea><p id="claimError" class="claim-error" role="alert" hidden></p><div style="display:flex;gap:.5rem;margin-top:1rem"><button id="claimSubmit" class="btn tag">Send for admin verification</button><button id="claimCancel" type="button" class="btn ghost" onclick="$('#claimDlg').close()">Cancel</button></div></form></dialog>`)}
let claimId=null, claimSourceItemId=null;
function openClaim(id,sourceItemId=null,title='',locationName=''){
 const u=me();
 if(!u){toast('Please login to send a claim');setTimeout(()=>location.href='login.html',900);return}
 claimId=Number(id);
 claimSourceItemId=sourceItemId===null?null:Number(sourceItemId);
 $('#claimFor').textContent=title&&locationName?`${title} - ${locationName}`:title||'Item claim';
 $('#claimMsg').value='';
 $('#claimError').hidden=true;
 $('#claimError').textContent='';
 $('#claimDlg').showModal();
}
function openClaimFromButton(event,id,sourceItemId=null){
 const button=event.currentTarget;
 openClaim(id,sourceItemId,button.dataset.title,button.dataset.location);
}
function claimButton(item,sourceItemId=null){
 const u=me();
 if(sourceItemId===null&&u&&u.email.toLowerCase()===String(item.owner_email||item.owner||'').toLowerCase())return '';
 const label=sourceItemId!==null?'Send match claim':item.type==='found'?'This is mine':'I found this';
 return `<button class="btn sm tag" data-title="${esc(item.title)}" data-location="${esc(item.location)}" onclick="openClaimFromButton(event,${Number(item.id)},${sourceItemId===null?'null':Number(sourceItemId)})">${label}</button>`;
}
async function submitClaim(e){
 e.preventDefault();
 const u=me();
 if(!u){toast('Please login to send a claim');location.href='login.html';return false}
 const submit=$('#claimSubmit');
 const cancel=$('#claimCancel');
 const errorBox=$('#claimError');
 submit.disabled=true;
 cancel.disabled=true;
 submit.textContent='Sending...';
 errorBox.hidden=true;
 errorBox.textContent='';
 try{
  const r=await fetch(APP_API+'/claims',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
   itemId:claimId,sourceItemId:claimSourceItemId,by:u.email,msg:$('#claimMsg').value.trim()
  })});
  const d=await r.json().catch(()=>({}));
  if(!r.ok){
   const message=d.message||'Could not send claim. Please try again.';
   errorBox.textContent=message.includes('A match claim must link your own lost report to your own found report')
    ? 'The API server is outdated. Stop it with Ctrl+C, run "npm start" again, then retry.'
    : message;
   errorBox.hidden=false;
   return false;
  }
  $('#claimDlg').close();
  toast('Claim sent. Pending admin verification.');
 }catch(error){
  errorBox.textContent='Could not reach the server. Check that the API is running, then try again.';
  errorBox.hidden=false;
 }finally{
  submit.disabled=false;
  cancel.disabled=false;
  submit.textContent='Send for admin verification';
 }
 return false;
}
function itemCard(i,claim=true){
 const u=me(),can=claim&&i.status==='approved'&&(!u||u.email!==i.owner);
 return `<div class="card"><div class="thumb" style="${i.img?`background-image:url(${i.img})`:''}">${i.img?'':iconFor(i.category)}</div><div class="body">
 <span class="badge b-${i.type}">${i.type==='lost'?'Lost':'Found'}</span> ${i.status!=='approved'?`<span class="badge s-${i.status}">${i.status}</span>`:''}
 <h3 style="margin-top:.4rem;font-size:1.1rem">${esc(i.title)}</h3><div class="meta">${esc(i.category)}, ${esc(i.color)}<br>${esc(i.location)} on ${i.date}</div>
 <p style="margin:0 0 .6rem;font-size:.92rem">${esc(i.desc)}</p>${can?claimButton(i):''}</div></div>`}
