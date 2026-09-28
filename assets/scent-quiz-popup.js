    /* ============================================================
       SCENT MATCH - perfume swipe quiz (mechanics replica)
       Ported into a site-wide popup: all ids prefixed sq-, all DOM
       lookups scoped under #scent-quiz-popup-overlay so this cannot
       collide with or leak into the rest of the theme.
       ============================================================ */
    (function(){
    'use strict';

    /* ---- Klaviyo hook ----------------
       Enabled/key/list come from theme settings (Doftquiz > E-postinsamling),
       not hardcoded here, so merchants can turn it on/off and rotate keys
       from the admin without touching code. */
    var SQ_CFG = window.SQ_QUIZ_CONFIG || {};
    var KLAVIYO_CONFIG = {
      enabled: !!(SQ_CFG.klaviyoEnabled && SQ_CFG.klaviyoPublicKey && SQ_CFG.klaviyoListId),
      publicApiKey: SQ_CFG.klaviyoPublicKey || '',
      listId: SQ_CFG.klaviyoListId || ''
    };

    var QUIZ_LANG = 'sv';
    var TAG_SV = {Date:'Dejt',Party:'Fest',Autumn:'Höst',Office:'Kontor',Everyday:'Vardag',Summer:'Sommar',Evening:'Kväll',Winter:'Vinter',Spring:'Vår'};

    /* Scents shown in the swipe deck - built server-side in
       snippets/scent-quiz-popup.liquid from settings.scent_quiz_collection
       (Theme settings > Scent Quiz > Scents). There is no built-in demo
       list: if no collection is picked (or it has zero products),
       SCENTS is empty and the quiz shows a "select a collection" warning
       instead of opening - see HAS_SCENTS below. */
    var SCENTS = window.SQ_QUIZ_SCENTS || [];
    var HAS_SCENTS = SCENTS.length > 0;

    /* 6x50ml bundle PDP - destination for the board cards, prefilled from
       current picks. Prefill contract: BUNDLE_URL + '?scents=' + up to 6
       saved productIds. BUNDLE_URL comes from settings.scent_quiz_bundle_product
       (theme settings). */
    var BUNDLE_URL = (window.SQ_QUIZ_CONFIG && window.SQ_QUIZ_CONFIG.bundleUrl) || "";
    function bundleLink(){
      var ids = state.liked.map(function(s){ return s.productId; }).slice(0,6);
      if(!BUNDLE_URL) return '#';
      return ids.length ? BUNDLE_URL + '?scents=' + ids.join(',') : BUNDLE_URL;
    }

    /* Primary "Build my bundle" CTA (sq-shopAll): adds the merchant-selected
       bundle product (settings.scent_quiz_bundle_product) straight to cart -
       no redirect to another product/page - with the visitor's picks recorded
       as line item properties, then sends them to checkout. Requires the
       merchant to actually pick a product in Theme settings; if they haven't,
       BUNDLE_PRODUCT_VARIANT_ID is null and the button shows an inline error
       instead of adding to cart. See doShopAllATC() below. */
    var BUNDLE_PRODUCT_VARIANT_ID = (SQ_CFG.bundleProductVariantId) || null;

    /* Real photo per index: 0 = product bottle, 1 = inspiration bottle.
       Graceful SVG gradient fallback ONLY when a URL is missing. */
    var IMG_LABELS = ["Bottle","Inspiration"];
    function imgSrc(scent, photoIdx){
      if(scent.imgs && scent.imgs[photoIdx]) return scent.imgs[photoIdx];
      var label = IMG_LABELS[photoIdx] || ("Photo " + (photoIdx+1));
      var svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800" viewBox="0 0 600 800">'+
    '<defs><linearGradient id="g" x1="0" y1="0" x2="'+(photoIdx%2? '0':'1')+'" y2="1">'+
    '<stop offset="0" stop-color="'+scent.accent+'"/>'+
    '<stop offset="1" stop-color="'+scent.accent2+'"/></linearGradient></defs>'+
    '<rect width="600" height="800" fill="url(#g)"/>'+
    '<circle cx="'+(120+photoIdx*90)+'" cy="200" r="130" fill="rgba(255,255,255,.10)"/>'+
    '<circle cx="'+(480-photoIdx*70)+'" cy="560" r="180' +'" fill="rgba(0,0,0,.10)"/>'+
    '<text x="300" y="360" text-anchor="middle" font-family="Georgia,serif" font-size="44" fill="rgba(255,255,255,.92)">'+scent.name+'</text>'+
    '<text x="300" y="410" text-anchor="middle" font-family="Arial,sans-serif" font-size="24" fill="rgba(255,255,255,.75)">'+label+' &#183; '+(photoIdx+1)+' / '+scent.imgs.length+'</text>'+
    '</svg>';
      return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
    }

    /* ---------------- State ---------------- */
    var state = { pos:0, liked:[], history:[] };
    var root = document.getElementById('scent-quiz-popup-overlay');
    var deckEl = document.getElementById('sq-deck');
    var TOTAL = SCENTS.length;
    var MAX_PICKS = 6; // bundle holds 6 scents - hard cap on right swipes

    /* ---------------- Utilities ---------------- */
    function vibrate(ms){ try{ if(navigator.vibrate) navigator.vibrate(ms); }catch(e){} }
    function show(id){
      var els=root.querySelectorAll('.screen');
      for(var i=0;i<els.length;i++) els[i].classList.remove('active');
      document.getElementById(id).classList.add('active');
    }

    /* ---------------- Analytics ----------------
       Fires to GTM dataLayer, Meta Pixel (fbq) and GA4 (gtag) if present.
       Every funnel step is tracked so this popup can actually be optimized. */
    function track(event, params){
      params = params || {};
      try{ if(window.dataLayer) window.dataLayer.push(Object.assign({event:'scent_'+event}, params)); }catch(e){}
      try{ if(window.fbq) window.fbq('trackCustom', 'Scent'+event.replace(/(^|_)(\w)/g,function(m,a,b){return b.toUpperCase();}), params); }catch(e){}
      try{ if(window.gtag) window.gtag('event', 'scent_'+event, params); }catch(e){}
    }

    /* ---------------- Early-exit "see my matches" ---------------- */
    var SEE_AFTER = 5; // show the escape hatch once they've engaged
    function updateSeeMatches(){
      var btn=document.getElementById('sq-seeMatches');
      if(!btn) return;
      var eligible = state.pos>0 && state.pos<TOTAL && (state.pos>=SEE_AFTER || state.liked.length>=3);
      document.getElementById('sq-seeCount').textContent=state.liked.length;
      btn.hidden = !eligible;
    }

    /* ---------------- Intro preview thumbs ----------------
       Built lazily (on first popup open, see openPopup() below) instead of
       on page load, so these 3 CDN images are never fetched for visitors
       who never open the quiz. */
    var introPreviewBuilt=false;
    function buildIntroPreview(){
      if(introPreviewBuilt) return;
      introPreviewBuilt=true;
      var p=document.getElementById('sq-introPreview');
      var picks=[SCENTS[2],SCENTS[0],SCENTS[4]];
      for(var i=0;i<picks.length;i++){
        var d=document.createElement('div'); d.className='pc';
        var im=document.createElement('img'); im.src=imgSrc(picks[i],0); im.alt=picks[i].name; im.loading='lazy';
        d.appendChild(im); p.appendChild(d);
      }
    }

    /* ---------------- Card builder ---------------- */
    function buildCard(scent, idx){
      var card=document.createElement('div');
      card.className='card'; card.dataset.idx=idx; card._imgIndex=0; card._theme=scent;

      var photo=document.createElement('div'); photo.className='photo';
      var imgEls=[];
      var nImgs=Math.min(scent.imgs.length,5);
      for(var i=0;i<nImgs;i++){
    var im=document.createElement('img');
    im.alt=scent.name+' scent';
    if(i===0){ im.src=imgSrc(scent,0); im.className='show'; }
    im.decoding='async';
    photo.appendChild(im); imgEls.push(im);
      }
      card._imgEls=imgEls;

      var pips=document.createElement('div'); pips.className='pips';
      for(var j=0;j<nImgs;j++){ var pip=document.createElement('i'); if(j===0)pip.className='on'; pips.appendChild(pip); }
      photo.appendChild(pips); card._pips=pips;

      // tap zones to cycle photos
      var tl=document.createElement('div'); tl.className='tap-hint l';
      var tr=document.createElement('div'); tr.className='tap-hint r';
      photo.appendChild(tl); photo.appendChild(tr);

      // stamps
      var love=document.createElement('div'); love.className='stamp love'; love.textContent='Älskar';
      var skip=document.createElement('div'); skip.className='stamp skip'; skip.textContent='Hoppa';
      photo.appendChild(love); photo.appendChild(skip);
      card._love=love; card._skip=skip;

      // persistent swipe-direction cues (fade out as the card is dragged)
      var cueL=document.createElement('div'); cueL.className='dir-cue l';
      cueL.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>Hoppa över';
      var cueR=document.createElement('div'); cueR.className='dir-cue r';
      cueR.innerHTML='Spara<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>';
      photo.appendChild(cueL); photo.appendChild(cueR);
      card._cueL=cueL; card._cueR=cueR;

      var info=document.createElement('div'); info.className='info';
      var tagHtml='';
      for(var t=0;t<scent.tags.length;t++) tagHtml+='<span>'+(TAG_SV[scent.tags[t]]||scent.tags[t])+'</span>';
      info.innerHTML =
    '<div class="cat"><span class="dot" style="background:'+scent.accent+'"></span>'+(scent.no ? 'Nr '+scent.no : 'Doftprofil')+'</div>'+
    '<h2>'+scent.name+'</h2>'+
    (scent.emo ? '<p class="desc emo-lead">'+(scent.emo[QUIZ_LANG]||scent.emo.en)+'</p>' : '')+
    (scent.desc ? '<p class="desc inspired">'+(QUIZ_LANG==='sv'?'Inspirerad av ':'Inspired by ')+scent.desc+'</p>' : '')+
    '<div class="tags">'+tagHtml+'</div>'+
    '<span class="shop-mode"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18M16 10a4 4 0 0 1-8 0"/></svg>Spara nu, shoppa ditt board i slutet</span>';

      card.appendChild(photo); card.appendChild(info);
      bindPhotoTaps(card, tl, tr);
      return card;
    }

    function setImg(card, idx){
      var els=card._imgEls; if(!els||!els.length) return;
      idx=(idx+els.length)%els.length;
      card._imgIndex=idx;
      for(var i=0;i<els.length;i++){
    if(i===idx){
      if(!els[i].src) els[i].src=imgSrc(card._theme,i);
      els[i].classList.add('show');
    } else els[i].classList.remove('show');
    card._pips.children[i].className = (i===idx)?'on':'';
      }
    }

    function bindPhotoTaps(card, tl, tr){
      tl.addEventListener('click', function(e){ e.stopPropagation(); setImg(card, card._imgIndex-1); });
      tr.addEventListener('click', function(e){ e.stopPropagation(); setImg(card, card._imgIndex+1); });
    }

    /* ---------------- Deck window rendering ---------------- */
    function renderDeck(){
      deckEl.innerHTML='';
      // render up to 3 upcoming, farthest first so nearest is on top (last child)
      var end=Math.min(state.pos+3, TOTAL);
      for(var i=end-1;i>=state.pos;i--){
    var card=buildCard(SCENTS[i], i);
    deckEl.appendChild(card);
      }
      applyDepth();
      bindTop();
      updateProgress();
    }
    function topCard(){ return deckEl.lastElementChild; }
    function applyDepth(){
      var kids=deckEl.children; var n=kids.length;
      for(var i=0;i<n;i++){
    var depth=n-1-i; // 0 = top
    var c=kids[i];
    if(!c.classList.contains('dragging')){
      c.style.transition='transform .35s cubic-bezier(.2,.8,.2,1)';
      c.style.transform='translateY('+(depth*10)+'px) scale('+(1-depth*0.04)+')';
      c.style.zIndex=String(10+i);
    }
    c.style.pointerEvents = (i===n-1)?'auto':'none';
      }
    }
    function updateProgress(){
      // Progress toward the 6-pick bundle goal, not raw position in the
      // 24-card deck - reaching 6 saves is what "finishes" the quiz.
      var pct=(state.liked.length/MAX_PICKS)*100;
      document.getElementById('sq-progressBar').style.width=pct+'%';
    }

    /* ---------------- Swipe engine ---------------- */
    function inRect(el, x, y){
      var r=el.getBoundingClientRect();
      return x>=r.left && x<=r.right && y>=r.top && y<=r.bottom;
    }
    var drag={active:false, startX:0, startY:0, dx:0, dy:0, card:null, moved:false, id:null};
    function bindTop(){
      var c=topCard(); if(!c) return;
      c.addEventListener('pointerdown', onDown);
    }
    function onDown(e){
      if(e.button && e.button!==0) return;
      var c=e.currentTarget;
      if(c!==topCard()) return;
      cancelDemo();
      drag.active=true; drag.card=c; drag.startX=e.clientX; drag.startY=e.clientY; drag.dx=0; drag.dy=0; drag.moved=false; drag.id=e.pointerId;
      c.classList.add('dragging');
      try{ c.setPointerCapture(e.pointerId); }catch(err){}
      c.addEventListener('pointermove', onMove);
      c.addEventListener('pointerup', onUp);
      c.addEventListener('pointercancel', onUp);
    }
    function onMove(e){
      if(!drag.active) return;
      drag.dx=e.clientX-drag.startX; drag.dy=e.clientY-drag.startY;
      if(Math.abs(drag.dx)>6 || Math.abs(drag.dy)>6) drag.moved=true;
      var rot=drag.dx*0.06;
      drag.card.style.transform='translate('+drag.dx+'px,'+drag.dy+'px) rotate('+rot+'deg)';
      var p=Math.min(Math.abs(drag.dx)/90,1);
      drag.card._love.style.opacity = drag.dx>0 ? p : 0;
      drag.card._skip.style.opacity = drag.dx<0 ? p : 0;
      // fade the resting cues out as the drag builds, so the big stamps take over
      var cueFade=Math.max(0, 0.9 - p*1.5);
      if(drag.card._cueL) drag.card._cueL.style.opacity=cueFade;
      if(drag.card._cueR) drag.card._cueR.style.opacity=cueFade;
    }
    function onUp(e){
      if(!drag.active) return;
      var c=drag.card; drag.active=false;
      c.removeEventListener('pointermove', onMove);
      c.removeEventListener('pointerup', onUp);
      c.removeEventListener('pointercancel', onUp);
      c.classList.remove('dragging');
      var THRESH=95;
      if(drag.dx>THRESH){ commitSwipe(c,1); }
      else if(drag.dx<-THRESH){ commitSwipe(c,-1); }
      else if(!drag.moved){
    // pointer capture retargets clicks to the card, so the dir-cue
    // pills can't receive their own click events - hit-test them here
    if(c._cueL && inRect(c._cueL, e.clientX, e.clientY)){ commitSwipe(c,-1); return; }
    if(c._cueR && inRect(c._cueR, e.clientX, e.clientY)){ commitSwipe(c,1); return; }
    // treat as tap: which side of the photo?
    var rect=c.getBoundingClientRect();
    var rel=(e.clientX-rect.left)/rect.width;
    if(e.clientY-rect.top < rect.height*0.62){ // tapped photo area
      if(rel>0.55) setImg(c, c._imgIndex+1); else if(rel<0.45) setImg(c, c._imgIndex-1);
    }
    springBack(c);
      } else { springBack(c); }
    }
    function springBack(c){
      c._love.style.opacity=0; c._skip.style.opacity=0;
      if(c._cueL) c._cueL.style.opacity=.9;
      if(c._cueR) c._cueR.style.opacity=.9;
      applyDepth();
    }

    /* like=1, skip=-1 */
    function commitSwipe(card, dir){
      cancelDemo();
      // hard cap: bundle only fits MAX_PICKS scents
      if(dir>0 && state.liked.length>=MAX_PICKS){
    toast("Ditt bundle är fullt, 6 dofter valda");
    springBack(card);
    updateSeeMatches();
    return;
      }
      document.getElementById('sq-deck-screen').classList.add('swiped'); // hide hint + stop nudge after first swipe
      var idx=parseInt(card.dataset.idx,10);
      var scent=SCENTS[idx];
      card.style.transition='transform .42s cubic-bezier(.4,0,.4,1), opacity .42s';
      var offX=dir>0?window.innerWidth:-window.innerWidth;
      card.style.transform='translate('+(offX*1.1)+'px,'+(drag.dy||0)+'px) rotate('+(dir*22)+'deg)';
      card.style.opacity='0';

      state.history.push({idx:idx, dir:dir, wasLiked:dir>0});
      track('swipe', {scent:scent.name, action:dir>0?'save':'skip', position:state.pos+1, saved:state.liked.length + (dir>0?1:0)});
      // Give the progress bar instant feedback at swipe time instead of
      // waiting ~250ms for the outgoing card's exit animation to finish
      // (state.liked itself still only gets pushed to below, and state.pos
      // only advances once that animation completes in the setTimeout
      // below, so the new top card and everything else stays in sync).
      // Only saves move the bar - it tracks progress toward the 6-pick
      // bundle goal, so skips leave it unchanged.
      var likedAfterThisSwipe = state.liked.length + (dir>0?1:0);
      document.getElementById('sq-progressBar').style.width = (likedAfterThisSwipe/MAX_PICKS*100)+'%';
      if(dir>0){
    state.liked.push(scent);
    onLike(card);
      } else {
    vibrate(8);
      }
      document.getElementById('sq-undoBtn').disabled=false;

      setTimeout(function(){
    if(card.parentNode) card.parentNode.removeChild(card);
    state.pos++;
    // add a new card at the back if available
    var back=state.pos+2;
    if(back<TOTAL){
      var nc=buildCard(SCENTS[back], back);
      deckEl.insertBefore(nc, deckEl.firstElementChild);
    }
    applyDepth(); bindTop(); updateProgress(); updateSeeMatches();
    maybeCoach();
    // 6th save = bundle full -> straight to results with the picks prefilled
    if(state.liked.length>=MAX_PICKS){
      setTimeout(function(){ finish('bundle_full'); }, 900);
      return;
    }
    if(state.pos>=TOTAL) finish();
      }, dir>0?260:220);
    }

    function onLike(card){
      vibrate([10,30,14]);
      bumpCount();
      heartBurst();
      var n=state.liked.length;
      var msgs={1:"Sparad till ditt board!", 3:"Bra smak, 3 sparade", 5:"5 av 6 valda", 6:"Det blev 6, ditt bundle är fullt!"};
      if(msgs[n]) toast(msgs[n]);
    }
    function bumpCount(){
      var chip=document.getElementById('sq-countChip');
      document.getElementById('sq-countNum').textContent=state.liked.length;
      chip.classList.remove('bump'); void chip.offsetWidth; chip.classList.add('bump');
    }
    function toast(msg){
      var t=document.getElementById('sq-toast');
      document.getElementById('sq-toastMsg').textContent=msg;
      t.classList.remove('show'); void t.offsetWidth; t.classList.add('show');
    }

    /* floating hearts on like */
    function heartBurst(){
      var app=document.getElementById('sq-app');
      var rect=app.getBoundingClientRect();
      var cx=rect.width*0.5, cy=rect.height*0.5;
      for(var i=0;i<10;i++){
    (function(i){
      var el=document.createElement('div'); el.className='particle';
      var size=12+Math.random()*16;
      el.innerHTML='<svg viewBox="0 0 24 24" width="'+size+'" height="'+size+'" fill="#b03a5b"><path d="M12 21s-6.7-4.35-9.33-8.24C.9 10.02 1.9 6.5 5.1 5.66c1.98-.52 3.9.37 4.9 1.98C11 6.03 12.92 5.14 14.9 5.66c3.2.84 4.2 4.36 2.43 7.1C18.7 16.65 12 21 12 21z"/></svg>';
      el.style.left=cx+'px'; el.style.top=cy+'px'; el.style.opacity='1';
      app.appendChild(el);
      var ang=(-90 + (Math.random()*120-60))*Math.PI/180;
      var dist=90+Math.random()*130;
      var tx=Math.cos(ang)*dist, ty=Math.sin(ang)*dist - 40;
      var dur=650+Math.random()*450;
      el.animate([
        {transform:'translate(-50%,-50%) translate(0,0) scale(.4) rotate(0deg)', opacity:1},
        {transform:'translate(-50%,-50%) translate('+tx+'px,'+ty+'px) scale(1.1) rotate('+(Math.random()*180-90)+'deg)', opacity:0}
      ],{duration:dur, easing:'cubic-bezier(.2,.6,.3,1)'}).onfinish=function(){ if(el.parentNode) el.parentNode.removeChild(el); };
    })(i);
      }
    }

    /* petal confetti on results */
    function petalShower(){
      var app=document.getElementById('sq-app'); var rect=app.getBoundingClientRect();
      var colors=['#b03a5b','#c9a961','#e8d9b8','#8b917d','#9b8fb5','#23233a'];
      for(var i=0;i<26;i++){
    (function(i){
      var el=document.createElement('div'); el.className='particle';
      var s=8+Math.random()*10;
      el.style.width=s+'px'; el.style.height=(s*1.5)+'px';
      el.style.background=colors[i%colors.length];
      el.style.borderRadius='60% 60% 60% 60% / 80% 80% 40% 40%';
      var startX=Math.random()*rect.width;
      el.style.left=startX+'px'; el.style.top='-20px';
      app.appendChild(el);
      var drift=(Math.random()*120-60);
      var dur=2200+Math.random()*1600;
      el.animate([
        {transform:'translateY(-20px) translateX(0) rotate(0deg)', opacity:1},
        {transform:'translateY('+(rect.height+40)+'px) translateX('+drift+'px) rotate('+(Math.random()*720-360)+'deg)', opacity:.9}
      ],{duration:dur, easing:'linear'}).onfinish=function(){ if(el.parentNode) el.parentNode.removeChild(el); };
    })(i);
      }
    }

    /* teaching demo on first card */
    var coachShown=false;
    var demoAnims=[];
    function maybeCoach(){ /* first-card demo runs once via showCoach() */ }
    function cancelDemo(){
      for(var i=0;i<demoAnims.length;i++){ try{ demoAnims[i].cancel(); }catch(e){} }
      demoAnims=[];
      var c=topCard();
      if(c){ if(c._love) c._love.style.opacity=0; if(c._skip) c._skip.style.opacity=0; }
    }
    function showCoach(){
      if(coachShown) return; coachShown=true;
      var c=topCard(); if(!c || !c.animate) return;
      var dur=2400, iters=2;
      // physically demonstrate the gesture: swing right (SAVE), back, left (SKIP), back - twice
      var cardA=c.animate([
    {transform:'translateX(0) rotate(0deg)', offset:0},
    {transform:'translateX(84px) rotate(7deg)', offset:.2},
    {transform:'translateX(0) rotate(0deg)', offset:.4},
    {transform:'translateX(-84px) rotate(-7deg)', offset:.6},
    {transform:'translateX(0) rotate(0deg)', offset:.8},
    {transform:'translateX(0) rotate(0deg)', offset:1}
      ],{duration:dur, iterations:iters, easing:'ease-in-out'});
      var loveA=c._love.animate([
    {opacity:0,offset:0},{opacity:1,offset:.2},{opacity:0,offset:.38},{opacity:0,offset:1}
      ],{duration:dur, iterations:iters, easing:'ease-in-out'});
      var skipA=c._skip.animate([
    {opacity:0,offset:0},{opacity:0,offset:.42},{opacity:1,offset:.6},{opacity:0,offset:.78},{opacity:0,offset:1}
      ],{duration:dur, iterations:iters, easing:'ease-in-out'});
      demoAnims=[cardA,loveA,skipA];
      cardA.onfinish=function(){ cancelDemo(); };
    }

    /* ---------------- Undo ---------------- */
    function undo(){
      if(!state.history.length) return;
      var last=state.history.pop();
      if(last.wasLiked){
    // remove from liked (last matching)
    for(var i=state.liked.length-1;i>=0;i--){ if(state.liked[i]===SCENTS[last.idx]){ state.liked.splice(i,1); break; } }
    bumpCount();
      }
      // if we're on results, go back to deck
      if(document.getElementById('sq-results').classList.contains('active')){
    show('sq-deck-screen');
      }
      state.pos=Math.max(0,state.pos-1);
      renderDeck();
      // animate the restored top card back in from its swiped side
      var c=topCard();
      if(c){
    var from=last.dir>0?window.innerWidth:-window.innerWidth;
    c.style.transition='none';
    c.style.transform='translate('+(from)+'px,0) rotate('+(last.dir*20)+'deg)';
    void c.offsetWidth;
    c.style.transition='transform .45s cubic-bezier(.2,.8,.2,1)';
    applyDepth();
      }
      document.getElementById('sq-undoBtn').disabled = state.history.length===0;
      vibrate(8);
    }

    /* ---------------- Finish / results ---------------- */
    function finish(source){
      track('results', {saved:state.liked.length, source:source||'completed', seen:state.pos});
      buildResults();
      if(source==='bundle_full'){
    document.getElementById('sq-resTitle').textContent='Ditt bundle med 6 dofter är redo';
    document.getElementById('sq-resSub').textContent='Alla 6 val ligger redan i ditt bundle nedan, ett tryck för att bygga det.';
      }
      show('sq-results');
      document.getElementById('sq-results').scrollTop=0;
      var sm=document.getElementById('sq-seeMatches'); if(sm) sm.hidden=true;
      setTimeout(petalShower, 250);
    }
    function buildResults(){
      var liked=state.liked;
      var board=document.getElementById('sq-board');
      var empty=document.getElementById('sq-results').querySelector('.res-empty');
      if(empty) empty.parentNode.removeChild(empty);
      board.innerHTML='';

      // sq-shopAll no longer links anywhere - it adds the bundle product to
      // cart directly (see doShopAllATC below). Just refresh its label and
      // clear any stale error from a previous attempt.
      var shopAllLabel=document.querySelector('#sq-shopAll .btn-shopall__label');
      if(shopAllLabel){
    shopAllLabel.textContent = liked.length
      ? 'Bygg mitt bundle ('+Math.min(liked.length,6)+' av 6 valda)'
      : 'Bygg mitt bundle med 6 dofter';
      }
      hideShopAllError();

      document.getElementById('sq-boardCnt').textContent = liked.length + (liked.length===1?' doft':' dofter');

      if(liked.length===0){
    document.getElementById('sq-resTitle').textContent="Hittade du ingen match?";
    document.getElementById('sq-resSub').textContent="Ingen fara. Bläddra bland alla dofter nedan eller kör en runda till.";
    var bt=root.querySelector('.board-title'); if(bt) bt.style.display='none';
    var e=document.createElement('div'); e.className='res-empty';
    e.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-6.7-4.35-9.33-8.24C.9 10.02 1.9 6.5 5.1 5.66c1.98-.52 3.9.37 4.9 1.98C11 6.03 12.92 5.14 14.9 5.66c3.2.84 4.2 4.36 2.43 7.1C18.7 16.65 12 21 12 21z"/></svg><h3>Inget sparat ännu</h3><p>Alla är olika. Utforska hela kollektionen och hitta din doft.</p>';
    board.parentNode.insertBefore(e, board);
    return;
      }
      var bt=root.querySelector('.board-title'); if(bt) bt.style.display='';
      document.getElementById('sq-resTitle').textContent = liked.length===1 ? "Din perfekta match" : "Ditt doftboard";

      for(var i=0;i<liked.length;i++){
    var th=liked[i];
    var a=document.createElement('div');
    a.className='bcard'; a.dataset.scent=th.name;
    a.innerHTML=
      '<div class="bimg"><span class="dot" style="background:'+th.accent+'"></span><img src="'+imgSrc(th,0)+'" alt="'+th.name+'" loading="lazy"></div>'+
      '<div class="bbody"><div class="bname">'+th.name+'</div></div>';
    board.appendChild(a);
      }
    }

    /* ---------------- Shop-all: add bundle product to cart + checkout ----------------
       Triggered by sq-shopAll. Adds the merchant-selected bundle product
       (BUNDLE_PRODUCT_VARIANT_ID) to the cart with the visitor's picks
       recorded as line item properties, then sends them straight to
       checkout - no redirect to another product/page. */
    function buildBundleProperties(){
      var liked = state.liked;
      var properties = {
        "_bundle_items": liked.map(function(s){ return s.variantId; }).join(',')
      };
      liked.forEach(function(scent, index){
    properties['Bottle ' + (index + 1)] = scent.desc
      ? scent.name + ' Inspired by ' + scent.desc
      : scent.name;
      });
      return properties;
    }
    function shopAllError(){ return document.getElementById('sq-shopAllError'); }
    function showShopAllError(msg){
      var el = shopAllError(); if(!el) return;
      el.textContent = msg;
      el.hidden = false;
    }
    function hideShopAllError(){
      var el = shopAllError(); if(!el) return;
      el.hidden = true;
    }
    var shopAllBusy = false;
    function setShopAllLoading(isLoading){
      var btn = document.getElementById('sq-shopAll'); if(!btn) return;
      btn.classList.toggle('is-loading', isLoading);
      btn.setAttribute('aria-busy', isLoading ? 'true' : 'false');
      var spinner = btn.querySelector('.btn-shopall__spinner');
      if(spinner) spinner.classList.toggle('hidden', !isLoading);
    }
    function doShopAllATC(){
      if(shopAllBusy) return;
      hideShopAllError();
      if(!BUNDLE_PRODUCT_VARIANT_ID){
    showShopAllError('Bundle product not set up yet - select a product under Theme settings.');
    return;
      }
      if(!state.liked.length){
    showShopAllError('Spara minst en doft innan du bygger ditt bundle.');
    return;
      }
      shopAllBusy = true;
      setShopAllLoading(true);

      /* Safety net: if /cart/add.js never resolves (dropped connection,
         stalled request), don't leave the button spinning forever - abort
         and fall back to the normal state after ATC_TIMEOUT_MS. */
      var ATC_TIMEOUT_MS = 10000;
      var controller = (typeof AbortController!=='undefined') ? new AbortController() : null;
      var timedOut = false;
      var timeoutId = setTimeout(function(){
    timedOut = true;
    if(controller) controller.abort();
      }, ATC_TIMEOUT_MS);

      fetch('/cart/add.js', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items: [{
        id: BUNDLE_PRODUCT_VARIANT_ID,
        quantity: 1,
        properties: buildBundleProperties()
      }]
    }),
    signal: controller ? controller.signal : undefined
      })
      .then(function(response){
    if(!response.ok){
      return response.json().then(function(data){
        throw new Error((data && data.description) || 'Network response was not ok');
      });
    }
    return response.json();
      })
      .then(function(){
    clearTimeout(timeoutId);
    window.location.href = '/checkout';
      })
      .catch(function(err){
    clearTimeout(timeoutId);
    try{ console.error('[scent quiz] Add to cart failed', err); }catch(e){}
    showShopAllError(timedOut ? 'Det tog för lång tid, försök igen.' : 'Något gick fel, försök igen.');
    setShopAllLoading(false);
    shopAllBusy = false;
      });
    }

    /* ---------------- Email capture (Klaviyo) ---------------- */
    function validEmail(v){ return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }
    document.getElementById('sq-leadForm').addEventListener('submit', function(e){
      e.preventDefault();
      var submitBtn=document.getElementById('sq-leadSubmitBtn');
      if(submitBtn.disabled) return; // request already in flight
      var input=document.getElementById('sq-emailInput');
      var email=input.value.trim();
      if(!validEmail(email)){ input.classList.add('err'); input.focus(); return; }
      input.classList.remove('err');
      var likedNames=state.liked.map(function(t){return t.name;});
      submitLead(email, likedNames);
    });

    function showLeadSuccess(){
      document.getElementById('sq-leadForm').style.display='none';
      document.getElementById('sq-leadSuccess').classList.add('show');
      vibrate([10,40,10]);
    }

    function setLeadSubmitting(isSubmitting){
      var btn=document.getElementById('sq-leadSubmitBtn');
      var label=document.getElementById('sq-leadSubmitLabel');
      btn.disabled=isSubmitting;
      label.textContent=isSubmitting ? 'Skickar...' : 'Skicka mitt board';
    }

    function submitLead(email, likedScents){
      var prefill=bundleLink();
      track('email_submit', {saved:likedScents.length, scents:likedScents.join(', '), bundle_url:prefill});

      if(!KLAVIYO_CONFIG.enabled){
    // Klaviyo isn't configured in theme settings yet - preview the success
    // state without sending the email anywhere.
    showLeadSuccess();
    return;
      }

      setLeadSubmitting(true);

      fetch('https://a.klaviyo.com/client/subscriptions/?company_id='+encodeURIComponent(KLAVIYO_CONFIG.publicApiKey), {
    method:'POST',
    headers:{'Content-Type':'application/json','revision':'2024-10-15'},
    body: JSON.stringify({ data:{ type:'subscription',
      attributes:{
        profile:{ data:{ type:'profile', attributes:{ email:email,
          properties:{ scent_match_scents: likedScents, scent_match_bundle_url: prefill } } } },
        custom_source:'Scent Match'
      },
      relationships:{ list:{ data:{ type:'list', id:KLAVIYO_CONFIG.listId } } }
    }})
      }).then(function(res){
    // Klaviyo's subscribe endpoint returns 202 Accepted with no body.
    if(!res.ok && res.status!==202){ throw new Error('Klaviyo request failed: '+res.status); }
    setLeadSubmitting(false);
    showLeadSuccess();
      }).catch(function(err){
    try{ console.error('[scent quiz] Klaviyo subscribe failed', err); }catch(e){}
    setLeadSubmitting(false);
    toast('Något gick fel, försök igen');
      });
    }

    /* ---------------- Wire up controls ---------------- */
    document.getElementById('sq-startBtn').addEventListener('click', function(){
      track('start', {total:TOTAL});
      document.getElementById('sq-deck-screen').classList.remove('swiped');
      renderDeck();
      show('sq-deck-screen');
      updateSeeMatches();
      setTimeout(showCoach, 500);
    });
    document.getElementById('sq-loveBtn').addEventListener('click', function(){ var c=topCard(); if(c) commitSwipe(c,1); });
    document.getElementById('sq-skipBtn').addEventListener('click', function(){ var c=topCard(); if(c) commitSwipe(c,-1); });
    document.getElementById('sq-undoBtn').addEventListener('click', undo);
    document.getElementById('sq-seeMatches').addEventListener('click', function(){ finish('early'); });
    document.getElementById('sq-retakeBtn').addEventListener('click', function(){
      track('retake', {});
      state={pos:0, liked:[], history:[]}; coachShown=false;
      document.getElementById('sq-deck-screen').classList.remove('swiped');
      document.getElementById('sq-countNum').textContent='0';
      document.getElementById('sq-undoBtn').disabled=true;
      document.getElementById('sq-seeMatches').hidden=true;
      document.getElementById('sq-leadForm').style.display='';
      document.getElementById('sq-leadSuccess').classList.remove('show');
      document.getElementById('sq-emailInput').value='';
      document.getElementById('sq-emailInput').classList.remove('err');
      setLeadSubmitting(false);
      renderDeck();
      show('sq-deck-screen');
      updateSeeMatches();
      setTimeout(showCoach, 500);
    });
    document.getElementById('sq-shopAll').addEventListener('click', function(e){
      e.preventDefault();
      track('shop_click', {where:'browse_all'});
      doShopAllATC();
    });
    /* ---------------- Popup open/close + trigger ---------------- */
    var overlay = root;
    var fab = document.getElementById('scent-quiz-fab');
    var closeBtn = document.getElementById('sq-close');
    var cfg = window.SQ_QUIZ_CONFIG || {};

    /* No collection picked (or it has zero products): nothing to swipe
       through. The trigger button stays visible as normal, but clicking it
       shows a small notice instead of opening an empty popup - see
       showFabNotice(), used from openPopup() below. */
    var fabNotice = null;
    var fabNoticeTimer = null;
    function showFabNotice(msg){
      if(!fab) return;
      if(!fabNotice){
    fabNotice = document.createElement('div');
    fabNotice.className = 'sq-fab-notice';
    var posClass = Array.prototype.filter.call(fab.classList, function(c){ return c.indexOf('sq-fab--') === 0; })[0];
    if(posClass) fabNotice.classList.add('sq-fab-notice--' + posClass.replace('sq-fab--', ''));
    fab.parentNode.insertBefore(fabNotice, fab);
      }
      fabNotice.textContent = msg;
      fabNotice.classList.add('sq-show');
      if(fabNoticeTimer) clearTimeout(fabNoticeTimer);
      fabNoticeTimer = setTimeout(function(){ fabNotice.classList.remove('sq-show'); }, 4000);
    }

    /* Fraunces/Nunito Sans are only used inside the popup, so the
       stylesheet is fetched on demand instead of on every page load -
       warmed on hover/focus of the trigger button, guaranteed before the
       popup itself first opens (manually or auto). */
    var fontsRequested=false;
    function ensureFontsLoaded(){
      if(fontsRequested) return;
      fontsRequested=true;
      var link=document.createElement('link');
      link.rel='stylesheet';
      link.href='https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Nunito+Sans:wght@400;600;700&display=swap';
      document.head.appendChild(link);
    }
    if(fab){
      fab.addEventListener('pointerenter', ensureFontsLoaded, {once:true});
      fab.addEventListener('focus', ensureFontsLoaded, {once:true});
    }

    function openPopup(source){
      if(!HAS_SCENTS){
    showFabNotice('Quiz not set up yet — select a scent collection in Theme settings.');
    try{ console.warn('[scent quiz] No scents to show - select a collection under Theme settings > Scent Quiz > Scents.'); }catch(e){}
    return;
      }
      ensureFontsLoaded();
      buildIntroPreview();
      overlay.hidden = false;
      requestAnimationFrame(function(){ overlay.classList.add('sq-open'); });
      document.documentElement.classList.add('sq-scroll-lock');
      document.body.classList.add('sq-scroll-lock');
      track('popup_open', {source:source||'unknown'});
      if(closeBtn) closeBtn.focus();
    }
    function closePopup(){
      if(overlay.hidden) return;
      overlay.classList.remove('sq-open');
      document.documentElement.classList.remove('sq-scroll-lock');
      document.body.classList.remove('sq-scroll-lock');
      track('popup_close', {});
      setTimeout(function(){ overlay.hidden = true; }, 300);
    }

    if(fab) fab.addEventListener('click', function(){ openPopup('fab'); });
    if(closeBtn) closeBtn.addEventListener('click', closePopup);
    document.addEventListener('keydown', function(e){
      if(e.key==='Escape' && overlay.classList.contains('sq-open')) closePopup();
    });

    /* Auto-open, respecting the merchant's frequency setting. Skipped entirely
       inside the theme editor so it never interrupts a merchant who's editing
       an unrelated section. */
    var delay = parseInt(cfg.autoOpenDelay, 10) || 0;
    if(delay > 0 && HAS_SCENTS && !(window.Shopify && window.Shopify.designMode)){
      var STORE_KEY = 'sq_quiz_last_seen';
      function seenRecently(){
    try{
      if(cfg.frequency==='every_visit') return false;
      if(cfg.frequency==='once_per_session') return sessionStorage.getItem(STORE_KEY)==='1';
      if(cfg.frequency==='once_ever') return localStorage.getItem(STORE_KEY)==='1';
      if(cfg.frequency==='once_per_day'){
        var last=parseInt(localStorage.getItem(STORE_KEY)||'0',10);
        return (Date.now()-last) < 86400000;
      }
    }catch(e){ /* storage unavailable (private mode etc.) - just don't auto-open twice this pageview */ }
    return false;
      }
      function markSeen(){
    try{
      if(cfg.frequency==='once_per_session') sessionStorage.setItem(STORE_KEY,'1');
      else if(cfg.frequency==='once_ever') localStorage.setItem(STORE_KEY,'1');
      else if(cfg.frequency==='once_per_day') localStorage.setItem(STORE_KEY,String(Date.now()));
    }catch(e){}
      }
      if(!seenRecently()){
    setTimeout(function(){
      if(overlay.hidden){ openPopup('auto'); markSeen(); }
    }, delay*1000);
      }
    }

    })();
