/* =========================================================
   共通コア — 両モードが使う土台
   ここには「どちらのモードでも同じもの」だけを置きます。
   モード固有の処理は 20-observe.js / 30-compare.js へ。
   ========================================================= */
var App = (function(){
'use strict';
var A = {};

/* ---------- ちいさな道具 ---------- */
A.$  = function(s,r){return (r||document).querySelector(s);};
A.$$ = function(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s));};
A.clamp = function(v,a,b){return Math.max(a,Math.min(b,v));};
A.f3 = function(x){return (Math.round(x*1000)/1000).toFixed(3);};
A.vib = function(ms){try{if(navigator.vibrate)navigator.vibrate(ms||6);}catch(e){}};
A.show = function(sel,on){var e=(typeof sel==='string')?A.$(sel):sel; if(e)e.classList.toggle('hidden',!on);};

var toastT=null;
A.toast = function(msg,ms){
  var el=A.$('#toast');
  if(!el){el=document.createElement('div');el.id='toast';el.className='toast';document.body.appendChild(el);}
  el.innerHTML=msg; el.style.display='block';
  clearTimeout(toastT); toastT=setTimeout(function(){el.style.display='none';},ms||2800);
};
A.download = function(name,obj){
  var blob=new Blob([JSON.stringify(obj,null,2)],{type:'application/json'});
  var a=document.createElement('a');
  a.href=URL.createObjectURL(blob); a.download=name;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(function(){URL.revokeObjectURL(a.href);},2000);
};

/* ---------- 状態 ---------- */
A.S = {fps:60, mode:'observe', rate:1, engine:'seek', playing:false, s:0};

/* ---------- コマと時刻 ----------
   映像側の時刻は「コマ境界（f/fps）」で返る場合と、こちらが指定した
   「コマ中央（(f+0.5)/fps）」の場合があり、さらに webm などは
   ミリ秒に丸められる。+0.3 の余裕を持たせて、どちらでも同じコマ番号にする。 */
A.FT = function(f){return (f+0.5)/A.S.fps;};
A.TF = function(t){return Math.max(0,Math.floor(t*A.S.fps+0.3));};
A.setFps = function(nf, framesToKeep){
  (framesToKeep||[]).forEach(function(o){
    if(o.obj[o.key]!=null) o.obj[o.key]=Math.max(0,Math.round(A.FT(o.obj[o.key])*nf-0.5));
  });
  A.S.fps=nf;
  A.emit('fps');
};

/* ---------- ちいさなイベント ---------- */
var subs={};
A.on = function(k,fn){(subs[k]=subs[k]||[]).push(fn);};
A.emit = function(k,a){(subs[k]||[]).forEach(function(f){f(a);});};

/* ---------- プレーヤー ---------- */
A.players = {};
A.P = function(id){return A.players[id];};
A.mkPlayer = function(id){
  var p={id:id,
    vp:A.$('[data-vp="'+id+'"]'), video:A.$('[data-video="'+id+'"]'), ovl:A.$('[data-ovl="'+id+'"]'),
    url:null,file:null,name:'',ready:false,previewing:false,mediaTime:null,
    startFrame:0,scale:1,offsetY:0,panX:0.5,panX2:0};
  p.video.addEventListener('loadedmetadata',function(){
    p.ready=true; clearTimeout(p._t);
    if(p.video.videoWidth&&p.video.videoHeight) p.ar=p.video.videoWidth/p.video.videoHeight;
    if(p.video.requestVideoFrameCallback){
      var cb=function(n,m){p.mediaTime=m.mediaTime;p.video.requestVideoFrameCallback(cb);};
      p.video.requestVideoFrameCallback(cb);
    }
    A.emit('loaded',p);
  });
  p.video.addEventListener('error',function(){clearTimeout(p._t);A.codecHelp(p.name);});
  A.players[id]=p;
  return p;
};
A.loadInto = function(id,file){
  var p=A.P(id); if(!p||!file)return;
  if(p.url){try{URL.revokeObjectURL(p.url);}catch(e){}}
  p.url=URL.createObjectURL(file); p.file=file; p.name=file.name;
  p.ready=false; p.mediaTime=null; p.startFrame=0;
  p.video.src=p.url; p.video.load();
  clearTimeout(p._t);
  p._t=setTimeout(function(){if(!p.ready)A.codecHelp(p.name);},9000);
};
A.codecHelp = function(name){
  A.toast('この動画をブラウザで開けませんでした。'+
    (/\.mov$/i.test(name||'')?'iPhone の「高効率(HEVC)」形式かもしれません。':'')+
    ' 設定→カメラ→フォーマット→「互換性優先」で撮り直すか、Safari でお試しください。',7000);
};
A.isVideoFile = function(f){
  return !!f && (/^video\//.test(f.type)||/\.(mp4|mov|m4v|webm|ogg|avi|3gp)$/i.test(f.name));
};
/* 映像の拡大・上下左右のずらし（カメラ用の追加移動量 extraX は % ） */
A.applyTransform = function(p,extraX,flipAboutX){
  if(!p)return;
  var t='';
  if(flipAboutX!=null){
    p.video.style.transformOrigin=(flipAboutX*100)+'% 50%';
    t='scaleX(-1)';
  }else{
    p.video.style.transformOrigin='50% 50%';
    t='translate('+((extraX||0))+'%,'+p.offsetY+'%) scale('+p.scale+')';
  }
  p.video.style.transform=t;
  p.video.style.objectPosition=(p.panX*100)+'% 50%';
};

/* ---------- モード登録 ---------- */
A.modes = {};
A.registerMode = function(id,m){A.modes[id]=m;};
A.mode = function(){return A.modes[A.S.mode]||{};};
A.sMax = function(){var m=A.mode();return m.sMax?Math.max(0,m.sMax()):0;};

/* ---------- 仮想時計（2つの映像をそろえる心臓部） ----------
   video を2つ play() すると必ずずれるので、共通の時計をひとつ持ち、
   毎フレーム各 video の currentTime を代入して合わせる。 */
var lastTS=0, tick=0;
A.setPlaying = function(on){
  if(on&&A.sMax()<=0) return;
  A.S.playing=on; lastTS=0;
  Object.keys(A.players).forEach(function(k){
    var p=A.players[k]; if(!p.ready)return;
    if(on&&A.S.engine==='native'&&A.mode().allowNative){
      try{p.video.playbackRate=Math.max(0.0625,A.S.rate);}catch(e){}
      var pr=p.video.play(); if(pr&&pr.catch)pr.catch(function(){});
    } else p.video.pause();
  });
  A.emit('playing',on);
};
A.togglePlay = function(){
  if(!A.S.playing&&A.S.s>=A.sMax()-1e-6)A.S.s=0;
  A.setPlaying(!A.S.playing);
};
A.step = function(n){
  A.setPlaying(false);
  if(A.mode().step){A.mode().step(n);return;}
  A.S.s=A.clamp(A.S.s+n/A.S.fps,0,A.sMax());
};
A.seekTo = function(p,target){
  if(!p.ready||!isFinite(p.video.duration))return;
  var v=p.video;
  target=A.clamp(target,0,Math.max(0,v.duration-1e-3));
  if(A.S.engine==='native'&&A.S.playing&&A.mode().allowNative){
    if(!v.seeking&&Math.abs(v.currentTime-target)>2/A.S.fps)v.currentTime=target;
  }else{
    if(v.seeking)return;
    if(Math.abs(v.currentTime-target)>0.5/A.S.fps)v.currentTime=target;
  }
};
function frame(ts){
  var m=A.mode();
  if(A.S.playing){
    if(!lastTS)lastTS=ts;
    var dt=(ts-lastTS)/1000; lastTS=ts;
    A.S.s+=dt*A.S.rate;
    var mx=A.sMax();
    if(A.S.s>=mx){A.S.s=mx;A.setPlaying(false);}
  } else lastTS=0;
  if(m.timeFor){
    Object.keys(A.players).forEach(function(k){
      var p=A.players[k];
      if(!p.ready||p.previewing)return;
      var t=m.timeFor(k);
      if(t!=null)A.seekTo(p,t);
    });
  }
  if((tick++ % 2)===0){
    A.emit('readout');
    if(m.onFrame)m.onFrame();
  }
  requestAnimationFrame(frame);
}
A.startClock=function(){requestAnimationFrame(frame);};

/* ---------- ドラッグ ---------- */
function dragBase(ev,el,cb,axis){
  ev.preventDefault(); ev.stopPropagation();
  function mv(e){
    var r=el.getBoundingClientRect();
    cb(A.clamp(axis==='x'?(e.clientX-r.left)/r.width:(e.clientY-r.top)/r.height,0,1));
  }
  function up(){
    window.removeEventListener('pointermove',mv);
    window.removeEventListener('pointerup',up);
    window.removeEventListener('pointercancel',up);
  }
  window.addEventListener('pointermove',mv);
  window.addEventListener('pointerup',up);
  window.addEventListener('pointercancel',up);
  mv(ev);
}
A.dragX=function(ev,el,cb){dragBase(ev,el,cb,'x');};
A.dragY=function(ev,el,cb){dragBase(ev,el,cb,'y');};

/* 横になぞってコマ送り（PCのマウスでも効く） */
A.PX_PER_FRAME = 11;
A.attachJog = function(el,cb){
  var on=false,x0=0,acc=0;
  el.addEventListener('pointerdown',function(e){
    if(A.isOverlayEl(e.target))return;
    on=true;x0=e.clientX;acc=0;el.classList.add('active');
    try{el.setPointerCapture(e.pointerId);}catch(err){}
  });
  el.addEventListener('pointermove',function(e){
    if(!on)return;
    var dx=e.clientX-x0, n=(dx<0?Math.ceil(dx/A.PX_PER_FRAME):Math.floor(dx/A.PX_PER_FRAME));
    if(n!==acc){cb(n-acc);acc=n;A.vib(4);}
  });
  ['pointerup','pointercancel'].forEach(function(ev){
    el.addEventListener(ev,function(){on=false;el.classList.remove('active');});
  });
};
A.isOverlayEl = function(t){
  return !!t&&t.classList&&(t.classList.contains('hline')||t.classList.contains('vline'));
};
/* 映像の上での指の動き：横＝コマ送り、縦＝（許可されていれば）映像を上下に動かす */
A.attachStageGesture = function(p,opt){
  var g={on:false,axis:null,x0:0,y0:0,acc:0,base:0,extra:0};
  p.vp.addEventListener('pointerdown',function(e){
    if(A.isOverlayEl(e.target))return;
    if(opt.armed&&opt.armed())return;   /* クリックで位置を取る最中は何もしない */
    g.on=true;g.axis=null;g.x0=e.clientX;g.y0=e.clientY;g.acc=0;
    g.base=p.offsetY; g.extra=opt.onDragYStart?opt.onDragYStart():0;
    try{p.vp.setPointerCapture(e.pointerId);}catch(err){}
  });
  p.vp.addEventListener('pointermove',function(e){
    if(!g.on)return;
    if(A.pointerCount&&A.pointerCount()>1)return;   /* つまむ操作の最中は動かさない */
    var dx=e.clientX-g.x0, dy=e.clientY-g.y0;
    if(!g.axis){
      if(Math.abs(dx)<9&&Math.abs(dy)<9)return;
      g.axis=Math.abs(dx)>Math.abs(dy)?'x':'y';
    }
    if(A.zoomed()){
      var r0=p.vp.getBoundingClientRect();
      A.setZoom(A.view.z, A.view.cx-(e.clientX-g.x0)/r0.width, A.view.cy-(e.clientY-g.y0)/r0.height);
      g.x0=e.clientX; g.y0=e.clientY;
      return;
    }
    if(g.axis==='x'&&opt.onJog){
      var n=(dx<0?Math.ceil(dx/A.PX_PER_FRAME):Math.floor(dx/A.PX_PER_FRAME));
      if(n!==g.acc){opt.onJog(n-g.acc);g.acc=n;A.vib(4);}
    }else if(g.axis==='y'&&opt.onDragY){
      var r=p.vp.getBoundingClientRect();
      opt.onDragY(g.base+dy/r.height*100, g.extra+dy/r.height, g.base, g.extra);
    }
  });
  ['pointerup','pointercancel'].forEach(function(ev){
    p.vp.addEventListener(ev,function(){g.on=false;g.axis=null;});
  });
};

/* ---------- 長押しで連打 ----------
   スマホでは click だけだと押しっぱなしが効かないので、
   押している間くり返す。 */
A.attachRepeat=function(el,fn){
  var t=null,iv=null;
  function stop(){clearTimeout(t);clearInterval(iv);t=null;iv=null;}
  el.addEventListener('pointerdown',function(e){
    if(el.disabled)return;
    e.preventDefault();
    try{el.setPointerCapture(e.pointerId);}catch(err){}
    fn(); A.vib();
    t=setTimeout(function(){iv=setInterval(function(){
      if(el.disabled){stop();return;}
      fn(); A.vib(3);
    },90);},420);
  });
  ['pointerup','pointercancel','pointerleave'].forEach(function(ev){el.addEventListener(ev,stop);});
  el.addEventListener('click',function(e){e.preventDefault();});
};

/* ---------- 拡大（ズーム） ----------
   .vp ごと拡大するので、映像とオーバーレイ（線・点）が一緒に動き、ずれません。
   クリック位置は getBoundingClientRect() の中での割合で取っているので、
   拡大していても計算は変わりません。 */
A.view={z:1,cx:0.5,cy:0.5};
A.ZMAX=6;
A.applyView=function(){
  var v=A.view;
  Object.keys(A.players).forEach(function(k){
    var p=A.players[k];
    p.vp.style.transformOrigin=(v.cx*100)+'% '+(v.cy*100)+'%';
    p.vp.style.transform=(v.z===1)?'none':('scale('+v.z+')');
  });
  A.emit('view');
};
A.setZoom=function(z,cx,cy){
  var v=A.view;
  v.z=A.clamp(z,1,A.ZMAX);
  if(v.z===1){v.cx=0.5;v.cy=0.5;}
  else{
    if(cx!=null)v.cx=A.clamp(cx,0,1);
    if(cy!=null)v.cy=A.clamp(cy,0,1);
  }
  A.applyView();
};
A.zoomed=function(){return A.view.z>1.001;};
/* 2本指でつまむ拡大と、拡大中の1本指での移動 */
var zpts={};                       /* いま触れている指（全パネル共通） */
A.pointerCount=function(){return Object.keys(zpts).length;};
A.attachZoomGesture=function(p){
  var pts=zpts,base=null;
  function list(){var a=[];for(var k in pts)a.push(pts[k]);return a;}
  p.vp.addEventListener('pointerdown',function(e){
    pts[e.pointerId]={x:e.clientX,y:e.clientY};
    var a=list();
    if(a.length===2){
      var r=p.vp.getBoundingClientRect();
      base={d:Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y),z:A.view.z,
            cx:A.clamp(((a[0].x+a[1].x)/2-r.left)/r.width,0,1),
            cy:A.clamp(((a[0].y+a[1].y)/2-r.top)/r.height,0,1)};
      if(base.d<1)base=null;
    }
  });
  p.vp.addEventListener('pointermove',function(e){
    if(!pts[e.pointerId])return;
    pts[e.pointerId]={x:e.clientX,y:e.clientY};
    var a=list();
    if(a.length===2&&base){
      var d=Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y);
      A.setZoom(base.z*(d/base.d),base.cx,base.cy);
    }
  });
  ['pointerup','pointercancel','pointerleave'].forEach(function(ev){
    p.vp.addEventListener(ev,function(e){delete pts[e.pointerId];if(list().length<2)base=null;});
  });
};

/* ---------- オーバーレイ（線・点） ---------- */
A.ov = {
  clear:function(p){p.ovl.innerHTML='';},
  el:function(p,cls,tagText){
    var d=document.createElement('div'); d.className=cls;
    if(tagText){var s=document.createElement('span');s.className='tag';s.textContent=tagText;d.appendChild(s);}
    p.ovl.appendChild(d); return d;
  },
  arm:function(on){Object.keys(A.players).forEach(function(k){
    A.players[k].ovl.classList.toggle('noev',!!on);
    A.players[k].vp.classList.toggle('crosshair',!!on);
  });}
};

/* ---------- 画面のスリープ防止 ---------- */
var wl=null;
A.keepAwake=function(){
  try{ if('wakeLock' in navigator && !wl){
    navigator.wakeLock.request('screen').then(function(x){wl=x;x.addEventListener('release',function(){wl=null;});},function(){});
  }}catch(e){}
};

return A;
})();
