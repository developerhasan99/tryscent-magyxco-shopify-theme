/**
 * Product tabs (sections/home-tabs.liquid): switches the visible tab panel on click and with
 * the arrow keys, Home and End, and shows the tab whose block is selected in the theme editor.
 */
(() => {
  if (customElements.get('mgx-product-tabs')) return;

  class MgxProductTabs extends HTMLElement {
    connectedCallback() {
      if (this.ready) return;
      this.ready = true;
      this.tabs = [...this.querySelectorAll('[role="tab"]')];
      this.tabs.forEach((tab, index) => {
        tab.addEventListener('click', () => this.select(index));
        tab.addEventListener('keydown', (event) => this.onKeydown(event, index));
      });
    }

    select(index, focus) {
      this.tabs.forEach((tab, i) => {
        const active = i === index;
        tab.setAttribute('aria-selected', active ? 'true' : 'false');
        tab.tabIndex = active ? 0 : -1;
        const panel = document.getElementById(tab.getAttribute('aria-controls'));
        if (panel) panel.hidden = !active;
      });
      if (focus) this.tabs[index].focus();
    }

    onKeydown(event, index) {
      const last = this.tabs.length - 1;
      const next = {
        ArrowRight: index === last ? 0 : index + 1,
        ArrowLeft: index === 0 ? last : index - 1,
        Home: 0,
        End: last,
      }[event.key];
      if (next === undefined) return;
      event.preventDefault();
      this.select(next, true);
    }
  }

  customElements.define('mgx-product-tabs', MgxProductTabs);

  // Block ids are only unique within a section, so look inside the selected section.
  document.addEventListener('shopify:block:select', (event) => {
    const section = document.getElementById(`shopify-section-${event.detail.sectionId}`);
    const tab = section && section.querySelector(`[role="tab"][data-block-id="${event.detail.blockId}"]`);
    const tabs = tab && tab.closest('mgx-product-tabs');
    if (tabs && tabs.tabs) tabs.select(tabs.tabs.indexOf(tab));
  });
})();
