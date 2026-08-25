/* =========================================================
   アプリの外枠 — モード切替・動画の読み込み・タブ・操作バー
   モードは { players, zones(), onFile(), tabs, enter(), onReady(),
   sMax(), timeFor(), readout(), step(), onFrame() } を実装します。
   ========================================================= */
(function(A){
'use strict';
var $=A.$, $$=A.$$;

/* ---------- プレーヤーを作る ---------- */
['O1','O2','L','R'].forEach(A.mkPlayer);

/* ---------- モード ---------- */
A.setMode = function(id){
  var prev=A.modes[A.S.mode];
  if(prev&&prev.leave)prev.leave();
  A.setPlaying(false);
  A.S.mode=id; A.S.s=0;
  $$('#modeSeg button').forEach(function(b){b.classList.toggle('on',b.getAttribute('data-mode')===id);});
  var m=A.mode();
  $('#loadTitle').textContent=m.loadTitle||'';
  $('#loadLead').textContent=m.loadLead||'';
  A.show('#tipsObserve',id==='observe');
  A.show('#tipsCompare',id==='compare');
  A.show('#cmpModeRow',id==='compare');
  buildTabs();
  refreshZones();
  if(m.enter)m.enter();
  A.show('#secStage',allReady());
  if(allReady()&&m.onReady)m.onReady();
  syncPanels();
};
$('#modeSeg').addEventListener('click',function(e){
  var b=e.target.closest('button'); if(!b)return;
  A.setMode(b.getAttribute('data-mode'));
});
function needed(){return A.mode().players||[];}
function allReady(){return needed().length>0&&needed().every(function(id){return A.P(id).ready;});}
function syncPanels(){
  var use=needed();
  $$('.panel').forEach(function(el){
    el.classList.toggle('off',use.indexOf(el.getAttribute('data-side'))<0);
  });
}
A.syncPanels=syncPanels;

/* ---------- タブ ---------- */
function buildTabs(){
  var m=A.mode(), box=$('#tabs');
  box.innerHTML='';
  (m.tabs||[]).forEach(function(t){
    var b=document.createElement('button');
    b.textContent=t.label; b.setAttribute('data-tab',t.id);
    box.appendChild(b);
  });
  if(m.tabs&&m.tabs.length)A.setTab(m.tabs[0].id);
}
A.setTab=function(id){
  var m=A.mode();
  A.S.tab=id;
  $$('#tabs button').forEach(function(b){b.classList.toggle('on',b.getAttribute('data-tab')===id);});
  $$('#panes .tabpane').forEach(function(p){
    p.classList.toggle('hidden',p.getAttribute('data-pane')!==(A.S.mode+':'+id));
  });
  if(m.onTab)m.onTab(id);
};
$('#tabs').addEventListener('click',function(e){
  var b=e.target.closest('button'); if(!b)return;
  var m=A.mode(), id=b.getAttribute('data-tab');
  if(m.canOpenTab&&!m.canOpenTab(id))return;
  A.setTab(id);
});

/* ---------- 動画の読み込み ---------- */
function refreshZones(){
  var z=(A.mode().zones?A.mode().zones():[]);
  $$('.zone').forEach(function(el){
    el.classList.toggle('hidden',z.indexOf(el.getAttribute('data-target'))<0);
  });
  $('#zones').classList.toggle('two',z.length>1);
}
A.refreshZones=refreshZones;
var pendingTarget=null;
$$('[data-lib]').forEach(function(b){b.addEventListener('click',function(){
  pendingTarget=b.getAttribute('data-lib'); $('#libIn').click();});});
$$('[data-cap]').forEach(function(b){b.addEventListener('click',function(){
  pendingTarget=b.getAttribute('data-cap'); $('#capIn').click();});});
['libIn','capIn'].forEach(function(id){
  $('#'+id).addEventListener('change',function(e){
    var f=e.target.files&&e.target.files[0]; e.target.value='';
    if(f)takeFile(pendingTarget,f);
  });
});
function takeFile(target,file){
  if(!A.isVideoFile(file)){A.toast('動画ファイルを選んでください。');return;}
  var el=document.querySelector('[data-name="'+target+'"]');
  if(el)el.textContent='読み込み中… '+file.name;
  if(A.mode().onFile)A.mode().onFile(target,file);
}
A.takeFile=takeFile;
var dbox=$('#dropbox');
['dragenter','dragover'].forEach(function(ev){
  dbox.addEventListener(ev,function(e){e.preventDefault();dbox.classList.add('over');});});
['dragleave','drop'].forEach(function(ev){
  dbox.addEventListener(ev,function(e){e.preventDefault();dbox.classList.remove('over');});});
dbox.addEventListener('drop',function(e){
  var files=e.dataTransfer.files; if(!files||!files.length)return;
  var zone=e.target.closest?e.target.closest('.zone'):null;
  var zs=(A.mode().zones?A.mode().zones():[]);
  var tgt=zone?zone.getAttribute('data-target'):zs[0];
  if(files.length>=2&&zs.length>=2){takeFile(zs[0],files[0]);takeFile(zs[1],files[1]);}
  else takeFile(tgt,files[0]);
});
A.on('loaded',function(p){
  var el=document.querySelector('[data-name="'+(A.mode().nameSlot?A.mode().nameSlot(p.id):p.id)+'"]');
  if(el)el.textContent='✓ '+p.name;
  ['O1','O2','L','R'].forEach(function(id){
    var q=A.P(id); if(q.ready&&q.ar)q.vp.style.aspectRatio=String(q.ar);
  });
  if(allReady()){
    A.show('#secStage',true);
    if(A.mode().onReady)A.mode().onReady();
  }
  syncPanels();
});

/* ---------- fps ---------- */
$('#fpsSel').addEventListener('change',function(e){
  var nf=parseInt(e.target.value,10), keep=[];
  Object.keys(A.players).forEach(function(k){keep.push({obj:A.players[k],key:'startFrame'});});
  if(A.mode().fpsKeep)keep=keep.concat(A.mode().fpsKeep());
  A.setFps(nf,keep);
  fpsHint();
});
function fpsHint(){$('#fpsHint').textContent='1コマ ＝ '+A.f3(1/A.S.fps)+' 秒';}
A.fpsHint=fpsHint;

/* ---------- 操作バー ---------- */
$('#btnPlay').addEventListener('click',A.togglePlay);
$('#btnHead').addEventListener('click',function(){A.setPlaying(false);A.S.s=0;if(A.mode().onHead)A.mode().onHead();});
$$('[data-step]').forEach(function(b){
  b.addEventListener('click',function(){A.step(parseInt(b.getAttribute('data-step'),10));A.vib();});
});
$('#seek').addEventListener('input',function(){
  if(A.mode().onSeek)A.mode().onSeek();
  A.S.s=A.clamp(parseFloat(this.value)||0,0,A.sMax());
});
$('#rateSeg').addEventListener('click',function(e){
  var b=e.target.closest('button'); if(!b)return;
  A.S.rate=parseFloat(b.getAttribute('data-rate'));
  $$('#rateSeg button').forEach(function(x){x.classList.toggle('on',x===b);});
  if(A.S.playing&&A.S.engine==='native'){
    Object.keys(A.players).forEach(function(k){
      var p=A.players[k]; if(p.ready){try{p.video.playbackRate=Math.max(0.0625,A.S.rate);}catch(err){}}});
  }
});
A.on('playing',function(on){
  $('#btnPlay').textContent=on?'⏸ 一時停止':'▶ 再生';
  $('#btnPlay').classList.toggle('warn',on);
  $('#btnPlay').classList.toggle('primary',!on);
  if(on)A.keepAwake();
});
A.attachJog($('#jog'),function(d){A.step(d);});
document.addEventListener('keydown',function(e){
  var t=(e.target.tagName||'').toLowerCase();
  if(t==='input'||t==='select'||t==='textarea'||e.target.isContentEditable)return;
  var n=e.shiftKey?10:1;
  if(e.key==='ArrowRight'){e.preventDefault();A.step(n);}
  else if(e.key==='ArrowLeft'){e.preventDefault();A.step(-n);}
  else if(e.key===' '||e.key==='Spacebar'){e.preventDefault();A.togglePlay();}
  else if(e.key==='Escape'&&A.mode().onEscape)A.mode().onEscape();
});

/* ---------- 表示の更新 ---------- */
A.on('readout',function(){
  Object.keys(A.players).forEach(function(k){
    var p=A.players[k]; if(!p.ready)return;
    var el=document.querySelector('[data-fnum="'+k+'"]'); if(!el)return;
    var ct=(p.mediaTime!=null&&!p.video.seeking)?p.mediaTime:p.video.currentTime;
    el.textContent=A.TF(ct)+' コマ';
  });
  var mx=A.sMax(), sk=$('#seek');
  sk.max=String(mx||1); sk.step=String(1/A.S.fps);
  if(document.activeElement!==sk)sk.value=String(A.clamp(A.S.s,0,mx||1));
  var r=A.mode().readout?A.mode().readout():null;
  if(r){$('#seekLab').textContent=r.label;$('#tRead').innerHTML=r.text;}
});
document.addEventListener('visibilitychange',function(){
  if(document.visibilityState!=='visible')A.setPlaying(false);
});
window.addEventListener('beforeunload',function(){
  Object.keys(A.players).forEach(function(k){
    var p=A.players[k]; if(p.url){try{URL.revokeObjectURL(p.url);}catch(e){}}});
});
})(App);
