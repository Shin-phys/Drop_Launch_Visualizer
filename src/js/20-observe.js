/* =========================================================
   ① 斜方投射を観る
     水平：Δt ごとの等間隔の縦線／追いかけカメラ
     鉛直：最高点を軸にしたミラー再生（下り +t と 上りの逆再生 −t）
   ========================================================= */
(function(A){
'use strict';
var $=A.$, $$=A.$$, clamp=A.clamp, f3=A.f3;

var O={dtF:2,dtTouched:false,fStart:null,fApex:null,fEnd:null,sMark:0,arm:0,
  showGrid:false,showPred:false,camOn:false,vx:0,
  maskOn:false,maskW:0.06,maskOp:0.75,bandOp:0,lineOp:0.5,sbs:false,camX:0.5,
  mir:'side',flip:true,ovop:0.55,apexX:0.5,showHG:false,hgY:0.4,mirAdj:0};
A.O=O;
var P1=function(){return A.P('O1');}, P2=function(){return A.P('O2');};

function ready3(){return O.fStart!=null&&O.fApex!=null&&O.fEnd!=null&&O.fStart<O.fApex&&O.fApex<O.fEnd;}
function dtSec(){return O.dtF/A.S.fps;}

/* ---------- Δt（時間のものさし） ---------- */
var DT_OPTS=[1,2,3,4,5,6,8,10,12,15,20,24,30,40,60];
function nearestDt(n){var b=DT_OPTS[0];DT_OPTS.forEach(function(o){if(Math.abs(o-n)<Math.abs(b-n))b=o;});return b;}
function defaultDt(){return Math.max(1,Math.round(A.S.fps/30));}
/* 飛んでいる時間を10等分するあたりが、縦線がいちばん読みやすい */
function suggestDt(){
  if(!ready3())return defaultDt();
  return nearestDt(Math.max(1,Math.round((A.FT(O.fEnd)-A.FT(O.fStart))/10*A.S.fps)));
}
function fillDt(){
  var sel=$('#obDtSel'); if(!sel)return;
  sel.innerHTML='';
  DT_OPTS.concat(DT_OPTS.indexOf(O.dtF)<0?[O.dtF]:[]).forEach(function(n){
    var o=document.createElement('option');o.value=String(n);o.textContent=n+' コマ';sel.appendChild(o);
  });
  sel.value=String(O.dtF);
  $('#obDtRead').textContent=O.dtF+' コマ ＝ '+f3(dtSec())+' 秒';
}
$('#obDtSel').addEventListener('change',function(e){
  O.dtF=parseInt(e.target.value,10);O.dtTouched=true;fillDt();syncGridButtons();paint();
});

/* ---------- 区間 ---------- */
$$('[data-mark]').forEach(function(b){
  b.addEventListener('click',function(){
    if(A.S.mode!=='observe')return;
    O[b.getAttribute('data-mark')]=A.TF(P1().ready?P1().video.currentTime:0);
    refreshRange();
  });
});
function refreshRange(){
  [['fStart','#obVStart','#obN1'],['fApex','#obVApex','#obN2'],['fEnd','#obVEnd','#obN3']].forEach(function(a){
    var v=O[a[0]];
    $(a[1]).textContent=(v==null)?'—':(v+' コマ / '+f3(A.FT(v))+' s');
    $(a[2]).classList.toggle('done',v!=null);
  });
  var ok=ready3();
  $('#obRangeDone').disabled=!ok;
  $('#obRangeDone').textContent=ok?'決まった → 水平を見る':'3つとも決めてください';
}
$('#obRangeDone').addEventListener('click',function(){
  if(!ready3()){A.toast('開始 → 最高点 → おわり の順（コマ番号が増える順）になるように選んでください。');return;}
  A.setTab('h');
});
$('#obRangeReset').addEventListener('click',function(){O.fStart=O.fApex=O.fEnd=null;refreshRange();});

/* ---------- 位置をタップして取る（帯の位置・最高点の軸） ---------- */
function armUI(){
  A.ov.arm(O.arm>0);
  var hb=$('#hintbar');
  if(hb){hb.textContent='タップするあいだ、カメラは止めています';A.show('#hintbar',O.arm>0);}
  $('#obApexPick').classList.toggle('warn',O.arm===3);
  $('#obCamPick').classList.toggle('warn',O.arm===4);
  paint();
}
$('#obApexPick').addEventListener('click',function(){A.setPlaying(false);A.S.s=0;O.arm=3;armUI();});

/* 押した位置と離した位置がほぼ同じ（＝タップ）のときだけ点を取る。
   こうしておくと、拡大中に指でなぞって移動しても誤って点が入らない。 */
function pickDown(pid){
  return function(e){
    if(A.S.mode!=='observe'||!O.arm)return;
    O._px=e.clientX; O._py=e.clientY;
  };
}
function pick(pid){
  return function(e){
    if(A.S.mode!=='observe'||!O.arm)return;
    if(pid==='O2'&&O.arm!==3)return;
    if(A.isOverlayEl(e.target))return;
    if(O._px==null)return;
    if(Math.abs(e.clientX-O._px)>8||Math.abs(e.clientY-O._py)>8){O._px=null;return;}
    O._px=null;
    var vp=A.P(pid).vp, r=vp.getBoundingClientRect();
    var x=clamp((e.clientX-r.left)/r.width,0,1), y=clamp((e.clientY-r.top)/r.height,0,1);
    if(O.arm===3){
      O.apexX=x;O.arm=0;armUI();
      $('#obApexV').textContent='横 '+(x*100).toFixed(1)+'%';
    }else if(O.arm===4){
      /* 「このコマで、ボールはここ」を基準にする。以後のカメラの位置はここから計算する */
      O.arm=0; O.sMark=A.S.s; armUI(); setCamX(x);
    }
    paint();
  };
}
['O1','O2'].forEach(function(id){
  A.P(id).vp.addEventListener('pointerdown',pickDown(id));
  A.P(id).vp.addEventListener('pointerup',pick(id));
});

/* 縦線の間隔のもと。測った値があればそれを、無ければ自分で合わせたカメラの速さを使う */
function gridBase(){
  return {x0:O.camX, d:O.vx*dtSec(), v:O.vx};
}
function syncGridButtons(){
  var g=gridBase(), okg=Math.abs(g.d)>0.004;
  $('#obGrid').disabled=!okg; $('#obPred').disabled=!okg;
  $('#obGridSrc').textContent=okg
    ? ('この速さなら Δt のあいだに 画面幅の '+(Math.abs(g.d)*100).toFixed(1)+'%（＝ Δt × '+Math.abs(g.v).toFixed(3)+'）')
    : 'まず 2 でカメラの速さを決めてください。';
  if(!okg){O.showGrid=false;O.showPred=false;}
}
A.observeSyncGrid=syncGridButtons;
$('#obGrid').addEventListener('click',function(){
  O.showGrid=!O.showGrid; if(O.showGrid)O.camOn=false; syncHButtons(); paint();
});
$('#obPred').addEventListener('click',function(){O.showPred=!O.showPred;syncHButtons();paint();});
$('#obCam').addEventListener('click',function(){
  O.camOn=!O.camOn; if(O.camOn)O.showGrid=false;
  syncHButtons(); A.syncPanels(); setStage();
});
function setCamX(x,fromSlider){
  O.camX=clamp(x,0,1);
  if(!fromSlider)$('#obCamX').value=String(O.camX);
  $('#obCamXv').textContent=Math.round(O.camX*100)+'%';
  place();
}
A.observeSetCamX=setCamX;
$('#obCamX').addEventListener('input',function(){setCamX(parseFloat(this.value),true);});
$('#obCamPick').addEventListener('click',function(){O.arm=4;armUI();});
/* Δt ずつ進める。ふつうに再生しただけでは Δt ごとの位置は追えないので。 */
function stepDt(n){
  A.setPlaying(false);
  A.S.s=clamp(A.S.s+n*dtSec(),0,mode.sMax());
}
A.attachRepeat($('#obDtNext'),function(){stepDt(1);});
A.attachRepeat($('#obDtPrev'),function(){stepDt(-1);});
$('#obLineOp').addEventListener('input',function(){
  O.lineOp=parseFloat(this.value);$('#obLineOpv').textContent=Math.round(O.lineOp*100)+'%';place();
});
$('#obBandOp').addEventListener('input',function(){
  O.bandOp=parseFloat(this.value);$('#obBandOpv').textContent=Math.round(O.bandOp*100)+'%';place();
});
$('#obMask').addEventListener('click',function(){
  O.maskOn=!O.maskOn; A.show('#obMaskRow',O.maskOn); syncHButtons(); paint();
});
$('#obMaskW').addEventListener('input',function(){
  O.maskW=parseFloat(this.value);$('#obMaskWv').textContent=Math.round(O.maskW*100)+'%';place();
});
$('#obMaskOp').addEventListener('input',function(){
  O.maskOp=parseFloat(this.value);$('#obMaskOpv').textContent=Math.round(O.maskOp*100)+'%';place();
});
$('#obSbs').addEventListener('click',function(){
  O.sbs=!O.sbs; syncHButtons(); A.syncPanels(); setStage();
});
function syncHButtons(){
  $('#obGrid').classList.toggle('ok',O.showGrid);
  $('#obGrid').textContent=O.showGrid?'縦線を消す':'縦線を出す';
  $('#obPred').classList.toggle('ok',O.showPred);
  $('#obPred').textContent=O.showPred?'しるしを消す':'等速ならここ';
  $('#obCam').classList.toggle('ok',O.camOn);
  $('#obCam').textContent=O.camOn?'カメラを止める':'カメラを動かす';
  $('#obMask').classList.toggle('ok',O.maskOn);
  $('#obMask').textContent=O.maskOn?'背景を出す':'背景を隠す';
  $('#obSbs').classList.toggle('ok',O.sbs);
  $('#obSbs').textContent=O.sbs?'並べるのをやめる':'もとの映像と並べる';
  A.show('#obBandRow',O.camOn);
  if(!O.camOn)A.show('#obMaskRow',false);
}
/* 速さの指定は3通り（スライダー・数値・ボタン）。どれで変えても表示をそろえる。
   スライダーだけだと、スマホの幅では 0.02 きざみ程度にしかならないため。 */
function setVx(v,from){
  if(!isFinite(v))return;
  var cv=$('#obCamV'), lim=parseFloat(cv.max);
  O.vx=clamp(Math.round(v*1000)/1000,-lim,lim);
  if(from!=='slider')cv.value=String(O.vx);
  if(from!=='num')$('#obCamVnum').value=O.vx.toFixed(3);
  syncGridButtons();
  place();
}
A.observeSetVx=setVx;
$('#obCamV').addEventListener('input',function(){setVx(parseFloat(this.value),'slider');});
$('#obCamVnum').addEventListener('input',function(){setVx(parseFloat(this.value),'num');});
$('#obCamVnum').addEventListener('change',function(){setVx(parseFloat(this.value));});
$$('[data-camv]').forEach(function(b){
  A.attachRepeat(b,function(){setVx(O.vx+parseFloat(b.getAttribute('data-camv')));});
});

/* ---------- ミラー再生 ---------- */
$('#obMirSeg').addEventListener('click',function(e){
  var b=e.target.closest('button'); if(!b)return;
  O.mir=b.getAttribute('data-m');
  $$('#obMirSeg button').forEach(function(x){x.classList.toggle('on',x===b);});
  setStage();
});
$('#obFlip').addEventListener('change',function(){O.flip=this.checked;paint();});
/* 逆再生側だけを1コマ動かす。コマ送りは両方が同時に動くので、ふたつのずれは2コマ単位でしか変わらない。 */
function syncMirAdj(){
  var e=$('#obMirAdjV'); if(!e)return;
  e.textContent=(O.mirAdj>0?'＋':O.mirAdj<0?'−':'±')+Math.abs(O.mirAdj)+' コマ';
}
A.observeSyncMirAdj=syncMirAdj;
$$('[data-miradj]').forEach(function(b){
  var d=parseInt(b.getAttribute('data-miradj'),10);
  A.attachRepeat(b,function(){
    O.mirAdj=d?clamp(O.mirAdj+d,-60,60):0;
    syncMirAdj(); A.vib(4); paint();
  });
});
$('#obOvop').addEventListener('input',function(){
  O.ovop=parseFloat(this.value);$('#obOvopV').textContent=Math.round(O.ovop*100)+'%';setStage();
});
$('#obHG').addEventListener('click',function(){
  O.showHG=!O.showHG;
  this.classList.toggle('ok',O.showHG);
  this.textContent=O.showHG?'高さの線を消す':'高さの線を出す';
  paint();
});

/* ---------- 描画 ---------- */
function setStage(){
  var st=$('#stage'), tab=A.S.tab;
  var two=(tab==='v')||(tab==='h'&&O.camOn&&O.sbs);
  st.className='stage '+(tab==='v'?(O.mir==='over'?'over':'side'):(two?'side':'one'));
  st.style.setProperty('--ovop',String(O.ovop));
  A.syncPanels();
  document.querySelector('.panel[data-side="O2"]').classList.toggle('dim',tab==='v'&&O.mir==='over');
  document.querySelector('[data-chip="O1"]').textContent=
    (tab==='v')?'下り（+t）':(two?'追いかけカメラ':'映像');
  document.querySelector('[data-chip="O2"]').textContent=
    (tab==='v')?'逆再生（上り）':'もとの映像';
  paint();
}
function paint(){
  ['O1','O2'].forEach(function(id){A.ov.clear(A.P(id));});
  var tab=A.S.tab, p1=P1();
  if(tab==='h'){
    if(O.showGrid){
      var gb=gridBase(), d=gb.d;
      if(Math.abs(d)>0.004){
        var a=Math.ceil((0-gb.x0)/d), b=Math.floor((1-gb.x0)/d);
        if(a>b){var t=a;a=b;b=t;}
        a=Math.max(a,-60); b=Math.min(b,60);
        for(var k=a;k<=b;k++){
          var x=gb.x0+k*d; if(x<0||x>1)continue;
          var el=A.ov.el(p1,'vline'+(k===0?' k0':''),k===0?'①':(k===1?'Δt':null));
          el.style.left=(x*100)+'%';
        }
      }
    }
    if(O.camOn){
      /* 基準の縦線。測定前でも出し、ドラッグしてボールに合わせられるようにする */
      var cl=A.ov.el(p1,'vline cam');
      cl.addEventListener('pointerdown',function(ev){
        A.dragX(ev,p1.vp,function(x){setCamX(x);});
      });
      /* 帯そのもの（半透明の青）。濃さ 0 なら線だけになる */
      A.ov.el(p1,'band');
      /* 背景を隠す縦帯。動く背景が視界から外れると、ボールの動きが鉛直だけに見える */
      if(O.maskOn&&!paused()){A.ov.el(p1,'mask ml');A.ov.el(p1,'mask mr');}
    }
    if(O.showPred)A.ov.el(p1,'tri');
  }
  if(tab==='v'){
    ['O1','O2'].forEach(function(id){
      var p=A.P(id);
      var ax=A.ov.el(p,'vline axis','最高点');
      /* 反転の軸は画面上の位置なので、どちらの映像で動かしても同じ値でよい */
      ax.addEventListener('pointerdown',function(ev){
        A.dragX(ev,p.vp,function(x){O.apexX=x;place();});
      });
      if(O.showHG){
        var hg=A.ov.el(p,'hline guide');
        hg.addEventListener('pointerdown',function(ev){A.dragY(ev,p.vp,function(y){O.hgY=y;place();});});
      }
    });
  }
  place();
}
/* 位置をタップしてもらうあいだは、カメラのパンとマスクを止める。
   止めないとボールが帯の外に隠れて選べない／2点が同じ位置になる。 */
function paused(){return O.arm>0;}
function camActive(){return A.S.tab==='h'&&O.camOn&&!paused();}
function place(){
  /* カメラのパンとミラーの反転 */
  var cam=camActive();
  A.applyTransform(P1(),cam?(-(O.vx*(A.S.s-O.sMark))*100):0);
  A.applyTransform(P2(),0,(A.S.tab==='v'&&O.flip)?O.apexX:null);
  /* カメラが動いていることを画面に明示する（背景を隠すときこそ必要） */
  var badge=document.querySelector('[data-cam="O1"]');
  if(badge){
    badge.classList.toggle('hidden',!cam);
    if(cam)badge.textContent=(O.vx>=0?'カメラ →':'← カメラ')+' '+Math.abs(O.vx).toFixed(3)+' 画面幅/秒';
  }
  var c=O.camX, w=O.maskW;
  var cline=P1().ovl.querySelector('.cam');
  if(cline){cline.style.left=(c*100)+'%';cline.style.opacity=String(O.lineOp);}
  var band=P1().ovl.querySelector('.band');
  if(band){
    band.style.left=(Math.max(0,c-w/2)*100)+'%';
    band.style.width=(Math.min(1,c+w/2)-Math.max(0,c-w/2))*100+'%';
    band.style.background='rgba(77,163,255,'+O.bandOp+')';
  }
  if(cam&&O.maskOn){
    var o=String(O.maskOp);
    var l=P1().ovl.querySelector('.ml'), r=P1().ovl.querySelector('.mr');
    if(l){l.style.left='0';l.style.width=(Math.max(0,c-w/2)*100)+'%';l.style.background='rgba(0,0,0,'+o+')';}
    if(r){r.style.left=(Math.min(1,c+w/2)*100)+'%';r.style.right='0';r.style.background='rgba(0,0,0,'+o+')';}
  }
  if(A.S.tab==='h'){
    var tri=P1().ovl.querySelector('.tri');
    if(tri){
      var gp=gridBase(), xp=gp.x0+gp.v*(A.S.s-O.sMark);
      tri.style.left=clamp(xp,0,1)*100+'%';
      tri.style.opacity=(xp<-0.02||xp>1.02)?'0':'1';
    }
  }
  if(A.S.tab==='v'){
    ['O1','O2'].forEach(function(id){
      var o=A.P(id).ovl;
      var ax=o.querySelector('.axis'); if(ax)ax.style.left=(O.apexX*100)+'%';
      var hg=o.querySelector('.hline'); if(hg)hg.style.top=(O.hgY*100)+'%';
    });
  }
}

/* ---------- 保存・引き継ぎ ---------- */
$('#obSave').addEventListener('click',function(){
  A.download('shaho-kansatsu.json',{app:'projectile-lab',part:'observe',version:2,
    fps:A.S.fps,dtF:O.dtF,fStart:O.fStart,fApex:O.fApex,fEnd:O.fEnd,
    sMark:O.sMark,vx:O.vx,
    apexX:O.apexX,hgY:O.hgY,mir:O.mir,flip:O.flip,ovop:O.ovop,mirAdj:O.mirAdj,
    camX:O.camX,maskW:O.maskW,maskOp:O.maskOp,bandOp:O.bandOp,lineOp:O.lineOp,name:P1().name});
  $('#obSaveMsg').textContent='書き出しました（動画そのものは含まれません）。';
});
$('#obLoad').addEventListener('click',function(){A.pendingJson='observe';$('#jsonIn').click();});
A.observeLoadJson=function(d){
  if(d.fps){A.S.fps=d.fps;$('#fpsSel').value=String(d.fps);A.fpsHint();}
  if(d.dtF){O.dtF=d.dtF;O.dtTouched=true;}
  ['fStart','fApex','fEnd','sMark','vx','apexX','hgY','mirAdj',
   'camX','maskW','maskOp','bandOp','lineOp'].forEach(function(k){
    if(d[k]!=null)O[k]=d[k];});
  syncMirAdj();
  if(d.mir)O.mir=d.mir;
  if(typeof d.flip==='boolean'){O.flip=d.flip;$('#obFlip').checked=d.flip;}
  if(typeof d.ovop==='number'){O.ovop=d.ovop;$('#obOvop').value=String(d.ovop);$('#obOvopV').textContent=Math.round(d.ovop*100)+'%';}
  $('#obCamX').value=String(O.camX);$('#obCamXv').textContent=Math.round(O.camX*100)+'%';
  $('#obMaskW').value=String(O.maskW);$('#obMaskWv').textContent=Math.round(O.maskW*100)+'%';
  $('#obMaskOp').value=String(O.maskOp);$('#obMaskOpv').textContent=Math.round(O.maskOp*100)+'%';
  $('#obBandOp').value=String(O.bandOp);$('#obBandOpv').textContent=Math.round(O.bandOp*100)+'%';
  $('#obLineOp').value=String(O.lineOp);$('#obLineOpv').textContent=Math.round(O.lineOp*100)+'%';
  $('#obCamV').value=String(O.vx);$('#obCamVnum').value=O.vx.toFixed(3);
  fillDt(); refreshRange();
  syncHButtons(); setStage();
  $('#obSaveMsg').textContent='読み込みました。動画は別途読み込んでください。';
};
$('#obHandoff').addEventListener('click',function(){
  if(!P1().file){A.toast('先に動画を読み込んでください。');return;}
  if(O.fApex==null){A.toast('先に「区間を決める」で最高点を決めてください。');return;}
  A.handoffToCompare(P1().file,O.fApex);
});

/* ---------- モード定義 ---------- */
var mode={
  players:['O1','O2'],
  activePanels:function(){
    if(A.S.tab==='v')return ['O1','O2'];
    if(A.S.tab==='h'&&O.camOn&&O.sbs)return ['O1','O2'];
    return ['O1'];
  },
  allowNative:false,        /* 逆再生を含むので、必ずシークで同期する */
  loadTitle:'斜方投射の動画を読み込む',
  loadLead:'投げ上げたボールの動きを、水平方向と鉛直方向に分けて見ます。',
  zones:function(){return ['O'];},
  nameSlot:function(){return 'O';},
  onFile:function(t,file){A.loadInto('O1',file);A.loadInto('O2',file);},
  tabs:[{id:'range',label:'区間を決める'},{id:'h',label:'水平：等速か？'},
        {id:'v',label:'鉛直：時間反転'},{id:'sum',label:'まとめ'}],
  canOpenTab:function(id){
    if((id==='h'||id==='v')&&!ready3()){
      A.toast('先に「区間を決める」で、開始・最高点・おわりの3つを設定してください。');return false;
    }
    return true;
  },
  onTab:function(id){
    A.setPlaying(false); A.S.s=0; O.arm=0; A.show('#hintbar',false); armUI();
    if(id==='h'){
      if(!O.dtTouched&&ready3()){var nd=suggestDt(); if(nd!==O.dtF){O.dtF=nd;fillDt();}}
      /* 最初からカメラと背景隠しを効かせておく（探索から始める流れなので） */
      if(!O.camOn){O.camOn=true;O.sMark=0;}
      O.maskOn=true;
      A.show('#obMaskRow',true);
      syncHButtons(); syncGridButtons(); A.syncPanels();
    }
    setStage();
  },
  fpsKeep:function(){return [{obj:O,key:'fStart'},{obj:O,key:'fApex'},{obj:O,key:'fEnd'}];},
  sMax:function(){
    if(!P1().ready)return 0;
    if(A.S.tab==='range')return isFinite(P1().video.duration)?P1().video.duration:0;
    if(!ready3())return 0;
    if(A.S.tab==='v'){
      /* 逆再生側は fApex+mirAdj から手前へ戻るので、そのぶん動ける範囲が変わる */
      var a=A.FT(O.fApex), b=A.FT(O.fApex+O.mirAdj);
      return Math.max(0,Math.min(b-A.FT(O.fStart),A.FT(O.fEnd)-a));
    }
    return A.FT(O.fEnd)-A.FT(O.fStart);
  },
  timeFor:function(pid){
    if(pid==='O1'){
      /* コマの中央を狙う。境界ちょうど（f/fps）を指定すると、動画側の時刻がミリ秒に
         丸められている分だけ手前のコマに落ちて、1回押しても画が変わらないことがある。 */
      if(A.S.tab==='range')return A.FT(A.TF(A.S.s));
      if(A.S.tab==='v')return A.FT(O.fApex)+A.S.s;
      return A.FT(O.fStart)+A.S.s;
    }
    if(pid==='O2'){
      if(A.S.tab==='v')return A.FT(O.fApex+O.mirAdj)-A.S.s;
      if(A.S.tab==='h'&&O.camOn&&O.sbs)return A.FT(O.fStart)+A.S.s;
    }
    return null;
  },
  readout:function(){
    var n=Math.round(A.S.s*A.S.fps);
    if(A.S.tab==='range')return {label:'位置',text:A.TF(A.S.s)+' コマ / '+f3(A.S.s)+' s'};
    if(A.S.tab==='v')return {label:'最高点から',text:'±'+f3(A.S.s)+' s（'+n+' コマ）'};
    return {label:'開始から',text:'+'+f3(A.S.s)+' s ／ Δt×'+(A.S.s/dtSec()).toFixed(2)};
  },
  onFrame:place,
  enter:function(){fillDt();refreshRange();syncHButtons();},
  onReady:function(){A.S.s=0;setStage();}
};
A.registerMode('observe',mode);

/* 映像の上で横になぞる＝コマ送り */
['O1','O2'].forEach(function(id){
  A.attachStageGesture(A.P(id),{
    armed:function(){return A.S.mode==='observe'&&O.arm>0;},
    onJog:function(d){if(A.S.mode==='observe')A.step(d);}
  });
});
})(App);
