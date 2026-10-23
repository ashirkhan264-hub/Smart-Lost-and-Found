const DB={get:(k,d)=>{try{return JSON.parse(localStorage.getItem('slf_'+k))??d}catch(e){return d}},set:(k,v)=>localStorage.setItem('slf_'+k,JSON.stringify(v))};
const CATS=['Electronics','Bags','Wallet/Cards','Keys','Clothing','Books/Stationery','Other'];
const LOCS=['Library','Cafeteria','Main Gate','Admin Block','CS Department','Mosque','Sports Ground','Hostel','Other'];
const ICON={Electronics:'📱',Bags:'🎒','Wallet/Cards':'👛',Keys:'🔑',Clothing:'🧥','Books/Stationery':'📚',Other:'📦'};
const $=(s,r=document)=>r.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
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
 document.body.insertAdjacentHTML('afterbegin',`<nav><div class="wrap"><b>🔎 Smart Lost &amp; Found</b>${L.map(l=>`<a href="${l[0]}" class="${l[0]===active?'on':''}">${l[1]}</a>`).join('')}${u?`<a href="#" onclick="logout()">Logout (${esc(u.name.split(' ')[0])})</a>`:'<a href="login.html">Login</a>'}</div></nav><div id="toast"></div>
 <dialog id="claimDlg"><form onsubmit="return submitClaim(event)"><h3>Send claim request</h3><p class="meta" id="claimFor"></p><label>Proof of ownership / details</label><textarea id="claimMsg" rows="4" required placeholder="Describe something only the owner would know"></textarea><div style="display:flex;gap:.5rem;margin-top:1rem"><button class="btn tag">Send for admin verification</button><button type="button" class="btn ghost" onclick="$('#claimDlg').close()">Cancel</button></div></form></dialog>`)}
let claimId=null, claimSourceItemId=null;
function openClaim(id,sourceItemId=null,title='',locationName=''){
 const u=me();
 if(!u){toast('Please login to send a claim');setTimeout(()=>location.href='login.html',900);return}
 claimId=Number(id);
 claimSourceItemId=sourceItemId===null?null:Number(sourceItemId);
 $('#claimFor').textContent=title&&locationName?`${title} - ${locationName}`:title||'Item claim';
 $('#claimMsg').value='';
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
 const submit=e.submitter;
 if(submit)submit.disabled=true;
 try{
  const r=await fetch(APP_API+'/claims',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
   itemId:claimId,sourceItemId:claimSourceItemId,by:u.email,msg:$('#claimMsg').value.trim()
  })});
  const d=await r.json();
  if(!r.ok){toast(d.message||'Could not send claim');return false}
  $('#claimDlg').close();
  toast('Claim sent. Pending admin verification.');
 }catch(error){toast('Cannot reach server. Is node server.js running?')}
 finally{if(submit)submit.disabled=false}
 return false;
}
function itemCard(i,claim=true){
 const u=me(),can=claim&&i.status==='approved'&&(!u||u.email!==i.owner);
 return `<div class="card"><div class="thumb" style="${i.img?`background-image:url(${i.img})`:''}">${i.img?'':ICON[i.category]||'📦'}</div><div class="body">
 <span class="badge b-${i.type}">${i.type==='lost'?'Lost':'Found'}</span> ${i.status!=='approved'?`<span class="badge s-${i.status}">${i.status}</span>`:''}
 <h3 style="margin-top:.4rem;font-size:1.1rem">${esc(i.title)}</h3><div class="meta">${esc(i.category)}, ${esc(i.color)}<br>${esc(i.location)} on ${i.date}</div>
 <p style="margin:0 0 .6rem;font-size:.92rem">${esc(i.desc)}</p>${can?claimButton(i):''}</div></div>`}
