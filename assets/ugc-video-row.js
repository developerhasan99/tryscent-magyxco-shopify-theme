(() => {
  if (window.ugcVideoRowReady) return;
  window.ugcVideoRowReady = true;

  // Preview timings measured on the theessencevault.co.uk row: the sequence
  // starts 2s after the row is half on screen, each clip plays muted for 3s
  // from the start, then the next one, and after the last a 5s pause before
  // it goes round again. One clip at a time.
  const START_DELAY = 2000;
  const CLIP_TIME = 3000;
  const LOOP_DELAY = 5000;
  // A clip that has not produced a frame in this long is skipped, so a slow
  // or broken file cannot stall the rest of the row.
  const START_GUARD = 4000;

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

  // The poster image over the clip comes off exactly when the clip has put a
  // real frame on screen (iOS Safari drops the poster attribute on play and
  // has nothing decoded yet). It never goes back: a clip reset to its start
  // shows frame 0, which is the poster.
  const holdPoster = (tile, video) => {
    if (!tile.querySelector('.ugc-row__poster')) return;
    const started = () => tile.classList.add('ugc-row__tile--started');
    if (typeof video.requestVideoFrameCallback === 'function') {
      video.requestVideoFrameCallback(started);
      return;
    }
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
    if (root.dataset.ugcInit === 'true') return;
    root.dataset.ugcInit = 'true';

    const tiles = [...root.querySelectorAll('[data-ugc-tile]')];
    const videos = tiles.map((tile) => tile.querySelector('video.ugc-row__video'));
    const dialog = root.querySelector('dialog.ugc-player');
    const player = dialog ? dialog.querySelector('.ugc-player__video') : null;
    const pills = dialog ? [...dialog.querySelectorAll('.ugc-player__pill')] : [];
    const autoplay = root.dataset.autoplay === 'true';

    tiles.forEach((tile, i) => holdPoster(tile, videos[i]));

    // Two clips per row, so on a phone one row of the grid can be on screen
    // and the other not: the preview plays only clips that are at least half
    // in view, and runs while any one of them is.
    const seen = tiles.map(() => false);
    const nextSeen = (from) => {
      for (let k = from; k < videos.length; k += 1) {
        if (seen[k]) return k;
      }
      return -1;
    };
    let visible = false;
    let running = false;
    // Set when the browser refuses a muted start (iOS Low Power Mode, data
    // saver): the row then stays on its posters for good instead of retrying.
    let blocked = false;
    let timer = null;
    let current = -1;
    let onPlaying = null;
    let opener = null;
    // WCAG 2.2.2 (Pause, Stop, Hide): the preview moves on its own for as long
    // as the row is in view, so the shopper needs a way to stop it. paused is
    // their choice on the toggle and outlives opening the player; hovered and
    // focused hold the row while a pointer or keyboard focus is inside it, the
    // same pause the theme's slideshow makes on hover and focus. Two flags, so
    // focus leaving does not end a hover that is still there, and the reverse.
    let paused = false;
    let hovered = false;
    let focused = false;
    const toggle = root.querySelector('[data-ugc-toggle]');

    const canPreview = () =>
      autoplay && !blocked && !paused && !hovered && !focused && !reduced.matches && visible && !document.hidden &&
      !(dialog && dialog.open) && root.isConnected;

    const clearTimer = () => {
      clearTimeout(timer);
      timer = null;
    };

    const resetClip = (video) => {
      if (!video) return;
      if (onPlaying) video.removeEventListener('playing', onPlaying);
      video.pause();
      try {
        video.currentTime = 0;
      } catch (error) {
        // A clip that cannot seek yet just stays where it is.
      }
    };

    // Only the clip that plays next is asked to buffer, so the row never
    // pulls four files at once on a phone.
    const warm = (video) => {
      if (video && video.preload === 'none') video.preload = 'auto';
    };

    const stop = () => {
      running = false;
      clearTimer();
      if (current >= 0) resetClip(videos[current]);
      current = -1;
    };

    // The next clip in view from slot `from` on; past the last one, the
    // 5s pause and round again from the first.
    const playFrom = (from) => {
      if (!running) return;
      const i = nextSeen(from);
      if (i < 0) {
        current = -1;
        timer = setTimeout(() => playFrom(0), LOOP_DELAY);
        return;
      }
      playAt(i);
    };

    const playAt = (i) => {
      if (!running) return;
      if (!canPreview()) {
        stop();
        return;
      }
      const video = videos[i];
      current = i;
      const next = nextSeen(i + 1);
      if (next >= 0) warm(videos[next]);

      let advanced = false;
      const advance = () => {
        if (advanced) return;
        advanced = true;
        clearTimer();
        resetClip(video);
        if (!running) return;
        playFrom(i + 1);
      };

      // The 3s count starts when the clip really plays, not when it was
      // asked to: on a slow line the fetch would otherwise eat the preview.
      onPlaying = () => {
        clearTimer();
        timer = setTimeout(advance, CLIP_TIME);
      };
      video.addEventListener('playing', onPlaying, { once: true });
      timer = setTimeout(advance, START_GUARD);

      video.muted = true;
      const attempt = video.play();
      if (attempt && attempt.catch) {
        attempt.catch((error) => {
          if (error && error.name === 'NotAllowedError') {
            blocked = true;
            stop();
          }
          // AbortError is our own pause() landing before the start; nothing to do.
        });
      }
    };

    const start = () => {
      if (running || !videos.length || !canPreview()) return;
      running = true;
      const first = nextSeen(0);
      if (first >= 0) warm(videos[first]);
      timer = setTimeout(() => playFrom(0), START_DELAY);
    };

    const refresh = () => (canPreview() ? start() : stop());

    // Everything the row hangs outside itself (document and media-query
    // listeners, the observer) is kept here, so a teardown can take it off.
    const ac = new AbortController();
    let io = null;
    if ('IntersectionObserver' in window) {
      io = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            const i = tiles.indexOf(entry.target);
            if (i >= 0) seen[i] = entry.intersectionRatio >= 0.5;
          });
          visible = seen.some(Boolean);
          refresh();
        },
        { threshold: [0, 0.5] }
      );
      tiles.forEach((tile) => io.observe(tile));
    }
    document.addEventListener('visibilitychange', refresh, { signal: ac.signal });
    if (typeof reduced.addEventListener === 'function') reduced.addEventListener('change', refresh, { signal: ac.signal });

    if (toggle) {
      toggle.addEventListener('click', () => {
        paused = !paused;
        // The label carries the state ("Pause" / "Resume"); no aria-pressed
        // on top, which would read as "Resume preview, pressed".
        toggle.textContent = paused ? toggle.dataset.labelPlay : toggle.dataset.labelPause;
        refresh();
      });
    }

    // Hover only holds on devices that really hover: on a phone the emulated
    // hover after a tap would leave the row stuck.
    if (window.matchMedia('(hover: hover)').matches) {
      root.addEventListener('pointerenter', () => {
        hovered = true;
        refresh();
      });
      root.addEventListener('pointerleave', () => {
        hovered = false;
        refresh();
      });
    }

    // Keyboard focus only (:focus-visible): closing the player with a tap
    // hands focus back to the tile, and that must not keep the row still
    // after the player is gone. Focus on the toggle itself does not hold, as
    // in the slideshow, so pressing it shows what it does.
    const keyboardFocus = (element) => {
      try {
        return element.matches(':focus-visible');
      } catch (error) {
        // A browser without :focus-visible holds on any focus.
        return true;
      }
    };
    root.addEventListener('focusin', (event) => {
      focused = event.target !== toggle && keyboardFocus(event.target);
      refresh();
    });
    root.addEventListener('focusout', (event) => {
      if (!root.contains(event.relatedTarget)) focused = false;
      refresh();
    });

    // Theme editor only: a re-rendered section drops this row, but the
    // document listeners and the observer would keep it alive, and an open
    // player removed with it fires no close event, which would leave the page
    // unable to scroll until a reload.
    root.ugcTeardown = () => {
      stop();
      if (io) io.disconnect();
      ac.abort();
      if (dialog && dialog.open) dialog.close();
      document.documentElement.classList.remove('ugc-player-open');
    };

    // A card for the product of this very page (on a bundle page, its own
    // bundle) goes to the offer on the page instead of reloading it: the
    // add-to-cart anchor on a perfume page, the price and bundle builder on a
    // bundle page. From the player it closes the player first. The sticky
    // header shows again on the way up (it reveals on scroll up), so the stop
    // leaves room for it.
    const offerTarget = () => document.querySelector('#atc_scroll_target, .bundle-price-pdp');
    root.querySelectorAll('[data-ugc-offer]').forEach((link) => {
      link.addEventListener('click', (event) => {
        const target = offerTarget();
        if (!target) return;
        event.preventDefault();
        if (dialog && dialog.open) dialog.close();
        document.documentElement.classList.remove('ugc-player-open');
        const header = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-height')) || 0;
        const top = target.getBoundingClientRect().top + window.scrollY - header - 12;
        // 'instant', not 'auto': base.css sets html { scroll-behavior: smooth },
        // which 'auto' would follow.
        window.scrollTo({ top: Math.max(0, top), behavior: reduced.matches ? 'instant' : 'smooth' });
      });
    });

    if (!dialog || !player) return;

    const open = (i, button) => {
      if (dialog.open) return;
      stop();
      opener = button;

      const tileVideo = videos[i];
      const source = tileVideo.querySelector('source');
      const src = source ? source.src : tileVideo.currentSrc;
      const slot = tiles[i].dataset.slot;

      let withPill = false;
      pills.forEach((pill) => {
        const match = pill.dataset.slot === slot;
        pill.hidden = !match;
        if (match) withPill = true;
      });
      dialog.classList.toggle('ugc-player--with-pill', withPill);

      // The same file the tile plays, which the preview has usually buffered
      // already, so the player starts at once.
      if (player.src !== src) {
        player.src = src;
      } else {
        try {
          player.currentTime = 0;
        } catch (error) {
          // Not seekable yet; it starts from the beginning anyway.
        }
      }
      player.poster = tileVideo.getAttribute('poster') || '';
      player.muted = false;

      dialog.showModal();
      document.documentElement.classList.add('ugc-player-open');

      // Inside the tap, so the browser lets the sound through. If it still
      // refuses, the controls are there to start it.
      const attempt = player.play();
      if (attempt && attempt.catch) attempt.catch(() => {});
    };

    tiles.forEach((tile, i) => {
      const button = tile.querySelector('[data-ugc-open]');
      if (button) button.addEventListener('click', () => open(i, button));
    });

    const close = () => {
      if (dialog.open) dialog.close();
    };

    dialog.querySelectorAll('[data-ugc-close]').forEach((button) => button.addEventListener('click', close));

    // The dialog itself is the dark area around the clip, and the frame's own
    // empty parts (the band beside the close button, the gap above the pill)
    // read as that same dark area: a click there closes the player. Clicks on
    // the clip, the pill or the close button land on those elements instead.
    const frame = dialog.querySelector('.ugc-player__frame');
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog || event.target === frame) close();
    });

    // Escape, the close button and the backdrop all end here.
    dialog.addEventListener('close', () => {
      player.pause();
      document.documentElement.classList.remove('ugc-player-open');
      if (opener && opener.isConnected) opener.focus({ preventScroll: true });
      opener = null;
      refresh();
    });
  };

  const initAll = () => document.querySelectorAll('[data-ugc-row]').forEach(initRow);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAll);
  } else {
    initAll();
  }

  // Theme editor: a re-rendered section brings fresh, unstamped rows, and
  // selecting the block in the sidebar scrolls its row into view.
  document.addEventListener('shopify:section:load', initAll);
  // The section on its way out takes its rows down first (see ugcTeardown).
  // The scroll lock is cleared here too, so the editor preview can always
  // scroll again whatever state the old row was in.
  document.addEventListener('shopify:section:unload', (event) => {
    const target = event.target;
    if (target && target.querySelectorAll) {
      target.querySelectorAll('[data-ugc-row]').forEach((root) => root.ugcTeardown && root.ugcTeardown());
    }
    document.documentElement.classList.remove('ugc-player-open');
  });
  document.addEventListener('shopify:block:select', (event) => {
    const id = event.detail && event.detail.blockId;
    if (!id) return;
    const root = document.querySelector(`[data-ugc-row][data-block-id="${id}"]`);
    if (root) root.scrollIntoView({ block: 'center', behavior: 'smooth' });
  });
})();
