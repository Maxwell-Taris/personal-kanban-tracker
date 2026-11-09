const K='subs',$=s=>document.querySelector(s);let subs=[],filter='全部',editing=null;
const day=864e5,CATS=['AI','视频会员','云存储','工具/其他'];
const today=()=>{const d=new Date();d.setHours(0,0,0,0);return d};
const rel=v=>{if(/^[+-]\d+$/.test(v)){const d=new Date(today().getTime()+(+v)*day);const p=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())}return v};
const left=s=>Math.round((new Date(s.renew+'T00:00:00')-today())/day);
const save=()=>localStorage.setItem(K,JSON.stringify(subs));
const esc=t=>String(t).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const ym=d=>d.getFullYear()+'年'+(d.getMonth()+1)+'月';
const iso=d=>{const p=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())};
async function loadLive(){
 try{
  const res=await fetch('data/live.json?v=8',{cache:'no-store',credentials:'same-origin'});
  if(!res.ok) throw new Error('http '+res.status);
  const live=await res.json();
  if(Array.isArray(live)&&live.length){subs=live.map(s=>({...s,renew:rel(s.renew)}));save();return true}
 }catch(e){}
 return false
}
function setLoadStatus(msg,kind){
 let el=$('#loadStatus');
 if(!el){
  el=document.createElement('p');el.id='loadStatus';
  const hero=document.querySelector('.hero');
  if(hero&&hero.parentNode) hero.after(el); else document.body.prepend(el);
 }
 if(!msg){el.hidden=true;el.textContent='';el.className='load-status';return}
 el.hidden=false;el.textContent=msg;el.className='load-status '+(kind||'warn');
}
async function seed(){
 if(await loadLive())return;
 const r=await fetch('data/subscriptions.example.json',{credentials:'same-origin'});
 if(!r.ok) throw new Error('http '+r.status);
 subs=(await r.json()).map(s=>({...s,renew:rel(s.renew)}));save()
}
function render(){ hideCalPop();
 const cats=['全部',...new Set([...CATS,...subs.map(s=>s.category)])];
 $('#filters').innerHTML=cats.map(c=>`<button class="${c===filter?'on':''}" data-c="${c}">${c}</button>`).join('');
 const extra=[...new Set([...CATS,...subs.map(s=>s.category)])];
 $('#cats').innerHTML=extra.map(c=>`<option>${esc(c)}</option>`).join('');
 $('#total').textContent='¥'+subs.reduce((a,s)=>a+ +s.price,0).toFixed(0);
 $('#count').textContent=subs.length;
 $('#soon').textContent=subs.filter(s=>left(s)<=7).length;
 renderUpcoming();
 const shown=subs.filter(s=>filter==='全部'||s.category===filter),groups={};
 shown.sort((a,b)=>left(a)-left(b)).forEach(s=>(groups[s.category]??=[]).push(s));
 $('#list').innerHTML=Object.entries(groups).map(([c,arr])=>`<h3><span>${esc(c)}</span><span>¥${arr.reduce((a,s)=>a+ +s.price,0).toFixed(0)}/月</span></h3><div class="grid">${arr.map(card).join('')}</div>`).join('')||'<p class="hint">还没有订阅，点「添加订阅」开始。</p>';
}
function card(s){const d=left(s),a=d<=7;const b=d<0?'<span class="badge b-red">已过期</span>':a?'<span class="badge b-red">即将到期</span>':'';
 return `<div class="card ${a?'alert':''}" data-id="${s.id}"><div class="ch"><div class="name">${esc(s.name)}${b}${s.example?'<span class="badge b-ex">示例</span>':''}</div><div class="price">${s.recurring==='yearly'?'¥'+(+s.annualPrice)+'<small>/年</small>':'¥'+(+s.price)+'<small>/月</small>'}</div></div>
 <div class="meta"><span class="due">${d<0?`已过期 ${-d} 天`:d===0?'今天到期':`${d} 天后 · ${s.renew}`}</span><span>${esc(s.payment)}</span></div></div>`}
function drawMonth(y,m,start,end,byDay){
 const first=new Date(y,m,1), last=new Date(y,m+1,0);
 let cells='';
 for(let i=0;i<first.getDay();i++) cells+='<span></span>';
 for(let d=1;d<=last.getDate();d++){
  const dt=new Date(y,m,d), key=iso(dt);
  const inWin=dt>=start && dt<=end;
  const hits=byDay[key]||[];
  const hot=hits.some(s=>left(s)<=7);
  const cls=[inWin?'':'out', key===iso(start)?'today':'', hits.length?(hot?'hot':'has'):''].filter(Boolean).join(' ');
  cells+=`<span class="${cls}"${hits.length?` data-day="${key}" role="button" tabindex="0"`:''} title="${hits.map(s=>s.name).join('、')}">${d}</span>`;
 }
 return `<div class="cal"><h4>${y}年${m+1}月</h4><div class="wd">${'日一二三四五六'.split('').map(x=>`<span>${x}</span>`).join('')}</div><div class="days">${cells}</div></div>`;
}
function renderUpcoming(){
 const start=today(), end=new Date(start.getTime()+30*day);
 const items=subs.filter(s=>{const d=left(s);return d>=0&&d<=30}).sort((a,b)=>left(a)-left(b));
 const byDay={};items.forEach(s=>(byDay[s.renew]??=[]).push(s));
 const sum=items.reduce((a,s)=>a+ +s.price,0);
 let months='', y=start.getFullYear(), m=start.getMonth();
 while(new Date(y,m,1)<=end){months+=drawMonth(y,m,start,end,byDay);m++;if(m>11){m=0;y++}}
 const list=items.length?items.map(s=>{
  const d=left(s), a=d<=7;
  const when=d===0?'今天到期':`${d} 天后 · ${s.renew}`;
  return `<div class="up-item ${a?'alert':''}" data-id="${s.id}"><div class="l"><span class="n">${esc(s.name)}</span><span class="w">${when} · ${esc(s.payment)}</span></div><b>${s.recurring==='yearly'?'¥'+(+s.annualPrice)+'/年':'¥'+(+s.price)}</b></div>`;
 }).join(''):'<p class="up-empty">未来 30 天没有续费。</p>';
 const upHtml=`<div class="uh"><span>未来 30 天续费</span><b>${items.length} 笔 · ¥${sum.toFixed(0)}</b></div><div class="cals">${months}</div><div class="up-list">${list}</div>`;
 $('#upcoming').innerHTML=upHtml;bindCalDays();
}
function open(s){editing=s;const f=$('#form');f.reset();$('#dlgTitle').textContent=s?'编辑订阅':'添加订阅';$('#del').style.display=s?'':'none';
 if(s)['name','category','price','renew','payment'].forEach(k=>f[k].value=s[k]);$('#dlg').showModal()}
$('#filters').onclick=e=>{if(e.target.dataset.c){filter=e.target.dataset.c;render()}};
$('#list').onclick=e=>{const c=e.target.closest('.card');if(c)open(subs.find(s=>s.id===c.dataset.id))};
function priceText(s){
 if(s.priceNote) return s.priceNote;
 if(s.priceMin!=null && s.priceMax!=null) return '约 '+s.priceMin+'–'+s.priceMax+' / 月';
 return '¥'+(+s.price)+'/月';
}
function hideCalPop(){const p=$('#calPop');if(p)p.remove()}
function showCalPop(el){
 const key=el.dataset.day;if(!key)return;
 const hits=subs.filter(s=>s.renew===key);if(!hits.length)return;
 hideCalPop();
 const pop=document.createElement('div');
 pop.id='calPop';pop.className='cal-pop';pop.setAttribute('role','dialog');
 pop.innerHTML='<p>'+esc(key)+' 的续费</p>'+hits.map(s=>'<div class="cal-hit"><div class="n">'+esc(s.name)+'</div><div class="d">'+esc(priceText(s))+' · 续费日 '+esc(s.renew)+'</div></div>').join('');
 document.body.appendChild(pop);
 const r=el.getBoundingClientRect(), pw=pop.offsetWidth, ph=pop.offsetHeight;
 let left=r.left+r.width/2-pw/2;
 left=Math.max(8,Math.min(left,innerWidth-pw-8));
 let top=r.bottom+8;
 if(top+ph>innerHeight-8) top=Math.max(8,r.top-ph-8);
 pop.style.left=left+'px';pop.style.top=top+'px';
}
function dayCell(el){return el&&el.closest?el.closest('#upcoming [data-day], [data-day]'):null}
function bindCalDays(){
 $('#upcoming').querySelectorAll('[data-day]').forEach(el=>{
  el.addEventListener('click',ev=>{ev.preventDefault();ev.stopPropagation();showCalPop(el)});
  el.addEventListener('pointerup',ev=>{if(ev.pointerType==='touch'){ev.preventDefault();ev.stopPropagation();showCalPop(el)}});
 });
}
$('#upcoming').addEventListener('click',e=>{
 const dayEl=e.target.closest('[data-day]');
 if(dayEl&&$('#upcoming').contains(dayEl)){e.preventDefault();e.stopPropagation();showCalPop(dayEl);return}
 hideCalPop();
 const c=e.target.closest('.up-item');if(c)open(subs.find(s=>s.id===c.dataset.id));
});
document.addEventListener('click',e=>{
 if(e.target.closest('#calPop')) return;
 if(e.target.closest('[data-day]')&&e.target.closest('#upcoming')) return;
 hideCalPop();
});
document.addEventListener('keydown',e=>{if(e.key==='Escape')hideCalPop()});
window.addEventListener('resize',hideCalPop);
$('#upcoming').addEventListener('keydown',e=>{
 if(e.key!=='Enter'&&e.key!==' ')return;
 const dayEl=e.target.closest('[data-day]');
 if(!dayEl)return;
 e.preventDefault();showCalPop(dayEl);
});
$('#add').onclick=()=>open(null);
$('#dlg').addEventListener('close',()=>{if($('#dlg').returnValue!=='ok')return;const f=$('#form'),v={name:f.name.value.trim(),category:f.category.value.trim(),price:+f.price.value,renew:f.renew.value,payment:f.payment.value.trim()};
 if(!v.name||!v.category||!v.renew||!v.payment)return;
 if(editing)Object.assign(editing,v,{example:false});else subs.push({id:'s'+Date.now(),...v});save();render()});
$('#del').onclick=()=>{if(confirm('删除这条订阅？')){subs=subs.filter(s=>s!==editing);save();render();$('#dlg').close()}};
$('#export').onclick=()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(subs,null,2)],{type:'application/json'}));a.download='subscriptions.json';a.click()};
$('#import').onchange=async e=>{try{const d=JSON.parse(await e.target.files[0].text());if(!Array.isArray(d))throw 0;subs=d.map((s,i)=>({id:s.id||'i'+i+Date.now(),...s,renew:rel(s.renew)}));save();render()}catch{alert('JSON 格式不对')}};
$('#reset').onclick=async()=>{if(confirm('清空当前数据并恢复示例？')){await seed();render()}};

function realSubs(){return subs.filter(s=>!s.example)}
function canNotify(){return typeof Notification!=='undefined'}
async function askNotify(){
 if(!canNotify()){alert('当前环境不支持系统通知');return false}
 if(Notification.permission==='granted')return true;
 if(Notification.permission==='denied'){alert('通知已被关闭，请在浏览器或系统设置里打开');return false}
 const p=await Notification.requestPermission();return p==='granted';
}
function showNote(title,body,tag){
 if(!canNotify()||Notification.permission!=='granted')return;
 const opt={body,icon:'icons/icon-192.png',badge:'icons/icon-192.png',tag:tag||title};
 if(navigator.serviceWorker) navigator.serviceWorker.ready.then(r=>r.showNotification(title,opt)).catch(()=>new Notification(title,opt));
 else new Notification(title,opt);
}
function checkRenewalNotifs(){
 if(!canNotify()||Notification.permission!=='granted')return;
 realSubs().forEach(s=>{
  const d=left(s);
  if(d!==3&&d!==1)return;
  const key='notif-sent:'+s.id+':'+d+':'+s.renew;
  if(localStorage.getItem(key))return;
  showNote(d===3?'订阅还有 3 天续费':'订阅明天续费',`${s.name} · ¥${s.price} · ${s.renew}`,key);
  localStorage.setItem(key,'1');
 });
}
const en=$('#enableNotif'), tn=$('#testNotif');
if(en) en.onclick=async()=>{if(await askNotify()){alert('通知已开启。续费前 3 天和 1 天会提醒你。');checkRenewalNotifs()}};
if(tn) tn.onclick=async()=>{if(!(await askNotify()))return;showNote('订阅看板测试','如果看到这条，通知已经打通。续费前 3 天和 1 天会这样提醒你。','test-'+Date.now())};

$('#theme').onclick=()=>{const t=document.documentElement.dataset.theme==='dark'?'light':'dark';document.documentElement.dataset.theme=t;localStorage.setItem('theme',t);document.querySelector('meta[name=theme-color]').content=t==='dark'?'#0b1020':'#f4f5fb'};
(async()=>{
 const ok=await loadLive();
 if(!ok){
  const raw=localStorage.getItem(K);
  if(raw){try{subs=JSON.parse(raw)}catch{subs=[]}}
  if(!Array.isArray(subs)) subs=[];
  if(subs.length){
   setLoadStatus('无法从服务器同步最新订阅，正在显示本机已有缓存。请确认登录与网络后刷新。','warn');
  }else{
   subs=[];
   setLoadStatus('无法加载订阅数据（未登录、离线或服务器不可用）。当前统计为0不代表没有订阅，请登录后刷新。','err');
  }
 }else{
  setLoadStatus('');
 }
 render();
 checkRenewalNotifs();
})();
if('serviceWorker'in navigator)navigator.serviceWorker.register('sw.js');
