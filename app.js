(()=>{
'use strict';
const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
const loader=$('#loader'),site=$('#site'),world=$('#world'),menu=$('#menu'),cursor=$('#cursor'),ripple=$('#ripple');
const AUDIO_URL='https://unseen.co/wp-content/themes/unseen/resources/assets/audio/audio.webm?v=1786625394974';
const SPRITES={backing:[0,30.747,true],click:[31.2,.5],contact_swoosh:[32.4,4.5],hover:[37.6,.5],menu_close:[38.8,1],menu_swoosh:[40,1.071],navlinks_hover:[42.2,1.567],new_water_projects:[44.4,2.5],world_static:[48.8,5.295],world_intro:[55,12.8],world_loop:[68.2,12.8,true]};
let started=false,drag=false,startX=0,startY=0,dx=0,dy=0,muted=true,view='home',holdTimer=0,backing=null;
let pointerX=0,pointerY=0,smoothX=0,smoothY=0,slowX=0,slowY=0;

function phase(name){loader.className=`loader ${name}`}
phase('phase1');
setTimeout(()=>phase('phase2'),1500);
setTimeout(()=>phase('ready'),innerWidth<=700?2500:2500);

function makeAudio(){const a=new Audio(AUDIO_URL);a.preload='auto';a.muted=muted;a.playsInline=true;return a}
function playFx(name){if(muted||!SPRITES[name])return;const [start,dur]=SPRITES[name],a=makeAudio();a.muted=false;a.currentTime=start;const stop=()=>{if(a.currentTime>=start+dur){a.pause();a.removeEventListener('timeupdate',stop)}};a.addEventListener('timeupdate',stop);a.play().catch(()=>{})}
function startBacking(){if(muted)return;if(!backing)backing=makeAudio();backing.muted=false;const [start,dur]=SPRITES.backing;if(backing.currentTime<start||backing.currentTime>start+dur)backing.currentTime=start;backing.ontimeupdate=()=>{if(backing.currentTime>=start+dur-.08)backing.currentTime=start};backing.play().catch(()=>{})}
function setMuted(v){muted=!!v;document.body.classList.toggle('sound-on',!muted);if(backing){backing.muted=muted;if(!muted)backing.play().catch(()=>{});else backing.pause()}if(!muted&&started)startBacking()}

function enter(withAudio){if(started)return;started=true;setMuted(!withAudio);if(withAudio){playFx('world_static');startBacking()}loader.classList.add('leave');site.classList.add('ready');site.setAttribute('aria-hidden','false');setTimeout(()=>loader.remove(),1000)}
$('#enter').addEventListener('click',()=>enter(true)); $('#silent').addEventListener('click',()=>enter(false));

function setMenu(open){const wasOpen=menu.classList.contains('open');if(open===wasOpen)return;menu.classList.toggle('open',open);menu.setAttribute('aria-hidden',String(!open));document.body.classList.toggle('menu-open',open);playFx(open?'menu_swoosh':'menu_close')}
$$('[data-menu]').forEach(x=>x.addEventListener('click',()=>setMenu(true))); $('#menuClose').addEventListener('click',()=>setMenu(false));
function go(name){const target=$(`.view[data-view="${name}"]`);if(!target)return;if(name!==view)playFx(name==='contact'?'contact_swoosh':'new_water_projects');$$('.view').forEach(v=>v.classList.toggle('active',v===target));view=name;$$('.menu-links button').forEach((b,i)=>b.classList.toggle('active',(name==='home'&&i===0)||b.dataset.go===name));setMenu(false)}
$$('[data-go]').forEach(x=>x.addEventListener('click',e=>{e.preventDefault();go(x.dataset.go)}));

function setRipple(e){const r=world.getBoundingClientRect();ripple.style.left=`${e.clientX-r.left}px`;ripple.style.top=`${e.clientY-r.top}px`;ripple.classList.remove('go');void ripple.offsetWidth;ripple.classList.add('go')}
world.addEventListener('pointerdown',e=>{if(e.target.closest('button'))return;drag=true;startX=e.clientX;startY=e.clientY;dx=dy=0;setRipple(e);world.setPointerCapture?.(e.pointerId);cursor?.classList.add('hold');clearTimeout(holdTimer);holdTimer=setTimeout(()=>{if(drag&&Math.hypot(dx,dy)<12)go('projects')},1050)});
world.addEventListener('pointermove',e=>{if(!drag)return;dx=e.clientX-startX;dy=e.clientY-startY;if(Math.hypot(dx,dy)>8)clearTimeout(holdTimer);const x=Math.max(-14,Math.min(14,dx*.02)),y=Math.max(-9,Math.min(9,dy*.014));$$('.world-frame').forEach((f,i)=>f.style.transform=`scale(1.012) translate3d(${x*(i?1.15:.8)}px,${y*(i?1.15:.8)}px,0)`) });
function endDrag(){if(!drag)return;drag=false;clearTimeout(holdTimer);cursor?.classList.remove('hold');setTimeout(()=>{$$('.world-frame').forEach(f=>f.style.transform='')},320)}
addEventListener('pointerup',endDrag);addEventListener('pointercancel',endDrag);

$('#sound').addEventListener('click',()=>setMuted(!muted));
addEventListener('pointermove',e=>{pointerX=(e.clientX/innerWidth-.5)*2;pointerY=(e.clientY/innerHeight-.5)*2;if(cursor&&matchMedia('(pointer:fine)').matches)cursor.style.transform=`translate3d(${e.clientX-18}px,${e.clientY-18}px,0)`},{passive:true});
function raf(){smoothX+=(pointerX-smoothX)*.075;smoothY+=(pointerY-smoothY)*.075;slowX+=(pointerX-slowX)*.02;slowY+=(pointerY-slowY)*.02;if(started&&!drag&&innerWidth>700&&view==='home'){const x=-smoothX*5.4,y=-smoothY*1.8,roll=-(smoothX-slowX)*.32;$('.wa').style.transform=`scale(1.006) translate3d(${x}px,${y}px,0) rotate(${roll}deg)`}requestAnimationFrame(raf)}requestAnimationFrame(raf);

$$('.filters button').forEach(btn=>btn.addEventListener('click',()=>{const f=btn.dataset.filter;$$('.filters button').forEach(b=>b.classList.toggle('active',b===btn));$$('.project-grid article').forEach(card=>card.classList.toggle('hidden',f!=='all'&&!card.dataset.kind.split(' ').includes(f))) }));
$$('.menu-links button,.topbar nav button').forEach(el=>{el.addEventListener('mouseenter',()=>playFx('navlinks_hover'))});
addEventListener('keydown',e=>{if(e.key==='Escape')setMenu(false)});
})();
