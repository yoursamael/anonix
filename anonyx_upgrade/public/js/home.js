/* Home page behavior: experiments bootstrap + CTA beacons.
   Anonymous sessions are server-issued; do not create client IDs. */

(function () {
  if (window.AnonyxExperiments && typeof window.AnonyxExperiments.bootstrap === "function") {
    window.AnonyxExperiments.bootstrap().catch(() => {});
  }

  const links = document.querySelectorAll('a[href="/chat"], a.nav-cta, .hero-buttons a.btn-primary');
  links.forEach((a) => {
    a.addEventListener("click", () => {
      if (!window.AnonyxExperiments) return;
      try {
        const ab = document.documentElement.dataset.anonyxAb;
        const v = ab ? JSON.parse(ab) : {};
        if (v.hero_cta) window.AnonyxExperiments.trackConversion("hero_cta", v.hero_cta);
      } catch (e) {}
      window.AnonyxExperiments.beacon("cta_click");
    });
  });
})();

