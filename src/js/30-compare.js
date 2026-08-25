/* =========================================================
   ② 自由落下とくらべる
     左＝自由落下（落下開始）、右＝斜方投射（最高点）をそろえて同期再生。
   ========================================================= */
(function(A){
'use strict';
var $=A.$, $$=A.$$, clamp=A.clamp, f3=A.f3;
var SIDES=['L','R'];

var C={cmode:'A',layout:'side',ovop:0.5,fit:'full',ar:16/9,
  showGuides:false,showRuler:false,showMarks:false,
  guides:[],gid:0,ruler:{y0:0.20,u:0.045},marks:{L:0.40,R:0.40},
  dragMove:false,activeSide:null,alignDone:false};
A.C=C;
function PL(s){return A.P(s);}
function startTime(p){return A.FT(p.startFrame);}
function maxT(){
  var m=Infinity;
  SIDES.forEach(function(s){var p=PL(s);
    if(p.ready&&isFinite(p.video.duration))m=Math.min(m,Math.max(0,p.video.duration-startTime(p)));});
  return isFinite(m)?m:0;
}
function bothReady(){return PL('L').ready&&PL('R').ready;}
function clearPreview(){SIDES.forEach(function(s){PL(s).previewing=false;});}

/* ---------- モードA / B ---------- */
$('#cmpModeSeg').addEventListener('click',function(e){
  var b=e.target.closest('button'); if(!b)return;
  C.cmode=b.getAttribute('data-cmode');
  $$('#cmpModeSeg button').forEach(function(x){x.classList.toggle('on',x===b);});
  $('#cmpModeHint').textContent=(C.cmode==='A')
    ?'同じ動画を左右に読み込み、別々の開始フレームを指定します（スケールのずれが起きません）'
    :'別々に撮影した2本の動画を左右に読み込みます';
  A.refreshZones();
});

/* ---------- 開始点をさがす ---------- */
function previewSeek(p,time){
  if(!p.ready)return;
  A.setPlaying(false); p.previewing=true;
  p.video.currentTime=clamp(time,0,Math.max(0,p.video.duration-1e-3));
}
function setActive(s){
  C.activeSide=s;
  $$('.panel').forEach(function(el){el.classList.toggle('active',el.getAttribute('data-side')===s);});
}
$$('[data-cmstep]').forEach(function(b){
  b.addEventListener('click',function(){
    var a=b.getAttribute('data-cmstep').split(','), p=PL(a[0]);
    if(!p.ready)return; setActive(a[0]);
    var base=p.previewing?p.video.currentTime:startTime(p)+A.S.s;
    previewSeek(p,A.FT(A.TF(base)+parseInt(a[1],10)));
  });
});
$$('[data-cmscrub]').forEach(function(r){
  r.addEventListener('input',function(){
    var s=r.getAttribute('data-cmscrub'), p=PL(s); if(!p.ready)return;
    setActive(s); previewSeek(p,parseFloat(r.value)||0);
  });
});
$$('[data-cmset]').forEach(function(b){
  b.addEventListener('click',function(){
    var s=b.getAttribute('data-cmset'), p=PL(s); if(!p.ready)return;
    p.startFrame=A.TF(p.previewing?p.video.currentTime:startTime(p)+A.S.s);
    p.previewing=false; A.S.s=0; clearPreview(); A.setPlaying(false); A.vib(20);
    b.textContent='設定しました ✓';
    setTimeout(function(){b.textContent='ここを開始点に設定';},1200);
  });
});
$$('[data-cmadj]').forEach(function(b){
  b.addEventListener('click',function(){
    var a=b.getAttribute('data-cmadj').split(','), p=PL(a[0]); if(!p.ready)return;
    p.startFrame=Math.max(0,p.startFrame+parseInt(a[1],10));
    p.previewing=false; A.setPlaying(false);
  });
});

/* ---------- そろえる（上下） ---------- */
function nudgeY(s,d){
  var p=PL(s);
  p.offsetY=clamp(p.offsetY+d,-100,100);
  C.marks[s]=clamp(C.marks[s]+d/100,0,1);
  syncAdjust(); applyFit(); place();
}
$$('[data-cmny]').forEach(function(b){
  b.addEventListener('click',function(){
    var a=b.getAttribute('data-cmny').split(','); nudgeY(a[0],parseFloat(a[1]));
  });
});
$('#cmMarkToggle').addEventListener('click',function(){
  C.showMarks=!C.showMarks;
  this.textContent=C.showMarks?'開始位置マーカーを隠す':'開始位置マーカーを出す';
  this.classList.toggle('ok',C.showMarks);
  paint();
});
$('#cmAlignY').addEventListener('click',function(){
  if(!C.showMarks){
    C.showMarks=true;$('#cmMarkToggle').textContent='開始位置マーカーを隠す';
    $('#cmMarkToggle').classList.add('ok');paint();
    $('#cmAlignMsg').textContent='ピンクの線を物体の高さに合わせてから、もう一度押してください。';
    return;
  }
  var d=(C.marks.L-C.marks.R)*100;
  PL('R').offsetY=clamp(PL('R').offsetY+d,-100,100);
  C.marks.R=C.marks.L;
  syncAdjust(); applyFit(); place();
  $('#cmAlignMsg').textContent='右の映像を '+(d>=0?'下':'上')+'に '+Math.abs(d).toFixed(1)+'% 動かしてそろえました。';
});
$('#cmMarkRuler').addEventListener('click',function(){
  C.ruler.y0=C.marks.L;
  C.ruler.u=Math.max(0.003,Math.min(C.ruler.u,(0.97-C.ruler.y0)/16));
  if(!C.showRuler){C.showRuler=true;$('#cmRulerToggle').textContent='目盛りを隠す';$('#cmRulerToggle').classList.add('ok');}
  paint();
  $('#cmAlignMsg').textContent='この高さを目盛りの 0 にしました。';
});
$('#cmResetY').addEventListener('click',function(){
  SIDES.forEach(function(s){PL(s).offsetY=0;});
  syncAdjust(); applyFit(); $('#cmAlignMsg').textContent='上下位置を戻しました。';
});
$('#cmDragMove').addEventListener('change',function(){
  C.dragMove=this.checked;
  SIDES.forEach(function(s){PL(s).vp.classList.toggle('movable',C.dragMove);});
});

/* ---------- 表示 ---------- */
$('#cmLayoutSeg').addEventListener('click',function(e){
  var b=e.target.closest('button'); if(!b)return;
  C.layout=b.getAttribute('data-layout'); applyLayout();
});
$('#cmOvop').addEventListener('input',function(){
  C.ovop=parseFloat(this.value);$('#cmOvopV').textContent=Math.round(C.ovop*100)+'%';applyLayout();
});
$('#cmFitSel').addEventListener('change',function(){C.fit=this.value;applyFit();});
$('#cmGuideToggle').addEventListener('click',function(){
  C.showGuides=!C.showGuides;
  if(C.showGuides&&C.guides.length===0)C.guides.push({id:++C.gid,y:0.35});
  this.textContent=C.showGuides?'ガイド線を隠す':'ガイド線を表示';
  this.classList.toggle('ok',C.showGuides); paint();
});
$('#cmGuideAdd').addEventListener('click',function(){
  if(C.guides.length>=3){A.toast('ガイド線は3本までです。');return;}
  C.guides.push({id:++C.gid,y:clamp(0.3+C.guides.length*0.18,0,0.95)});
  C.showGuides=true;
  $('#cmGuideToggle').textContent='ガイド線を隠す';$('#cmGuideToggle').classList.add('ok');
  paint();
});
$('#cmGuideClear').addEventListener('click',function(){
  C.guides=[];C.showGuides=false;
  $('#cmGuideToggle').textContent='ガイド線を表示';$('#cmGuideToggle').classList.remove('ok');
  paint();
});
$('#cmRulerToggle').addEventListener('click',function(){
  C.showRuler=!C.showRuler;
  this.textContent=C.showRuler?'目盛りを隠す':'目盛りを表示';
  this.classList.toggle('ok',C.showRuler); paint();
});
function applyLayout(){
  var st=$('#stage');
  st.className='stage '+C.layout;
  st.style.setProperty('--ovop',String(C.ovop));
  document.querySelector('.panel[data-side="R"]').classList.toggle('dim',C.layout==='over');
  A.show('#cmOvopRow',C.layout==='over');
  $$('#cmLayoutSeg button').forEach(function(b){b.classList.toggle('on',b.getAttribute('data-layout')===C.layout);});
}
function applyFit(){
  var ar=(C.fit==='full')?C.ar:(C.fit==='3:4'?0.75:9/16);
  SIDES.forEach(function(s){
    var p=PL(s);
    p.vp.style.aspectRatio=String(ar);
    p.video.style.objectFit=(C.fit==='full')?'contain':'cover';
    A.applyTransform(p,0);
  });
}

/* ---------- 調整 ---------- */
$$('[data-cmsc]').forEach(function(r){r.addEventListener('input',function(){
  var s=r.getAttribute('data-cmsc');PL(s).scale=parseFloat(r.value);
  document.querySelector('[data-cmscv="'+s+'"]').textContent=PL(s).scale.toFixed(3);applyFit();});});
$$('[data-cmoy]').forEach(function(r){r.addEventListener('input',function(){
  var s=r.getAttribute('data-cmoy'),p=PL(s),nv=parseFloat(r.value);
  C.marks[s]=clamp(C.marks[s]+(nv-p.offsetY)/100,0,1); p.offsetY=nv;
  document.querySelector('[data-cmoyv="'+s+'"]').textContent=nv.toFixed(1)+'%';
  document.querySelector('[data-cmnyv="'+s+'"]').textContent=nv.toFixed(1);
  applyFit();place();});});
$$('[data-cmpx]').forEach(function(r){r.addEventListener('input',function(){
  var s=r.getAttribute('data-cmpx');PL(s).panX=parseFloat(r.value);
  document.querySelector('[data-cmpxv="'+s+'"]').textContent=Math.round(PL(s).panX*100)+'%';applyFit();});});
$('#cmResetAdjust').addEventListener('click',function(){
  SIDES.forEach(function(s){var p=PL(s);p.scale=1;p.offsetY=0;p.panX=0.5;});
  syncAdjust();applyFit();
});
$('#cmEngineSel').addEventListener('change',function(){
  var was=A.S.playing; A.setPlaying(false); A.S.engine=this.value; if(was)A.setPlaying(true);
});
function syncAdjust(){
  SIDES.forEach(function(s){
    var p=PL(s);
    document.querySelector('[data-cmsc="'+s+'"]').value=String(p.scale);
    document.querySelector('[data-cmscv="'+s+'"]').textContent=p.scale.toFixed(3);
    document.querySelector('[data-cmoy="'+s+'"]').value=String(p.offsetY);
    document.querySelector('[data-cmoyv="'+s+'"]').textContent=p.offsetY.toFixed(1)+'%';
    document.querySelector('[data-cmnyv="'+s+'"]').textContent=p.offsetY.toFixed(1);
    document.querySelector('[data-cmpx="'+s+'"]').value=String(p.panX);
    document.querySelector('[data-cmpxv="'+s+'"]').textContent=Math.round(p.panX*100)+'%';
  });
}

/* ---------- 重ねて確認 ---------- */
$('#cmAlignCheck').addEventListener('click',function(){
  C.layout='over';C.ovop=0.5;$('#cmOvop').value='0.5';$('#cmOvopV').textContent='50%';applyLayout();
});
$('#cmAlignAdjust').addEventListener('click',function(){C.layout='over';applyLayout();A.setTab('adjust');});
$('#cmAlignOk').addEventListener('click',function(){
  C.alignDone=true;C.layout='side';applyLayout();A.show('#cmAlignBanner',false);
});
function banner(){
  var on=bothReady()&&!C.alignDone;
  A.show('#cmAlignBanner',on);
  $('#cmAlignMsgTop').textContent=(C.cmode==='A')
    ?'左右が同じ動画なので背景は必ず一致します。このステップは飛ばしてかまいません。'
    :'2つの映像を半透明で重ねて、机の縁など背景の目印が一致しているか確かめてください。';
}

/* ---------- 描画 ---------- */
function paint(){
  SIDES.forEach(function(s){
    var p=PL(s); A.ov.clear(p);
    if(C.showGuides){
      C.guides.forEach(function(g,i){
        var d=A.ov.el(p,'hline guide','ガイド'+(i+1));
        d.setAttribute('data-g',g.id);
        d.addEventListener('pointerdown',function(ev){A.dragY(ev,p.vp,function(y){g.y=y;place();});});
      });
    }
    if(C.showMarks){
      var mk=A.ov.el(p,'hline mark',s==='L'?'左：落下開始の高さ':'右：最高点の高さ');
      mk.addEventListener('pointerdown',function(ev){A.dragY(ev,p.vp,function(y){C.marks[s]=y;place();});});
    }
    if(C.showRuler){
      [0,1,4,9,16].forEach(function(k){
        var d=A.ov.el(p,'hline rule'+(k===0?' o':''),k===0?'0（開始点）':String(k));
        d.setAttribute('data-k',String(k));
        d.addEventListener('pointerdown',function(ev){
          A.dragY(ev,p.vp,function(y){
            if(k===0)C.ruler.y0=y; else C.ruler.u=Math.max(0.003,(y-C.ruler.y0)/k);
            place();
          });
        });
      });
    }
  });
  place();
}
function place(){
  SIDES.forEach(function(s){
    var o=PL(s).ovl;
    C.guides.forEach(function(g){
      var el=o.querySelector('.guide[data-g="'+g.id+'"]'); if(el)el.style.top=(g.y*100)+'%';
    });
    var mk=o.querySelector('.mark'); if(mk)mk.style.top=(C.marks[s]*100)+'%';
    Array.prototype.forEach.call(o.querySelectorAll('.rule'),function(el){
      el.style.top=((C.ruler.y0+parseFloat(el.getAttribute('data-k'))*C.ruler.u)*100)+'%';
    });
  });
}

/* ---------- 保存 ---------- */
function pick(p){return {name:p.name,startFrame:p.startFrame,scale:p.scale,offsetY:p.offsetY,panX:p.panX};}
$('#cmSaveJson').addEventListener('click',function(){
  A.download('rakka-settei.json',{app:'projectile-lab',part:'compare',version:2,
    cmode:C.cmode,fps:A.S.fps,layout:C.layout,rate:A.S.rate,engine:A.S.engine,ovop:C.ovop,fit:C.fit,
    showGuides:C.showGuides,showRuler:C.showRuler,showMarks:C.showMarks,
    guides:C.guides,ruler:C.ruler,marks:C.marks,L:pick(PL('L')),R:pick(PL('R'))});
  $('#cmSaveMsg').textContent='書き出しました。';
});
$('#cmLoadJson').addEventListener('click',function(){A.pendingJson='compare';$('#jsonIn').click();});
A.compareLoadJson=function(d){
  if(d.fps){A.S.fps=d.fps;$('#fpsSel').value=String(d.fps);A.fpsHint();}
  if(d.layout)C.layout=d.layout;
  if(d.fit){C.fit=d.fit;$('#cmFitSel').value=d.fit;}
  if(typeof d.ovop==='number'){C.ovop=d.ovop;$('#cmOvop').value=String(d.ovop);$('#cmOvopV').textContent=Math.round(d.ovop*100)+'%';}
  if(d.engine){A.S.engine=d.engine;$('#cmEngineSel').value=d.engine;}
  if(typeof d.rate==='number')A.setRate(d.rate);
  C.guides=Array.isArray(d.guides)?d.guides.map(function(g){return {id:++C.gid,y:clamp(g.y,0,1)};}):[];
  if(d.ruler)C.ruler={y0:clamp(d.ruler.y0,0,1),u:Math.max(0.003,d.ruler.u)};
  if(d.marks)C.marks={L:clamp(d.marks.L,0,1),R:clamp(d.marks.R,0,1)};
  C.showGuides=!!d.showGuides;C.showRuler=!!d.showRuler;C.showMarks=!!d.showMarks;
  SIDES.forEach(function(s){
    var src=d[s]; if(!src)return; var p=PL(s);
    p.startFrame=Math.max(0,src.startFrame|0);
    p.scale=src.scale||1;p.offsetY=src.offsetY||0;
    p.panX=(typeof src.panX==='number')?src.panX:0.5;
  });
  $('#cmGuideToggle').textContent=C.showGuides?'ガイド線を隠す':'ガイド線を表示';
  $('#cmGuideToggle').classList.toggle('ok',C.showGuides);
  $('#cmRulerToggle').textContent=C.showRuler?'目盛りを隠す':'目盛りを表示';
  $('#cmRulerToggle').classList.toggle('ok',C.showRuler);
  $('#cmMarkToggle').textContent=C.showMarks?'開始位置マーカーを隠す':'開始位置マーカーを出す';
  $('#cmMarkToggle').classList.toggle('ok',C.showMarks);
  A.setPlaying(false);clearPreview();A.S.s=0;
  applyLayout();applyFit();syncAdjust();paint();
  $('#cmSaveMsg').textContent='読み込みました。動画は別途読み込んでください。';
};

/* ---------- ①からの引き継ぎ ---------- */
A.handoffToCompare=function(file,apexFrame){
  C.cmode='B';
  $$('#cmpModeSeg button').forEach(function(x){x.classList.toggle('on',x.getAttribute('data-cmode')==='B');});
  A.setMode('compare');
  A.refreshZones();
  var once=function(p){
    if(p.id!=='R')return;
    p.startFrame=Math.max(0,apexFrame|0);
    A.toast('右（斜方投射）に引き継ぎました。開始点は最高点（'+p.startFrame+' コマ）です。<br>左に自由落下の動画を読み込んでください。',6000);
  };
  A.on('loaded',once);
  A.takeFile('R',file);
};

/* ---------- モード定義 ---------- */
var mode={
  players:['L','R'],
  allowNative:true,
  loadTitle:'自由落下と斜方投射の動画を読み込む',
  loadLead:'斜方投射の最高点と自由落下の落下開始をそろえると、以後の落下距離が一致します。',
  zones:function(){return C.cmode==='A'?['A']:['L','R'];},
  nameSlot:function(pid){return C.cmode==='A'?'A':pid;},
  onFile:function(t,file){
    if(t==='A'){A.loadInto('L',file);A.loadInto('R',file);}
    else A.loadInto(t,file);
  },
  tabs:[{id:'start',label:'開始点'},{id:'align',label:'そろえる'},
        {id:'view',label:'表示'},{id:'adjust',label:'調整'},{id:'save',label:'保存'}],
  onTab:function(){},
  sMax:maxT,
  timeFor:function(pid){
    if(pid!=='L'&&pid!=='R')return null;
    return startTime(PL(pid))+A.S.s;
  },
  step:function(n){
    if(C.activeSide){
      var p=PL(C.activeSide); if(!p.ready)return;
      var base=p.previewing?p.video.currentTime:startTime(p)+A.S.s;
      previewSeek(p,A.FT(A.TF(base)+n));
    }else{clearPreview();A.S.s=clamp(A.S.s+n/A.S.fps,0,maxT());}
  },
  onSeek:clearPreview,
  onHead:clearPreview,
  onEscape:function(){setActive(null);},
  readout:function(){
    return {label:'開始点から',text:'<b>'+f3(A.S.s)+'</b> s / <b>'+Math.round(A.S.s*A.S.fps)+'</b> コマ'};
  },
  onFrame:function(){
    SIDES.forEach(function(s){
      var p=PL(s); if(!p.ready)return;
      document.querySelector('[data-sf2="'+s+'"]').textContent=String(p.startFrame);
      document.querySelector('[data-st2="'+s+'"]').textContent=f3(startTime(p));
      var sc=document.querySelector('[data-cmscrub="'+s+'"]');
      sc.max=String(Math.max(0.001,p.video.duration));sc.step=String(1/A.S.fps);
      if(document.activeElement!==sc)sc.value=String(p.previewing?p.video.currentTime:startTime(p)+A.S.s);
      document.querySelector('[data-cmscrubv="'+s+'"]').textContent=A.TF(parseFloat(sc.value)||0)+'コマ';
    });
  },
  fpsKeep:function(){return [];},
  enter:function(){
    $('#cmpModeHint').textContent=(C.cmode==='A')
      ?'同じ動画を左右に読み込み、別々の開始フレームを指定します（スケールのずれが起きません）'
      :'別々に撮影した2本の動画を左右に読み込みます';
    applyLayout();syncAdjust();
  },
  onReady:function(){
    var p=PL('L').ar?PL('L'):PL('R');
    if(p.ar)C.ar=p.ar;
    A.S.s=0;clearPreview();applyLayout();applyFit();paint();banner();
  }
};
A.registerMode('compare',mode);

/* 映像の上：横になぞる＝コマ送り、縦＝（許可時）映像を上下に動かす */
SIDES.forEach(function(s){
  var p=PL(s);
  p.vp.addEventListener('pointerdown',function(){if(A.S.mode==='compare')setActive(s);});
  A.attachStageGesture(p,{
    armed:function(){return false;},
    onJog:function(d){if(A.S.mode==='compare')A.step(d);},
    onDragYStart:function(){return C.marks[s];},
    onDragY:function(newOffset,newMark){
      if(A.S.mode!=='compare'||!C.dragMove)return;
      p.offsetY=clamp(newOffset,-100,100);
      C.marks[s]=clamp(newMark,0,1);
      syncAdjust();applyFit();place();
    }
  });
});
})(App);
