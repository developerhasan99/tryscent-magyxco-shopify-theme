/* pm-product-tabs.js: <pm-product-tabs> for sections/home-product-tabs.liquid.
   Switches the visible tab panel on click and with ArrowLeft / ArrowRight / Home / End, keeps the Discover
   button(s) pointing at the active tab's collection (unless the section has a fixed link), and runs one Swiper per
   panel: initialised the first time a panel is shown (panel.dataset.swiper = 'ready'), updated on later shows.
   Swiper is a deferred CDN script: when window.Swiper is missing we wait for the window load event and retry once
   more a second later. Theme editor: shopify:block:select selects that tab, shopify:section:load re-inits. */
(function () {
  'use strict';

  if (customElements.get('pm-product-tabs')) return;

  /* Cards visible per view come from the section settings (data-per-view-mobile / data-per-view-desktop);
     the in-between widths step up towards the desktop count. */
  function swiperOptions(mobile, desktop) {
    var flat = { spaceBetween: 20, slidesOffsetBefore: 0, slidesOffsetAfter: 0 };
    return {
      slidesPerView: mobile,
      spaceBetween: 12,
      slidesOffsetBefore: 20,
      slidesOffsetAfter: 20,
      watchOverflow: true,
      breakpoints: {
        750: Object.assign({ slidesPerView: Math.max(2.2, mobile + 1) }, flat),
        990: Object.assign({ slidesPerView: desktop > 4 ? 4 : 3 }, flat),
        1200: Object.assign({ slidesPerView: desktop }, flat)
      }
    };
  }

  function whenSwiper(callback) {
    if (window.Swiper) {
      callback();
      return;
    }
    var done = false;
    var attempt = function () {
      if (done) return;
      if (!window.Swiper) return;
      done = true;
      callback();
    };
    var retryLater = function () {
      attempt();
      if (!done) setTimeout(attempt, 1000);
    };
    if (document.readyState === 'complete') {
      setTimeout(attempt, 1000);
      return;
    }
    window.addEventListener('load', retryLater, { once: true });
  }

  class PmProductTabs extends HTMLElement {
    connectedCallback() {
      this.init();
    }

    init() {
      if (this.ready) return;
      this.ready = true;
      var self = this;
      this.fixedLink = this.dataset.fixedLink === 'true';
      this.swiperOptions = swiperOptions(
        parseFloat(this.dataset.perViewMobile) || 1.25,
        parseFloat(this.dataset.perViewDesktop) || 4
      );
      this.tabs = Array.prototype.slice.call(this.querySelectorAll('[role="tab"]'));
      this.panels = this.tabs.map(function (tab) {
        return self.querySelector('#' + CSS.escape(tab.getAttribute('aria-controls')));
      });
      this.ctas = Array.prototype.slice.call(this.querySelectorAll('[data-cta]'));
      this.tabs.forEach(function (tab, index) {
        tab.addEventListener('click', function () {
          self.select(index);
        });
        tab.addEventListener('keydown', function (event) {
          self.onKeydown(event, index);
        });
      });
      var current = 0;
      this.tabs.forEach(function (tab, index) {
        if (tab.getAttribute('aria-selected') === 'true') current = index;
      });
      this.select(current, false);

      // Panels after the first ship empty (data-pm-lazy); fetch them once the section is close to the screen.
      if (this.querySelector('[data-pm-lazy]') && 'IntersectionObserver' in window) {
        var observer = new IntersectionObserver(function (entries) {
          if (!entries.some(function (entry) { return entry.isIntersecting; })) return;
          observer.disconnect();
          self.loadLazyPanels();
        }, { rootMargin: '600px 0px' });
        observer.observe(this);
      }
    }

    /* One Section Rendering API request returns every tab (the section renders all of them there); copy the
       lazy panels' content in, and hide any tab whose panel the full render left out (no matching products). */
    loadLazyPanels() {
      if (this.lazyLoad) return this.lazyLoad;
      var self = this;
      var section = this.closest('.pm-ptabs');
      var url = window.location.pathname + '?section_id=' + encodeURIComponent(section ? section.id : '');
      this.lazyLoad = fetch(url)
        .then(function (response) {
          if (!response.ok) throw new Error(response.status);
          return response.text();
        })
        .then(function (html) {
          var doc = new DOMParser().parseFromString(html, 'text/html');
          self.panels.forEach(function (panel, index) {
            if (!panel || !panel.hasAttribute('data-pm-lazy')) return;
            var source = doc.getElementById(panel.id);
            if (source) {
              panel.innerHTML = source.innerHTML;
              panel.removeAttribute('data-pm-lazy');
            } else {
              self.tabs[index].hidden = true;
              panel.hidden = true;
            }
          });
        })
        .catch(function () {
          self.lazyLoad = null; // try again on the next tab click
        });
      return this.lazyLoad;
    }

    select(index, focus) {
      var self = this;
      var tab = this.tabs[index];
      if (!tab) return;
      this.tabs.forEach(function (item, i) {
        var active = i === index;
        item.setAttribute('aria-selected', active ? 'true' : 'false');
        item.tabIndex = active ? 0 : -1;
        var panel = self.panels[i];
        if (panel) panel.hidden = !active;
      });
      if (!this.fixedLink && tab.dataset.url) {
        this.ctas.forEach(function (cta) {
          cta.setAttribute('href', tab.dataset.url);
        });
      }
      if (focus) tab.focus();
      var panel = this.panels[index];
      if (panel && panel.hasAttribute('data-pm-lazy')) {
        panel.setAttribute('aria-busy', 'true');
        this.loadLazyPanels().then(function () {
          panel.removeAttribute('aria-busy');
          if (self.tabs[index].hidden) {
            var first = self.tabs.findIndex(function (item) { return !item.hidden; });
            if (first > -1) self.select(first, focus);
            return;
          }
          self.mount(panel);
        });
        return;
      }
      this.mount(panel);
    }

    mount(panel) {
      if (!panel) return;
      var slider = panel.querySelector('.pm-ptabs__slider');
      if (!slider) return;
      var baseOptions = this.swiperOptions;
      whenSwiper(function () {
        if (panel.hidden) return;
        if (panel.dataset.swiper === 'ready') {
          if (slider.swiper) slider.swiper.update();
          return;
        }
        panel.dataset.swiper = 'ready';
        var options = Object.assign({}, baseOptions, {
          navigation: {
            nextEl: slider.querySelector('.swiper-button-next'),
            prevEl: slider.querySelector('.swiper-button-prev')
          }
        });
        new window.Swiper(slider, options);
      });
    }

    onKeydown(event, index) {
      var last = this.tabs.length - 1;
      var next;
      switch (event.key) {
        case 'ArrowRight':
          next = index === last ? 0 : index + 1;
          break;
        case 'ArrowLeft':
          next = index === 0 ? last : index - 1;
          break;
        case 'Home':
          next = 0;
          break;
        case 'End':
          next = last;
          break;
        default:
          return;
      }
      event.preventDefault();
      // Skip tabs hidden after lazy loading found no products for them.
      var step = event.key === 'ArrowLeft' || event.key === 'End' ? -1 : 1;
      for (var guard = 0; this.tabs[next] && this.tabs[next].hidden && guard < this.tabs.length; guard++) {
        next = (next + step + this.tabs.length) % this.tabs.length;
      }
      this.select(next, true);
    }
  }

  customElements.define('pm-product-tabs', PmProductTabs);

  // Block ids are only unique within a section, so look inside the selected section.
  document.addEventListener('shopify:block:select', function (event) {
    var section = document.getElementById('shopify-section-' + event.detail.sectionId);
    var tab = section && section.querySelector('[role="tab"][data-block-id="' + event.detail.blockId + '"]');
    var tabs = tab && tab.closest('pm-product-tabs');
    if (tabs && tabs.tabs) tabs.select(tabs.tabs.indexOf(tab));
  });

  document.addEventListener('shopify:section:load', function (event) {
    var elements = event.target.querySelectorAll('pm-product-tabs');
    Array.prototype.forEach.call(elements, function (element) {
      if (typeof element.init === 'function') element.init();
    });
  });
})();
