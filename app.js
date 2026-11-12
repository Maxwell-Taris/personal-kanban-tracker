const K='subs',$=s=>document.querySelector(s);let subs=[],oneoffs=[],filter='全部',editing=null;
const day=864e5,CATS=['AI','视频会员','云存储','工具/其他'];
const today=()=>{const d=new Date();d.setHours(0,0,0,0);return d};
const rel=v=>{if(/^[+-]\d+$/.test(v)){const d=new Date(today().getTime()+(+v)*day);const p=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())}return v};
const left=s=>Math.round((new Date(s.renew+'T00:00:00')-today())/day);
const save=()=>localStorage.setItem(K,JSON.stringify(subs));
const esc=t=>String(t).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

function currencySym(s){const c=String(s.currency||'CNY').toUpperCase();return c==='USD'||c==='$'?'$':'¥'}
function priceUnknown(s){return s.pricePending===true||(s.price==null&&s.annualPrice==null)}
function monthlyAmount(s){return priceUnknown(s)?0:(+s.price||0)}
function pendingLabel(s){return s.priceNote?esc(s.priceNote):'待补'}
function moneyCard(s){
 if(priceUnknown(s)) return pendingLabel(s);
 if(s.priceNote) return esc(s.priceNote);
 const sym=currencySym(s);
 if(s.recurring==='yearly') return sym+(+s.annualPrice)+'<small>/年</small>';
 return sym+(+s.price)+'<small>/月</small>';
}
function moneyShort(s){
 if(priceUnknown(s)) return s.priceNote||'待补';
 if(s.recurring==='yearly') return currencySym(s)+(+s.annualPrice)+'/年';
 if(s.priceNote && String(s.currency||'').toUpperCase()==='USD') return '$'+(+s.price);
 return currencySym(s)+(+s.price);
}
function attentionItems(){return subs.filter(s=>s.remind!==false&&left(s)<=7).sort((a,b)=>left(a)-left(b))}
function attentionWhy(s){const d=left(s);return d<0?`已过期 ${-d} 天`:d===0?'今天到期':`${d} 天后到期 · ${s.renew}`}
function hideSoonPop(){const p=$('#soonPop');if(p)p.remove()}
function showSoonPop(anchor){
 hideSoonPop();hideCalPop();
 const items=attentionItems();
 const pop=document.createElement('div');
 pop.id='soonPop';pop.className='soon-pop';pop.setAttribute('role','dialog');
 if(!items.length){
  pop.innerHTML='<p class="soon-empty">暂无需要关注的事项</p>';
 }else{
  pop.innerHTML='<p class="soon-title">需关注 · '+items.length+' 项</p>'+items.map(s=>
   '<button type="button" class="soon-hit" data-id="'+esc(s.id)+'"><span class="n">'+esc(s.name)+'</span><span class="d">'+esc(attentionWhy(s))+(s.payment?' · '+esc(s.payment):'')+'</span></button>'
  ).join('');
 }
 document.body.appendChild(pop);
 const el=anchor||document.querySelector('.stat.warn');
 const r=el.getBoundingClientRect(), pw=pop.offsetWidth, ph=pop.offsetHeight;
 let left=r.left+r.width/2-pw/2;
 left=Math.max(8,Math.min(left,innerWidth-pw-8));
 let top=r.bottom+8;
 if(top+ph>innerHeight-8) top=Math.max(8,r.top-ph-8);
 pop.style.left=left+'px';pop.style.top=top+'px';
 pop.querySelectorAll('.soon-hit').forEach(btn=>{
  btn.addEventListener('click',ev=>{ev.stopPropagation();const s=subs.find(x=>x.id===btn.dataset.id);hideSoonPop();if(s)open(s)});
 });
}
const ym=d=>d.getFullYear()+'年'+(d.getMonth()+1)+'月';
const iso=d=>{const p=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())};
const parseDay=s=>{const d=new Date(String(s)+'T00:00:00');return isNaN(d)?null:d};
async function loadLive(){
 try{
  const res=await fetch('data/live.json?v=13',{cache:'no-store',credentials:'same-origin'});
  if(!res.ok) throw new Error('http '+res.status);
  const live=await res.json();
  if(Array.isArray(live)&&live.length){subs=live.map(s=>({...s,renew:rel(s.renew)}));save();return true}
 }catch(e){}
 return false
}
async function loadOneoffs(){
 try{
  const res=await fetch('data/oneoffs.json?v=2',{cache:'no-store',credentials:'same-origin'});
  if(!res.ok) throw new Error('http '+res.status);
  const data=await res.json();
  if(Array.isArray(data)){oneoffs=data;return true}
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
function monthKey(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')}
function oneoffMonthTotal(ref){
 const y=ref.getFullYear(),m=ref.getMonth();
 return oneoffs.reduce((a,o)=>{
  const d=parseDay(o.date);if(!d)return a;
  return (d.getFullYear()===y&&d.getMonth()===m)?a+(+o.amount||0):a;
 },0);
}
function oneoffYearTotal(ref){
 const y=ref.getFullYear();
 return oneoffs.reduce((a,o)=>{
  const d=parseDay(o.date);if(!d)return a;
  return d.getFullYear()===y?a+(+o.amount||0):a;
 },0);
}
function render(){ hideCalPop();
 const cats=['全部',...new Set([...CATS,...subs.map(s=>s.category)])];
 $('#filters').innerHTML=cats.map(c=>`<button class="${c===filter?'on':''}" data-c="${c}">${c}</button>`).join('');
 const extra=[...new Set([...CATS,...subs.map(s=>s.category)])];
 $('#cats').innerHTML=extra.map(c=>`<option>${esc(c)}</option>`).join('');
 $('#total').textContent='¥'+subs.reduce((a,s)=>a+monthlyAmount(s),0).toFixed(0);
 const om=$('#oneoffMonth');
 if(om) om.textContent='¥'+oneoffMonthTotal(today()).toFixed(0);
 $('#count').textContent=subs.length;
 const soonN=subs.filter(s=>s.remind!==false&&left(s)<=7).length;$('#soon').textContent=soonN;
 const soonEl=document.querySelector('.stat.warn');
 if(soonEl){soonEl.classList.add('tappable');soonEl.setAttribute('role','button');soonEl.setAttribute('tabindex','0');soonEl.setAttribute('aria-label',soonN?'查看需关注的 '+soonN+' 项':'查看需关注（暂无）');}
 renderUpcoming();
 renderOneoffs();
 renderTrend();
 const shown=subs.filter(s=>filter==='全部'||s.category===filter),groups={};
 shown.sort((a,b)=>left(a)-left(b)).forEach(s=>(groups[s.category]??=[]).push(s));
 $('#list').innerHTML=Object.entries(groups).map(([c,arr])=>`<h3><span>${esc(c)}</span><span>¥${arr.reduce((a,s)=>a+monthlyAmount(s),0).toFixed(0)}/月</span></h3><div class="grid">${arr.map(card).join('')}</div>`).join('')||'<p class="hint">还没有订阅，点「添加订阅」开始。</p>';
}
function card(s){const d=left(s),a=d<=7;const b=d<0?'<span class="badge b-red">已过期</span>':a?'<span class="badge b-red">即将到期</span>':'';
 return `<div class="card ${a?'alert':''}" data-id="${s.id}"><div class="ch"><div class="name">${esc(s.name)}${b}${s.example?'<span class="badge b-ex">示例</span>':''}</div><div class="price">${moneyCard(s)}</div></div>
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
 const sum=items.reduce((a,s)=>a+monthlyAmount(s),0);
 let months='', y=start.getFullYear(), m=start.getMonth();
 while(new Date(y,m,1)<=end){months+=drawMonth(y,m,start,end,byDay);m++;if(m>11){m=0;y++}}
 const list=items.length?items.map(s=>{
  const d=left(s), a=d<=7;
  const when=d===0?'今天到期':`${d} 天后 · ${s.renew}`;
  return `<div class="up-item ${a?'alert':''}" data-id="${s.id}"><div class="l"><span class="n">${esc(s.name)}</span><span class="w">${when} · ${esc(s.payment)}</span></div><b>${moneyShort(s)}</b></div>`;
 }).join(''):'<p class="up-empty">未来 30 天没有续费。</p>';
 const upHtml=`<div class="uh"><span>未来 30 天续费</span><b>${items.length} 笔 · ¥${sum.toFixed(0)}</b></div><div class="cals">${months}</div><div class="up-list">${list}</div>`;
 $('#upcoming').innerHTML=upHtml;bindCalDays();
}
function renderOneoffs(){
 const el=$('#oneoffs');
 if(!el) return;
 const now=today();
 const mTotal=oneoffMonthTotal(now);
 const yTotal=oneoffYearTotal(now);
 const sorted=[...oneoffs].filter(o=>parseDay(o.date)).sort((a,b)=>String(b.date).localeCompare(String(a.date)));
 if(!sorted.length){
  el.innerHTML=`<div class="oh"><span>单笔支出</span><b>暂无记录</b></div><p class="oo-empty">KYC、礼品卡充值等一次性开销会出现在这里，不计入每月订阅总花费。</p>`;
  return;
 }
 const groups={};
 sorted.forEach(o=>{
  const d=parseDay(o.date);
  const key=monthKey(d);
  (groups[key]??=[]).push(o);
 });
 const blocks=Object.keys(groups).sort((a,b)=>b.localeCompare(a)).map(key=>{
  const arr=groups[key];
  const [yy,mm]=key.split('-').map(Number);
  const sum=arr.reduce((a,o)=>a+(+o.amount||0),0);
  const items=arr.map(o=>{
   const note=o.notes?esc(o.notes):'一次性支出';
   const cat=o.category?esc(o.category):'其他';
   return `<div class="oo-item" data-oo="${esc(o.id||'')}">
     <div class="l"><span class="n">${esc(o.name)}<span class="badge b-oo">单笔</span></span>
     <span class="w">${esc(o.date)} · ${cat}<br>${note}</span></div>
     <div class="amt">¥${(+o.amount||0).toFixed(0)}</div>
   </div>`;
  }).join('');
  return `<div class="month-block"><div class="mh"><span>${yy}年${mm}月</span><b>${arr.length} 笔 · ¥${sum.toFixed(0)}</b></div>${items}</div>`;
 }).join('');
 el.innerHTML=`<div class="oh"><span>单笔支出</span><b>本月 ¥${mTotal.toFixed(0)} · 本年 ¥${yTotal.toFixed(0)} · 共 ${sorted.length} 笔</b></div>${blocks}`;
}
function open(s){editing=s;const f=$('#form');f.reset();$('#dlgTitle').textContent=s?'编辑订阅':'添加订阅';$('#del').style.display=s?'':'none';
 if(s)['name','category','price','renew','payment'].forEach(k=>f[k].value=s[k]==null?'':s[k]);$('#dlg').showModal()}
$('#filters').onclick=e=>{if(e.target.dataset.c){filter=e.target.dataset.c;render()}};

(function bindSoonStat(){
 const el=document.querySelector('.stat.warn');
 if(!el||el.dataset.bound)return;el.dataset.bound='1';
 const open=ev=>{ev.preventDefault();ev.stopPropagation();showSoonPop(el)};
 el.addEventListener('click',open);
 el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){open(e)}});
})();
document.addEventListener('click',e=>{
 if(e.target.closest('#soonPop')) return;
 if(e.target.closest('.stat.warn')) return;
 hideSoonPop();
});
document.addEventListener('keydown',e=>{if(e.key==='Escape')hideSoonPop()});
window.addEventListener('resize',hideSoonPop);

$('#list').onclick=e=>{const c=e.target.closest('.card');if(c)open(subs.find(s=>s.id===c.dataset.id))};
function priceText(s){
 if(priceUnknown(s)) return s.priceNote||'待补';
 if(s.priceNote) return s.priceNote;
 if(s.priceMin!=null && s.priceMax!=null) return '约 '+s.priceMin+'–'+s.priceMax+' / 月';
 return '¥'+(+s.price)+'/月';
}
function hideCalPop(){const p=$('#calPop');if(p)p.remove()}
function showCalPop(el){
 const key=el.dataset.day;if(!key)return;
 const hits=subs.filter(s=>s.renew===key);if(!hits.length)return;
 hideCalPop();hideSoonPop();
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
$('#reset').onclick=async()=>{if(confirm('清空当前数据并恢复示例？')){await seed();await loadOneoffs();render()}};


function addMonths(d,n){const x=new Date(d.getFullYear(),d.getMonth()+n,1);return x}
function monthStart(d){return new Date(d.getFullYear(),d.getMonth(),1)}
function monthLabel(key){const [y,m]=key.split('-').map(Number);return y+'年'+m+'月'}
/** Monthly recurring: price each calendar month. Yearly: annualPrice only in renew month. No double-count of QQ monthly equivalent. */
function subChargeInMonth(s, key){
  if(s.example) return 0;
  if(priceUnknown(s)) return 0;
  if(s.recurring==='yearly'){
    const d=parseDay(s.renew);if(!d) return 0;
    return monthKey(d)===key?(+s.annualPrice||0):0;
  }
  return +s.price||0;
}
function earliestTrendStart(){
  const now=monthStart(today());
  let start=now;
  oneoffs.forEach(o=>{const d=parseDay(o.date);if(d){const m=monthStart(d);if(m<start)start=m}});
  subs.forEach(s=>{
    if(s.example)return;
    if(s.recurring==='yearly'){
      const d=parseDay(s.renew);if(!d)return;
      const m=monthStart(d);if(m<=now&&m<start)start=m;
    }
  });
  return start;
}
function buildSpendSeries(){
  const now=monthStart(today());
  let start=earliestTrendStart();
  const minStart=addMonths(now,-23);
  if(start<minStart) start=minStart;
  const months=[];
  for(let cur=new Date(start);cur<=now;cur=addMonths(cur,1)){
    const key=monthKey(cur);
    let subTotal=0;
    subs.forEach(s=>{subTotal+=subChargeInMonth(s,key)});
    const ooTotal=oneoffs.reduce((a,o)=>{
      const d=parseDay(o.date);if(!d)return a;
      return monthKey(d)===key?a+(+o.amount||0):a;
    },0);
    const total=subTotal+ooTotal;
    months.push({key,label:monthLabel(key),subTotal,ooTotal,total});
  }
  let cum=0;
  months.forEach(m=>{cum+=m.total;m.cumulative=cum});
  return months;
}
function renderTrend(){
  const el=$('#trend');
  if(!el) return;
  const series=buildSpendSeries();
  if(!series.length){
    el.innerHTML=`<div class="th"><span>花费趋势</span><b>暂无数据</b></div><p class="empty">有订阅或单笔支出后，这里会显示每月花费与累计。</p>`;
    return;
  }
  const grand=series[series.length-1].cumulative;
  const avg=grand/series.length;
  const maxBar=Math.max(...series.map(m=>m.total),1);
  const maxCum=Math.max(...series.map(m=>m.cumulative),1);
  const W=640,H=220,padL=44,padR=48,padT=18,padB=36;
  const plotW=W-padL-padR, plotH=H-padT-padB;
  const n=series.length;
  const gap=Math.min(18, plotW/(n*3));
  const barW=Math.max(12, (plotW-gap*(n+1))/n);
  const yBar=v=>padT+plotH-(v/maxBar)*plotH;
  const yCum=v=>padT+plotH-(v/maxCum)*plotH;
  const xAt=i=>padL+gap+i*(barW+gap)+barW/2;
  const gridVals=[0,0.5,1].map(t=>maxBar*t);
  const grid=gridVals.map(v=>{
    const y=yBar(v);
    return `<line class="grid-line" x1="${padL}" y1="${y}" x2="${W-padR}" y2="${y}"/><text class="ylab" x="${padL-6}" y="${y+3}" text-anchor="end">¥${Math.round(v)}</text>`;
  }).join('');
  const bars=series.map((m,i)=>{
    const x=padL+gap+i*(barW+gap);
    const y=yBar(m.total);
    const h=Math.max(2, padT+plotH-y);
    const short=String(m.key).slice(5).replace(/^0/,'')+'月';
    const val=m.total>0?`<text class="val" x="${x+barW/2}" y="${y-4}" text-anchor="middle">¥${Math.round(m.total)}</text>`:'';
    return `<rect class="bar" x="${x}" y="${y}" width="${barW}" height="${h}" rx="6"><title>${esc(m.label)}：订阅 ¥${m.subTotal.toFixed(0)} + 单笔 ¥${m.ooTotal.toFixed(0)} = ¥${m.total.toFixed(0)}；累计 ¥${m.cumulative.toFixed(0)}</title></rect>${val}<text class="tick" x="${x+barW/2}" y="${H-14}" text-anchor="middle">${esc(n>6?short:m.label)}</text>`;
  }).join('');
  const pts=series.map((m,i)=>`${xAt(i)},${yCum(m.cumulative)}`).join(' ');
  const dots=series.map((m,i)=>`<circle class="cum-dot" cx="${xAt(i)}" cy="${yCum(m.cumulative)}" r="4"><title>累计 ${esc(m.label)}：¥${m.cumulative.toFixed(0)}</title></circle>`).join('');
  const rightLab=`<text class="ylab" x="${W-padR+6}" y="${yCum(maxCum)+3}" text-anchor="start">累计</text><text class="ylab" x="${W-padR+6}" y="${yCum(0)+3}" text-anchor="start">¥0</text>`;
  const list=series.slice().reverse().map(m=>`<div class="tm-item"><div class="l"><span class="n">${esc(m.label)}</span><span class="w">订阅 ¥${m.subTotal.toFixed(0)} · 单笔 ¥${m.ooTotal.toFixed(0)}</span></div><div class="r"><div class="amt">¥${m.total.toFixed(0)}</div><div class="cum">累计 ¥${m.cumulative.toFixed(0)}</div></div></div>`).join('');
  el.innerHTML=`<div class="th"><span>花费趋势</span><b>累计 ¥${grand.toFixed(0)} · 月均 ¥${avg.toFixed(0)} · ${series.length} 个月</b></div>
  <p class="tcaption">规则：月付订阅每月计入当期月费；年付（如 QQ 绿钻）只在续费月计入年费，不按月摊；单笔按发生日所在月。柱为当月合计，粉线为累计。</p>
  <div class="legend"><span><i class="bar-swatch"></i>当月花费</span><span><i class="line-swatch"></i>累计花费</span></div>
  <svg class="trend-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="每月花费柱状图与累计曲线">
    <defs>
      <linearGradient id="trendBarGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#a855f7"/><stop offset="100%" stop-color="#6366f1"/></linearGradient>
      <linearGradient id="trendBarGradDark" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#8b5cf6"/><stop offset="100%" stop-color="#4f46e5"/></linearGradient>
    </defs>
    ${grid}
    <line class="axis" x1="${padL}" y1="${padT+plotH}" x2="${W-padR}" y2="${padT+plotH}"/>
    ${bars}
    <polyline class="cum-line" points="${pts}"/>
    ${dots}
    ${rightLab}
  </svg>
  <div class="month-list">${list}</div>`;
}

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
  if(s.remind===false)return;
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
 const [ok]=await Promise.all([loadLive(),loadOneoffs()]);
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
