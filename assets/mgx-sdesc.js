// "Full description" link under the product title
// (snippets/short-description.liquid). Opens the Description accordion and
// scrolls to it, clear of the sticky header. A second click keeps it open
// (unlike summary.click(), which would close it again). Without this script
// the link is a plain anchor to the same <details>.
(() => {
  if (window.mgxSdescReady) return;
  window.mgxSdescReady = true;

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

  document.addEventListener('click', (event) => {
    const link = event.target.closest('[data-mgx-sdesc-more]');
    if (!link) return;
    const details = document.getElementById(link.getAttribute('href').slice(1));
    if (!details) return;
    event.preventDefault();

    details.open = true;
    // global.js keeps aria-expanded in sync on clicks only.
    const summary = details.querySelector('summary');
    if (summary) summary.setAttribute('aria-expanded', 'true');

    const header = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-height')) || 0;
    const top = details.getBoundingClientRect().top + window.scrollY - header - 12;
    // 'instant', not 'auto': base.css sets html { scroll-behavior: smooth },
    // which 'auto' would follow.
    window.scrollTo({ top: Math.max(0, top), behavior: reduced.matches ? 'instant' : 'smooth' });
    if (summary) summary.focus({ preventScroll: true });
  });
})();
