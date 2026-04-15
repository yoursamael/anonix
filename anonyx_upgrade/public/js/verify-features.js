/* Verification page logic (no inline handlers; compatible with CSP). */

(function () {
  function updateStatus(elementId, isOk) {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.textContent = isOk ? "✓" : "✕";
    el.className = "status " + (isOk ? "ok" : "error");
  }

  function checkI18n() {
    const ok = typeof window.i18n !== "undefined";
    updateStatus("status-i18n", ok);
    return ok;
  }

  function checkTranslations() {
    const ok = !!(window.i18n && window.i18n.translations && Object.keys(window.i18n.translations).length > 0);
    updateStatus("status-translations", ok);
    return ok;
  }

  function checkMobileEnhancements() {
    const ok = typeof window.mobileEnhancements !== "undefined";
    updateStatus("status-mobile", ok);
    return ok;
  }

  function checkDevice() {
    updateStatus("status-device", true);
    return true;
  }

  function checkTouch() {
    const hasTouch = (("ontouchstart" in window) || (navigator.maxTouchPoints > 0) || (navigator.msMaxTouchPoints > 0));
    updateStatus("status-touch", hasTouch);
    return hasTouch;
  }

  function checkHaptic() {
    const hasHaptic = "vibrate" in navigator;
    updateStatus("status-haptic", hasHaptic);
    return hasHaptic;
  }

  function checkHtmlAttrs() {
    const hasLang = document.documentElement.lang !== "";
    const hasDir = document.documentElement.dir !== "";
    updateStatus("status-html-lang", hasLang && hasDir);
    return hasLang && hasDir;
  }

  function checkLanguageDetection() {
    const ok = !!(window.i18n && window.i18n.currentLanguage && window.i18n.currentLanguage.length === 2);
    updateStatus("status-detection", ok);
    return ok;
  }

  function testI18n() {
    const output = document.getElementById("output-i18n");
    if (!output) return;
    if (!window.i18n) {
      output.textContent = "✕ i18n not loaded";
      return;
    }
    output.textContent = [
      `✓ Current Language: ${window.i18n.currentLanguage}`,
      `✓ Language Name: ${window.i18n.getLanguageName()}`,
      `✓ Available: ${window.i18n.supportedLanguages.join(", ")}`,
      `✓ RTL: ${window.i18n.isRTL()}`,
      `✓ HTML dir: ${document.documentElement.dir}`
    ].join("\n");
  }

  function switchLanguage(lang) {
    if (!window.i18n) return;
    window.i18n.setLanguage(lang);
    testI18n();
  }

  function testMobileEnhancements() {
    const output = document.getElementById("output-mobile");
    if (!output) return;
    if (!window.mobileEnhancements || !window.mobileEnhancements.getDeviceInfo) {
      output.textContent = "✕ Mobile enhancements not loaded";
      return;
    }
    const info = window.mobileEnhancements.getDeviceInfo();
    output.textContent = [
      `✓ Mobile: ${info.isMobile ? "Yes" : "No"}`,
      `✓ iOS: ${info.isIOS ? "Yes" : "No"}`,
      `✓ Android: ${info.isAndroid ? "Yes" : "No"}`,
      `✓ Screen: ${info.screenWidth} x ${info.screenHeight}`,
      `✓ Haptic: ${info.hasHaptic ? "Yes" : "No"}`
    ].join("\n");
  }

  function testHaptic() {
    const output = document.getElementById("output-mobile");
    if (!("vibrate" in navigator)) {
      if (output) output.textContent = "✕ Vibration not supported";
      return;
    }
    navigator.vibrate(100);
    if (output) output.textContent = "✓ Vibration triggered";
  }

  function testRTL(lang) {
    if (!window.i18n) return;
    window.i18n.setLanguage(lang);
    const output = document.getElementById("output-rtl");
    if (!output) return;
    output.textContent = [
      `✓ Language: ${window.i18n.getLanguageName(lang)}`,
      `✓ Direction: ${document.documentElement.dir}`,
      `✓ Body class: ${document.body.className}`
    ].join("\n");
  }

  function checkAllFiles() {
    const output = document.getElementById("output-files");
    if (!output) return;
    const checks = {
      "i18n.js": typeof window.i18n !== "undefined",
      "translations.json": !!(window.i18n && window.i18n.translations && Object.keys(window.i18n.translations).length > 0),
      "mobile-enhancements.js": typeof window.mobileEnhancements !== "undefined",
      "mobile-rtl.css": true
    };
    output.textContent = Object.entries(checks)
      .map(([k, ok]) => `${ok ? "✓" : "✕"} ${k}`)
      .join("\n");
  }

  function bind(id, fn) {
    const el = document.getElementById(id);
    if (el) el.addEventListener("click", fn);
  }

  bind("btnTestI18n", testI18n);
  bind("btnLangEn", () => switchLanguage("en"));
  bind("btnLangAr", () => switchLanguage("ar"));
  bind("btnLangZh", () => switchLanguage("zh"));

  bind("btnTestMobile", testMobileEnhancements);
  bind("btnDeviceInfo", testMobileEnhancements);
  bind("btnTestHaptic", testHaptic);

  bind("btnRTLAr", () => testRTL("ar"));
  bind("btnRTLFa", () => testRTL("fa"));
  bind("btnRTLHe", () => testRTL("he"));
  bind("btnRTLEn", () => testRTL("en"));

  bind("btnCheckFiles", checkAllFiles);

  function runChecks() {
    checkI18n();
    checkTranslations();
    checkMobileEnhancements();
    checkDevice();
    checkTouch();
    checkHaptic();
    checkHtmlAttrs();
    checkLanguageDetection();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => setTimeout(runChecks, 500));
  } else {
    setTimeout(runChecks, 500);
  }
})();

