(()=>{
'use strict';
const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
const loader=$('#loader'),site=$('#site'),world=$('#world'),menu=$('#menu'),cursor=$('#cursor'),ripple=$('#ripple');
let started=false,drag=false,startX=0,startY=0,dx=0,dy=0,muted=true,view='home',holdTimer=0;

function phase(name){loader.className=`loader ${name}`}
phase('phase1');
setTimeout(()=>phase('phase2'),1500);
setTimeout(()=>phase('ready'),innerWidth<=700?2550:2500);

function enter(){if(started)return;started=true;loader.classList.add('leave');site.classList.add('ready');site.setAttribute('aria-hidden','false');setTimeout(()=>loader.remove(),1000)}
$('#enter').addEventListener('click',enter); $('#silent').addEventListener('click',enter);

function setMenu(open){menu.classList.toggle('open',open);menu.setAttribute('aria-hidden',String(!open));document.body.classList.toggle('menu-open',open)}
$$('[data-menu]').forEach(x=>x.addEventListener('click',()=>setMenu(true))); $('#menuClose').addEventListener('click',()=>setMenu(false));
function go(name){const target=$(`.view[data-view="${name}"]`);if(!target)return;$$('.view').forEach(v=>v.classList.toggle('active',v===target));view=name;$$('.menu-links button').forEach((b,i)=>b.classList.toggle('active',(name==='home'&&i===0)||b.dataset.go===name));setMenu(false)}
$$('[data-go]').forEach(x=>x.addEventListener('click',e=>{e.preventDefault();go(x.dataset.go)}));

function setRipple(e){const r=world.getBoundingClientRect();ripple.style.left=`${e.clientX-r.left}px`;ripple.style.top=`${e.clientY-r.top}px`;ripple.classList.remove('go');void ripple.offsetWidth;ripple.classList.add('go')}
world.addEventListener('pointerdown',e=>{if(e.target.closest('button'))return;drag=true;startX=e.clientX;startY=e.clientY;dx=dy=0;setRipple(e);world.setPointerCapture?.(e.pointerId);cursor?.classList.add('hold');clearTimeout(holdTimer);holdTimer=setTimeout(()=>{if(drag&&Math.hypot(dx,dy)<12)go('projects')},1050)});
world.addEventListener('pointermove',e=>{if(!drag)return;dx=e.clientX-startX;dy=e.clientY-startY;if(Math.hypot(dx,dy)>8)clearTimeout(holdTimer);const t=Math.min(1,Math.abs(dx)/Math.max(80,innerWidth*.18)+Math.abs(dy)/Math.max(100,innerHeight*.18));world.classList.toggle('dragged',t>.18);const x=Math.max(-12,Math.min(12,dx*.018)),y=Math.max(-8,Math.min(8,dy*.012));$$('.world-frame').forEach((f,i)=>f.style.transform=`scale(${1.002+i*.001}) translate3d(${x*(i?1.15:.7)}px,${y*(i?1.15:.7)}px,0)`) });
function endDrag(){if(!drag)return;drag=false;clearTimeout(holdTimer);cursor?.classList.remove('hold');setTimeout(()=>{$$('.world-frame').forEach(f=>f.style.transform='');if(innerWidth>700)world.classList.remove('dragged')},320)}
addEventListener('pointerup',endDrag);addEventListener('pointercancel',endDrag);

$('#sound').addEventListener('click',()=>{muted=!muted;document.body.classList.toggle('sound-on',!muted)});
if(matchMedia('(pointer:fine)').matches){addEventListener('pointermove',e=>{cursor.style.transform=`translate3d(${e.clientX-18}px,${e.clientY-18}px,0)`})}
$$('.filters button').forEach(btn=>btn.addEventListener('click',()=>{const f=btn.dataset.filter;$$('.filters button').forEach(b=>b.classList.toggle('active',b===btn));$$('.project-grid article').forEach(card=>card.classList.toggle('hidden',f!=='all'&&!card.dataset.kind.split(' ').includes(f))) }));
addEventListener('keydown',e=>{if(e.key==='Escape')setMenu(false)});
})();
