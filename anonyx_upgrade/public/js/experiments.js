/**
 * A/B assignment + one-time exposure beacons (session-scoped).
 */
(function () {
  function beacon(kind) {
    if (!kind) return;
    fetch("/api/beacon", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: String(kind).slice(0, 64) })
    }).catch(() => {});
  }

  window.AnonyxExperiments = {
    async bootstrap(userId) {
      try {
        const r = await fetch("/api/experiments?userId=" + encodeURIComponent(userId || "anon"));
        const data = await r.json();
        const variants = data.variants || {};
        document.documentElement.dataset.anonyxAb = JSON.stringify(variants);
        Object.entries(variants).forEach(([name, val]) => {
          const attr = "data-ab-" + String(name).replace(/_/g, "-");
          document.documentElement.setAttribute(attr, String(val));
          const key = "ab_beacon_" + name + "_" + val;
          if (!sessionStorage.getItem(key)) {
            sessionStorage.setItem(key, "1");
            beacon("ab_expose_" + name + "_" + val);
          }
        });
        return variants;
      } catch (e) {
        return {};
      }
    },
    trackConversion(name, variant) {
      beacon("ab_convert_" + String(name) + "_" + String(variant));
    },
    beacon
  };
})();
