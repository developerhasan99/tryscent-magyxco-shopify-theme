(() => {
  if (window.fuel05UgcReady) return;
  window.fuel05UgcReady = true;

  // QA and preview reveal. On any theme that is not the live one, adding #f05 to
  // the address turns the variant on so the test can be checked without running
  // Intelligems, and #f05-off turns it off again. Shopify.theme.role is 'main'
  // on the live theme, so this can never fire there. The hash is read again on
  // every hashchange, because typing #f05 into the bar of a page that is already
  // open never reloads it.
  //
  // The switch only ever adds the class on #f05 and removes it on #f05-off. It
  // must not toggle on every other address, because the testing tool's preview
  // puts the same class on the page without any hash, and a toggle would take
  // that straight back off on any theme that is not the live one.
  if (window.Shopify && Shopify.theme && Shopify.theme.role !== 'main') {
    const applyHashReveal = () => {
      if (window.location.hash === '#f05') {
        document.documentElement.classList.add('ab-f05-ugc');
      } else if (window.location.hash === '#f05-off') {
        document.documentElement.classList.remove('ab-f05-ugc');
      }
    };

    applyHashReveal();
    window.addEventListener('hashchange', applyHashReveal);

    // Intelligems' removeViewQueryParam() drops ?view= from the address bar at
    // startup, so the history entry for the collection page points at the
    // default collection template, which carries none of this markup. Back and
    // reload then show a page with no tiles. Preview themes only, QA hash only.
    const keepView = () => {
      if (window.location.hash !== '#f05') return;
      if (!document.querySelector('.fuel05-ugc--grid')) return;
      if (/[?&]view=/.test(window.location.search)) return;
      const url = new URL(window.location.href);
      url.searchParams.set('view', 'collection-lander-v1');
      history.replaceState(history.state, '', url.toString());
    };
    window.addEventListener('load', keepView);
    window.addEventListener('pagehide', keepView);
  }

  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)');

  // A tap is the one moment somebody is actively waiting, so the tapped clip
  // gets the connection to itself: the background warm-up parks its chains
  // and clips that were mid-warm-up are paused with whatever they buffered
  // kept. The hold lasts until the tapped clip is fully downloaded, paused,
  // ended, or broken, and the parked chains then pick up where they stopped.
  // Not until canplaythrough, and with no timer: both were tried, and both
  // release while the clip is still streaming. canplaythrough is only the
  // browser's guess that the rest will arrive in time, and on the kind of
  // connection where the hold matters the guess is wrong, so the resumed
  // warm-up re-starved the playing clip: a few seconds of playback, then a
  // long stall to rebuffer. Fully buffered is a fact, not a guess. A clip
  // already fully buffered takes no hold at all.
  let warmHoldVideo = null;
  const parkedWarmChains = [];
  const fullyBuffered = (video) => {
    const ranges = video.buffered;
    return ranges.length > 0 && video.duration > 0 && ranges.end(ranges.length - 1) >= video.duration - 0.5;
  };
  const releaseWarmHold = (video) => {
    if (warmHoldVideo !== video) return;
    warmHoldVideo = null;
    while (parkedWarmChains.length) parkedWarmChains.shift()();
  };
  const holdWarmsFor = (video) => {
    if (fullyBuffered(video)) return;
    warmHoldVideo = video;
    const onProgress = () => {
      if (fullyBuffered(video)) release();
    };
    const release = () => {
      video.removeEventListener('progress', onProgress);
      releaseWarmHold(video);
    };
    video.addEventListener('pause', release, { once: true });
    video.addEventListener('ended', release, { once: true });
    video.addEventListener('error', release, { once: true });
    video.addEventListener('progress', onProgress);
  };

  // One clip runs at a time, page wide. Every play goes through here, so the
  // rule holds whether the clip was tapped or scrolled into view, and so does
  // the sound rule: the second argument is set on the clip right before it
  // starts, and scrolling always passes false. A clip can only ever come up
  // with sound from a tap, which is what browsers allow.
  const playOnly = (video, withSound) => {
    // The hold moves to the new clip before the old one is paused below, so
    // the old clip's pause release finds the hold already re-owned and the
    // chains never get a burst between two taps.
    if (withSound) holdWarmsFor(video);
    document.querySelectorAll('video.fuel05-ugc__video').forEach((other) => {
      if (other === video) return;
      // On a muted start a clip mid-warm-up is left alone: it is muted, it
      // pauses itself on its first frame, and pausing it here would, on iOS,
      // stop it buffering. On a tap the trade flips, and warming clips are
      // paused too so their fetches stop competing with the clip somebody
      // is waiting on.
      if (other.dataset.fuel05Warming !== 'true' || withSound) other.pause();
      // Paused is not enough on a tap: Chrome keeps an already-started
      // download running to the end of the file, and measured on a slow
      // line those leftovers took nearly the whole connection while the
      // tapped clip crawled. So a tap tears the others down: preload none
      // first so the reset does not immediately refetch, then load() to
      // abort the stream. Only muted clips, so the one somebody watched
      // keeps its frame and its buffer; only loading ones, so settled
      // buffers stay. The card gets its poster back because the reset
      // blanks the element, and the warm flag clears so the clip can warm
      // again once the line is free.
      if (withSound && other.muted && other.networkState === 2 && !fullyBuffered(other)) {
        other.preload = 'none';
        other.load();
        delete other.dataset.fuel05Warm;
        const tile = other.closest('.fuel05-ugc__tile');
        if (tile) tile.classList.remove('fuel05-ugc__tile--started');
        // holdPoster runs once per clip by its own stamp, and its frame
        // callback has already fired, so the stamp comes off to arm a fresh
        // one; without this the poster would sit over the clip for good the
        // next time it plays.
        delete other.dataset.fuel05Poster;
        holdPoster(other);
      }
    });
    // A real start outranks the warm-up below: without this line the warm-up's
    // first-frame handler would pause the clip the shopper just asked for.
    delete video.dataset.fuel05Warming;
    video.muted = !withSound;
    video.play().catch(() => {});
  };

  // A tap turns the sound on. The clips are people talking, so a silent one is
  // pointless, and a tap is the gesture the browser wants before it lets audio
  // through. First tap on a silent clip, running or not, unmutes it and keeps
  // it running. After that it is a plain play and pause, sound still on.
  const toggleTile = (tile) => {
    const video = tile.querySelector('video.fuel05-ugc__video');
    if (!video) return;
    if (video.muted || video.paused) {
      playOnly(video, true);
    } else if (video.readyState >= 2 || video.currentTime > 0) {
      video.pause();
    }
    // A clip that is "playing" but has produced no frame yet is still
    // fetching, and paused reads false the moment play() is called. Without
    // the guard above, the natural second tap of somebody waiting on a slow
    // connection cancelled the start they had just asked for, which read as
    // "tap twice to play". While it loads, a tap does nothing.
  };

  const tileFromEvent = (event) => {
    const target = event.target;
    if (!target || typeof target.closest !== 'function') return null;
    const tile = target.closest('.fuel05-ugc__tile');
    if (!tile || target.closest('a')) return null;
    return tile;
  };

  document.addEventListener('click', (event) => {
    const tile = tileFromEvent(event);
    if (tile) toggleTile(tile);
  });

  // Keyboard parity with the click handler. The tile carries tabindex="0", so
  // Enter and Space play and pause it the same way a tap does.
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'Spacebar') return;
    const tile = tileFromEvent(event);
    if (!tile) return;
    event.preventDefault();
    toggleTile(tile);
  });

  // The store's Klaviyo "10% RABATT" form leaves its container in the page
  // after a shopper closes it, and on Roi's devices the leftover kept sitting
  // over everything with pointer-events on: a tap on an arrow or a card hit a
  // kl div instead of ours, and the body kept Klaviyo's scroll lock. The form
  // is not ours to configure, so the row defends itself and stops the dead
  // leftover taking hits. Variant only, and the class is read when the event
  // fires because this file loads in both arms.
  const KL_SELECTOR = '[class*="kl-private-reset-css"]';

  const klaviyoShowsForm = (root) =>
    [...root.querySelectorAll('form.klaviyo-form')].some((form) => form.getClientRects().length > 0);

  const klaviyoCoversViewport = (el) => {
    const rect = el.getBoundingClientRect();
    return rect.width >= window.innerWidth * 0.9 && rect.height >= window.innerHeight * 0.9;
  };

  // The container, and anything left inside it still covering the viewport.
  // Both, not just the container: pointer-events inherits only until something
  // declares its own, and the node sitting over the page declares auto.
  const klaviyoResidue = () => {
    const dead = new Set();
    document.querySelectorAll(KL_SELECTOR).forEach((root) => {
      // Outermost container per form only.
      if (root.parentElement && root.parentElement.closest(KL_SELECTOR)) return;
      // A form still on screen wants its own clicks, embedded ones included.
      if (klaviyoShowsForm(root)) return;
      // And only where something big enough to swallow a tap is left. A teaser
      // tab or an inline signup box is small and stays live.
      const blockers = [root, ...root.querySelectorAll('*')].filter(klaviyoCoversViewport);
      if (!blockers.length) return;
      dead.add(root);
      blockers.forEach((el) => dead.add(el));
    });
    return dead;
  };

  const muteKlaviyoResidue = () => {
    if (!document.documentElement.classList.contains('ab-f05-ugc')) return;
    klaviyoResidue().forEach((el) => {
      el.dataset.fuel05KlMuted = 'true';
      el.style.pointerEvents = 'none';
    });
    // Klaviyo holds the page still with this class while a form is open, and
    // it has been seen to leave it on. Nothing is on screen here, so it goes.
    if (!klaviyoShowsForm(document)) {
      document.body.classList.remove('klaviyo-prevent-body-scrolling');
    }
  };

  const unmuteKlaviyo = () => {
    document.querySelectorAll('[data-fuel05-kl-muted]').forEach((el) => {
      delete el.dataset.fuel05KlMuted;
      el.style.pointerEvents = '';
    });
  };

  window.addEventListener('klaviyoForms', (event) => {
    const type = (event.detail && event.detail.type) || '';
    if (type === 'close' || type === 'embedClose' || type === 'submit') {
      muteKlaviyoResidue();
      // Klaviyo fades the form out, so the first pass can still see it on
      // screen and skip the container. One deferred retry, not a poll.
      setTimeout(muteKlaviyoResidue, 500);
    } else {
      unmuteKlaviyo();
    }
  });

  // The clip a shopper tapped for sound keeps the playhead. Ratios are written
  // by the row observers below, so a clip in a row that has not armed yet
  // reads as not visible, exactly as it did before this existed.
  const visibleRatio = new WeakMap();

  const engagedVideo = () =>
    [...document.querySelectorAll('video.fuel05-ugc__video')].find(
      (video) => !video.muted && !video.paused && (visibleRatio.get(video) || 0) >= 0.5
    ) || null;

  // The poster overlay comes off exactly when the clip has really put a frame
  // on screen, and never goes back on. iOS Safari throws the poster attribute
  // away as soon as play() is called, and with preload="none" there is nothing
  // decoded to replace it, so the card fell back to its own grey for the fetch
  // and decode: the flash, then the blank, then the video. Holding a plain
  // image over the video instead keeps that frame painted for the whole gap.
  const holdPoster = (video) => {
    if (video.dataset.fuel05Poster === 'true') return;
    video.dataset.fuel05Poster = 'true';

    const tile = video.closest('.fuel05-ugc__tile');
    const overlay = tile && tile.querySelector('.fuel05-ugc__poster');
    // A clip with no poster to hold renders no overlay and asks for metadata
    // instead, so the browser paints its own first frame and there is no gap.
    if (!overlay) return;

    const started = () => tile.classList.add('fuel05-ugc__tile--started');

    // The frame callback is the only thing that reports a frame presented to
    // the screen rather than a state the element has reached, and Safari, the
    // browser this was reported on, has it. It fires once, which is all we
    // want, so nothing has to be taken off again.
    if (typeof video.requestVideoFrameCallback === 'function') {
      video.requestVideoFrameCallback(started);
      return;
    }

    // Without it: playing and timeupdate both say playback is running, and
    // readyState says whether the position being played has data behind it,
    // which is as close to "a frame exists" as the events get. Either event
    // can be the first to arrive with data, so both are listened for and the
    // pair comes off together.
    const onFrame = () => {
      if (video.readyState < 2) return;
      video.removeEventListener('playing', onFrame);
      video.removeEventListener('timeupdate', onFrame);
      started();
    };
    video.addEventListener('playing', onFrame);
    video.addEventListener('timeupdate', onFrame);
  };

  const initRow = (root) => {
    if (root.dataset.fuel05Init === 'true') return;
    root.dataset.fuel05Init = 'true';

    const slider = root.querySelector('.fuel05-ugc__slider');
    if (slider && window.Swiper) {
      const gapMobile = Number(root.dataset.gapMobile ?? 10);
      const gapDesktop = Number(root.dataset.gapDesktop ?? 32);
      new Swiper(slider, {
        slidesPerView: 'auto',
        spaceBetween: gapMobile,
        watchOverflow: true,
        // The a11y module jumps the row to any slide whose focus it cannot
        // prove is already on screen, and it can only prove it when visible
        // slides are tracked. Without this, a tap that focuses a card (the
        // tiles are buttons) snapped the row one card over and the observer
        // then started the newly revealed clip muted: tap the second card,
        // watch the third slide in and play. Guarded only by a frame-timing
        // race on Safari, so real fingers hit it and clean automated taps do
        // not. Tracking visibility makes the guard deterministic, and focus
        // from the keyboard still brings a genuinely off-screen card into
        // view, which is the part worth keeping.
        watchSlidesProgress: true,
        navigation: {
          prevEl: root.querySelector('.fuel05-ugc__arrow--prev'),
          nextEl: root.querySelector('.fuel05-ugc__arrow--next'),
        },
        breakpoints: {
          750: { spaceBetween: gapDesktop },
        },
      });
    }

    const videos = root.querySelectorAll('video.fuel05-ugc__video');

    // Above the return below, deliberately. Nothing starts on its own for a
    // shopper who asked for less motion, but a tap still starts a clip, and
    // that tap needs the poster held exactly as much as any other. This is
    // also the one place every clip passes through, cards the collection grid
    // writes after first paint included, because the row is stamped and
    // re-scanned rather than walked from the top.
    videos.forEach(holdPoster);

    // Every clip in the row starts buffering the moment the row itself is
    // reached, not when its own card scrolls into view. The postered clips
    // deliberately load nothing up front, so a tap used to pay for the whole
    // fetch before a frame could show; warming on card visibility then moved
    // the problem to the end of the row, because the last cards were tapped
    // a beat after they appeared and their fetch lost the race every time,
    // on every platform. The cards warm two at a time: six parallel fetches
    // fight each other and iOS's small pool of decoders.
    //
    // iOS Safari ignores preload and load() for video. The one request it
    // honours is playback itself, so a card warms by running its clip muted
    // and stopping on the first frame, which is the poster image, so nothing
    // moves on screen. A real start outranks a pending warm: playOnly clears
    // the flag and the started clip keeps running. Shoppers who asked for
    // less motion get the plain hint instead, because this path really is a
    // playback.
    const warmOne = (video, done) => {
      if (video.dataset.fuel05Warm === 'true' || video.readyState >= 2 || !video.paused) {
        video.dataset.fuel05Warm = 'true';
        done();
        return;
      }
      video.dataset.fuel05Warm = 'true';
      video.preload = 'auto';
      if (prefersReduced.matches) {
        video.load();
        done();
        return;
      }
      const stop = () => {
        video.removeEventListener('loadeddata', stop);
        if (video.dataset.fuel05Warming === 'true') {
          delete video.dataset.fuel05Warming;
          video.pause();
          try {
            video.currentTime = 0;
          } catch (error) {
            // A clip that cannot seek just stays on its first frame.
          }
        }
        done();
      };
      video.dataset.fuel05Warming = 'true';
      video.addEventListener('loadeddata', stop);
      video.muted = true;
      const attempt = video.play();
      if (attempt && attempt.catch) {
        attempt.catch((error) => {
          if (video.dataset.fuel05Warming === 'true') {
            delete video.dataset.fuel05Warming;
            video.removeEventListener('loadeddata', stop);
            // load() only when the browser refused to play at all, where it
            // is the last way to ask for bytes and nothing is fetched yet.
            // On an interruption (a pause() while play() was still pending)
            // load() would throw away exactly the buffer the warm-up built.
            if (error && error.name === 'NotAllowedError') video.load();
          }
          done();
        });
      }
    };

    const warmQueue = [...videos];
    const warmNext = () => {
      // While a tapped clip is buffering, the chain parks instead of taking
      // the next clip; releaseWarmHold restarts every parked chain.
      if (warmHoldVideo) {
        parkedWarmChains.push(warmNext);
        return;
      }
      const video = warmQueue.shift();
      if (!video) return;
      let advanced = false;
      // The guard advances the queue past a stalled fetch; loadeddata and a
      // refused play() advance it sooner. Whichever comes first, once.
      const advance = () => {
        if (advanced) return;
        advanced = true;
        clearTimeout(guard);
        warmNext();
      };
      const guard = setTimeout(advance, 2500);
      warmOne(video, advance);
    };
    // Two chains drain the queue side by side: strictly one at a time made
    // the far end of the row wait through every clip before it, which on a
    // slow connection was long enough for a shopper to swipe there and find
    // it cold anyway. Two is still far from the parallel free-for-all that
    // fights iOS's small pool of decoders, and a tap always outranks the
    // queue either way.
    warmNext();
    warmNext();

    if (prefersReduced.matches || !('IntersectionObserver' in window)) return;
    if (!videos.length) return;
    const playObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => visibleRatio.set(entry.target, entry.intersectionRatio));

        // A card the shopper just swiped to must not wait for the background
        // queue to work through the whole row: a cold clip that comes into
        // view warms right away, and the queue skips it later by its flag.
        // Not while a tapped clip holds the connection, though; the parked
        // chains reach it after the hold lifts.
        entries.forEach((entry) => {
          if (entry.intersectionRatio > 0 && !warmHoldVideo && entry.target.dataset.fuel05Warm !== 'true') {
            warmOne(entry.target, () => {});
          }
        });

        // A clip playing with sound was tapped, and scrolling a little must
        // not take it away again: this callback used to hand playback to
        // whichever card came first in the batch, which paused and muted the
        // one the shopper had just asked to hear. Read before the loop, so the
        // pauses below cannot change the answer half way through.
        const engaged = engagedVideo();

        // Pause what left, then start at most one.
        entries.forEach((entry) => {
          if (entry.intersectionRatio < 0.5) {
            // Muted again on the way out, so a clip somebody had tapped for
            // sound is silent again the next time scrolling brings it back.
            // The engaged clip is at half visibility or better by definition,
            // so it never reaches this branch until it really leaves. A clip
            // mid-warm-up is not paused here either, for the same reason as
            // in playOnly: it pauses itself on its first frame.
            if (entry.target.dataset.fuel05Warming !== 'true') entry.target.pause();
            entry.target.muted = true;
          }
        });

        // The card left running is the leftmost one at least half on screen,
        // read from the tracked ratios, not from this batch. The batch only
        // holds cards whose visibility CHANGED, so picking from it handed
        // playback to the card a swipe had just revealed on the right while
        // the settled card beside it stayed dark: swipe one notch and the
        // third clip started instead of the second. DOM order is row order.
        let starting = null;
        for (const video of videos) {
          if ((visibleRatio.get(video) || 0) >= 0.5) {
            starting = video;
            break;
          }
        }
        if (starting && !engaged) playOnly(starting, false);
      },
      { threshold: [0, 0.5] }
    );
    videos.forEach((video) => playObserver.observe(video));
  };

  const arm = (root) => {
    if (root.dataset.fuel05Armed === 'true') return;
    root.dataset.fuel05Armed = 'true';
    // A full viewport of margin: the row initialises, and so starts warming
    // its clips, a screen before it is reached, so even somebody scrolling
    // straight down to it arrives after the buffering has begun.
    const visibilityObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            initRow(root);
            visibilityObserver.disconnect();
          }
        });
      },
      { rootMargin: '100% 0px' }
    );
    visibilityObserver.observe(root);
  };

  // Safe to call as often as we like: arm() and initRow() both stamp the root
  // and return early on a second pass, so re-scanning never doubles an observer
  // or a Swiper. Roots that arrive with fresh markup carry no stamp and arm.
  const armAll = () => document.querySelectorAll('.fuel05-ugc[data-fuel05-row]').forEach(arm);

  let armQueued = false;
  const armSoon = () => {
    if (armQueued) return;
    armQueued = true;
    requestAnimationFrame(() => {
      armQueued = false;
      armAll();
    });
  };

  // The collection grid changes after first paint in two ways, and neither one
  // runs any of our code: the theme's infinite scroll appends grid cells to
  // #product-grid, and facets.js replaces the whole of
  // #ProductGridContainer.innerHTML on every filter and sort. The container
  // element itself survives both, so one observer on it covers both paths.
  const watchGrid = () => {
    const container = document.getElementById('ProductGridContainer');
    if (!container || container.dataset.fuel05Watched === 'true') return;
    container.dataset.fuel05Watched = 'true';
    new MutationObserver(armSoon).observe(container, { childList: true, subtree: true });
  };

  const start = () => {
    armAll();
    watchGrid();
    // A page can load with a leftover already in it, from a form the shopper
    // closed before this script ran.
    muteKlaviyoResidue();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
  document.addEventListener('shopify:section:load', start);
})();
