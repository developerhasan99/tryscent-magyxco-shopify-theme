(function(){
  const section = document.getElementById('scratch-section');
  if(!section) return;

  // Counter logic (bottles left)
  const numEl = document.getElementById('bottles-left');
  const storeKey = section.dataset.storeKey || 'scratch_bottles_v1';
  const storeEndKey = storeKey + '_end';
  function rand(min, max){ return Math.floor(Math.random()*(max-min+1))+min; }

  // Bottles logic: start 150, go down to 15 over ~2 minutes, decrement 1-4 each tick
  const COUNTER_START = 150;
  const COUNTER_TARGET = 15;
  const TOTAL_MS = 120000; // 2 min
  const TICK_BASE = 3000; // 3s base
  const TICK_JITTER = 800; // +/- jitter

  let current = Number(localStorage.getItem(storeKey));
  let endTime = Number(localStorage.getItem(storeEndKey));
  const nowInit = Date.now();
  const invalidCurrent = !current || Number.isNaN(current) || current <= COUNTER_TARGET || current > COUNTER_START;
  const expired = !endTime || Number.isNaN(endTime) || endTime <= nowInit;
  if(invalidCurrent || expired){
    current = COUNTER_START;
    endTime = nowInit + TOTAL_MS;
    localStorage.setItem(storeKey, String(current));
    localStorage.setItem(storeEndKey, String(endTime));
  }
  function updateCounter(){ if(numEl) numEl.textContent = String(current); }
  updateCounter();

  function scheduleTick(){
    const now = Date.now();
    const remainMs = endTime - now;
    if(remainMs <= 0 || current <= COUNTER_TARGET){
      current = COUNTER_TARGET;
      localStorage.setItem(storeKey, String(current));
      return updateCounter();
    }
    const ticksLeft = Math.max(1, Math.ceil(remainMs / TICK_BASE));
    const decNeeded = current - COUNTER_TARGET;
    let step = rand(1,4);
    const minAvg = Math.ceil(decNeeded / ticksLeft);
    if(minAvg > step) step = Math.min(4, minAvg);
    step = Math.min(step, decNeeded);
    current -= step;
    localStorage.setItem(storeKey, String(current));
    updateCounter();
    const nextDelay = Math.max(800, TICK_BASE + rand(-TICK_JITTER, TICK_JITTER));
    setTimeout(scheduleTick, nextDelay);
  }
  setTimeout(scheduleTick, 1200);

  // Scratch card
  const canvas = document.getElementById('scratch-canvas');
  const label = document.getElementById('scratch-label');
  const prize = document.getElementById('scratch-prize');
  const cta = document.getElementById('scratch-cta');
  const ctx = canvas.getContext('2d');
  // Offscreen mask to compute reveal safely (no CORS taint)
  const maskCanvas = document.createElement('canvas');
  const maskCtx = maskCanvas.getContext('2d');
  let isDown = false;
  let revealed = false;

  function resize(){
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width; canvas.height = rect.height;
    maskCanvas.width = rect.width; maskCanvas.height = rect.height;
    // ensure prize is hidden until cover is drawn
    prize.hidden = true;
    drawCover(() => { renderPrize(); });
  }

  // Preload cover image before first paint if requested
  (function preload(){
    const cover = section.getAttribute('data-cover');
    const want = section.getAttribute('data-cover-preload') === 'true';
    if(!want || !cover) return;
    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = 'image';
    link.href = cover;
    document.head.appendChild(link);
  })();

  function renderPrize(){
    // show prize layer only after cover was drawn (with tiny delay safeguard)
    setTimeout(() => { prize.hidden = false; }, 1);
  }

  // Force prize element to be visually hidden until cover is drawn
  prize.style.visibility = 'hidden';

  function drawCover(after){
    const w = canvas.width, h = canvas.height;
    ctx.globalCompositeOperation = 'source-over';

    // 1) draw sync placeholder cover immediately (ensures cover visible before anything else)
    const grad = ctx.createLinearGradient(0,0,w,h);
    grad.addColorStop(0,'#e6c679');
    grad.addColorStop(1,'#b89549');
    ctx.fillStyle = grad; ctx.fillRect(0,0,w,h);
    ctx.strokeStyle = 'rgba(255,255,255,.12)';
    for(let i=0;i<8;i++){ ctx.beginPath(); ctx.moveTo(0,i*h/8); ctx.lineTo(w,i*h/8); ctx.stroke(); }
    ready();

    // 2) asynchronously replace placeholder with the real cover image (if provided)
    const cover = section.getAttribute('data-cover');
    if(cover){
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = ()=>{ ctx.globalCompositeOperation = 'source-over'; ctx.drawImage(img, 0, 0, w, h); if(typeof after==='function') setTimeout(() => { prize.style.visibility = 'visible'; after(); }, 1); };
      img.src = cover;
    } else {
      if(typeof after==='function') setTimeout(() => { prize.style.visibility = 'visible'; after(); }, 1);
    }
  }

  function ready(){
    // Remove initial white overlay once placeholder cover is drawn
    const loader = document.getElementById('scratch-loader');
    if(loader){ loader.style.opacity = '0'; setTimeout(()=>loader.remove(), 150); }
  }

  function scratch(x,y){
    const r = Math.max(39, Math.floor(canvas.width * 0.055) - 5);
    const drawDot = (dx,dy, context)=>{
      context.beginPath();
      context.arc(dx,dy,r,0,Math.PI*2);
      context.fill();
    };
    // draw into on-screen canvas (destination-out) and into mask (opaque)
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = '#000';
    drawDot(x,y, ctx);
    maskCtx.fillStyle = '#000';
    drawDot(x,y, maskCtx);
    if(scratch.prev){
      const dist = Math.hypot(x-scratch.prev.x, y-scratch.prev.y);
      const step = r*0.45;
      const count = Math.max(1, Math.floor(dist/step));
      for(let i=1;i<=count;i++){
        const xi = scratch.prev.x + (x - scratch.prev.x)*i/count;
        const yi = scratch.prev.y + (y - scratch.prev.y)*i/count;
        ctx.globalCompositeOperation = 'destination-out';
        drawDot(xi,yi, ctx);
        maskCtx.fillStyle = '#000';
        drawDot(xi,yi, maskCtx);
      }
    }
    scratch.prev = {x,y};
  }

  canvas.addEventListener('mousedown', e=>{ isDown=true; scratch.prev=null; scratch(...Object.values(getPos(e))); });
  canvas.addEventListener('mousemove', e=>{ if(isDown){ scratch(...Object.values(getPos(e))); if(percentRevealed()>55) finish(); }});
  window.addEventListener('mouseup', ()=> { isDown=false; scratch.prev=null; });
  canvas.addEventListener('touchstart', e=>{ isDown=true; scratch.prev=null; scratch(...Object.values(getPos(e))); e.preventDefault(); }, {passive:false});
  canvas.addEventListener('touchmove', e=>{ if(isDown){ scratch(...Object.values(getPos(e))); if(percentRevealed()>55) finish(); } e.preventDefault(); }, {passive:false});
  window.addEventListener('touchend', ()=> { isDown=false; scratch.prev=null; });

  function getPos(e){
    const r = canvas.getBoundingClientRect();
    const t = e.touches? e.touches[0]: e;
    return { x: t.clientX - r.left, y: t.clientY - r.top };
  }

  function percentRevealed(){
    try{
      const img = maskCtx.getImageData(0,0,maskCanvas.width,maskCanvas.height);
      let cleared = 0; for(let i=3;i<img.data.length;i+=4){ if(img.data[i]!==0) cleared++; }
      return cleared / (maskCanvas.width*maskCanvas.height) * 100;
    }catch(_e){
      // fallback if any issue
      return 0;
    }
  }

  function finish(){
    if(revealed) return; revealed = true;
    // full clear
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = '#000';
    ctx.fillRect(0,0,canvas.width,canvas.height);
    canvas.style.pointerEvents = 'none';
    if(label) label.hidden = true;
    prize.hidden = false;
    if(cta){ cta.classList.add('active'); }
    const counter = document.querySelector('.scratch__counter');
    if(counter) counter.classList.add('active');
    try { launchConfetti(); } catch(_e) {}
  }

  // lightweight confetti
  function launchConfetti(){
    const duration = 1500; const end = Date.now()+duration; const colors=['#ff4757','#ffa502','#2ed573','#1e90ff','#5352ed'];
    (function frame(){
      for(let i=0;i<14;i++) confettiPiece();
      if(Date.now()<end) requestAnimationFrame(frame);
    })();
    // Fireworks bursts at random positions (guard against multiple fires)
    const root = document.getElementById('scratch-fireworks') || document.body;
    if(!root.dataset.fired){
      root.dataset.fired = '1';
      for(let i=0;i<6;i++) setTimeout(()=>burst(), i*180);
      setTimeout(()=>burst(window.innerWidth/2, window.innerHeight*0.4), 80);
      setTimeout(()=> delete root.dataset.fired, 1800);
    }

    function confettiPiece(){
      const div = document.createElement('div');
      div.style.position='fixed'; div.style.top='-10px'; div.style.left=Math.random()*100+'%';
      div.style.width='6px'; div.style.height='10px'; div.style.background=colors[Math.floor(Math.random()*colors.length)];
      div.style.opacity='0.9'; div.style.transform='rotate('+ (Math.random()*360)+'deg)'; div.style.zIndex='9999';
      document.body.appendChild(div);
      const fall = 1200 + Math.random()*800; const drift = (Math.random()*2-1)*120;
      div.animate([{transform:div.style.transform, top:'-10px'},{transform:'rotate(720deg)', top:'110vh', left:`calc(${div.style.left} + ${drift}px)`}],{duration:fall, easing:'cubic-bezier(.2,.7,.2,1)'}).onfinish=()=>div.remove();
    }

    function burst(cx, cy){
      const root = document.getElementById('scratch-fireworks') || document.body;
      if(typeof cx!=='number') cx = Math.random()*window.innerWidth;
      if(typeof cy!=='number') cy = Math.random()*window.innerHeight*0.5 + window.innerHeight*0.1;
      const particles = 26;
      for(let i=0;i<particles;i++){
        const dot = document.createElement('div');
        dot.style.position='absolute'; dot.style.left=cx+'px'; dot.style.top=cy+'px';
        dot.style.width='6px'; dot.style.height='6px'; dot.style.borderRadius='50%';
        dot.style.background=colors[Math.floor(Math.random()*colors.length)];
        dot.style.zIndex='1';
        root.appendChild(dot);
        const ang = (Math.PI*2) * (i/particles);
        const dist = 80 + Math.random()*60;
        const x2 = cx + Math.cos(ang)*dist;
        const y2 = cy + Math.sin(ang)*dist;
        dot.animate([
          { transform:'translate(0,0) scale(0.6)', opacity:1, offset:0},
          { transform:'translate('+(x2-cx)+'px,'+(y2-cy)+'px) scale(1)', opacity:1, offset:0.7},
          { transform:'translate('+(x2-cx)+'px,'+(y2-cy)+'px) scale(0.2)', opacity:0, offset:1}
        ], { duration:900 + Math.random()*400, easing:'cubic-bezier(.2,.7,.2,1)' }).onfinish=()=>dot.remove();
      }
    }
  }

  window.addEventListener('resize', resize); resize();

  // CTA click navigation
  if(cta){
    cta.addEventListener('click', function(e){
      e.preventDefault();
      const cfgLink = 'https://tryscent.co/pages/build-your-bundle-prize';
      const openNew = section.getAttribute('data-cta-new-tab') === 'true';
      try {
        if(openNew) window.open(cfgLink, '_blank'); else window.location.assign(cfgLink);
      } catch(_e){ window.location.href = cfgLink; }
    });
  }
})(); 