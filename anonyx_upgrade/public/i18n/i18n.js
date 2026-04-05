/**
 * Lightweight i18n system with 6-language support
 * Languages: English (LTR), Arabic (RTL), Farsi (RTL), Hebrew (RTL), Chinese (LTR), Hindi (LTR)
 */

class I18n {
  constructor() {
    this.translations = {};
    this.currentLanguage = 'en';
    this.supportedLanguages = ['en', 'ar', 'fa', 'he', 'zh', 'hi'];
    this.defaultLanguage = 'en';
    this.initialized = false;
  }

  /**
   * Initialize i18n: load translations and detect language
   */
  async init() {
    try {
      // Load translations from JSON
      const response = await fetch('/i18n/translations.json');
      this.translations = await response.json();
      
      // Detect user language
      const detected = this.detectLanguage();
      this.setLanguage(detected);
      
      this.initialized = true;
      return true;
    } catch (error) {
      console.error('Failed to initialize i18n:', error);
      this.currentLanguage = this.defaultLanguage;
      return false;
    }
  }

  /**
   * Detect language: localStorage > browser language > default
   */
  detectLanguage() {
    // Check localStorage first
    const saved = localStorage.getItem('anonyx_language');
    if (saved && this.supportedLanguages.includes(saved)) {
      return saved;
    }

    // Check browser language
    const browserLang = navigator.language || navigator.userLanguage;
    const lang = browserLang.split('-')[0].toLowerCase();
    
    if (this.supportedLanguages.includes(lang)) {
      return lang;
    }

    // Fallback to English
    return this.defaultLanguage;
  }

  /**
   * Set active language and apply to page
   */
  setLanguage(lang) {
    if (!this.supportedLanguages.includes(lang)) {
      console.warn(`Language ${lang} not supported, falling back to ${this.defaultLanguage}`);
      lang = this.defaultLanguage;
    }

    this.currentLanguage = lang;
    localStorage.setItem('anonyx_language', lang);
    
    // Apply to DOM
    this.applyLanguageToDOM(lang);
    
    // Dispatch event for observers
    window.dispatchEvent(new CustomEvent('languageChanged', { detail: { language: lang } }));
  }

  /**
   * Get translation key value
   */
  t(key) {
    const keys = key.split('.');
    let value = this.translations[this.currentLanguage];

    for (const k of keys) {
      if (value && typeof value === 'object') {
        value = value[k];
      } else {
        // Fallback to default language
        value = this.translations[this.defaultLanguage];
        for (const k2 of keys) {
          if (value && typeof value === 'object') {
            value = value[k2];
          } else {
            return key; // Return key if translation not found
          }
        }
        break;
      }
    }

    return value || key;
  }

  /**
   * Apply language to page: set html lang, dir, and placeholders
   */
  applyLanguageToDOM(lang) {
    const langData = this.translations[lang];
    if (!langData) return;

    // Set html attributes
    document.documentElement.lang = lang;
    document.documentElement.dir = langData.dir ? langData.dir : 'ltr';
    document.documentElement.setAttribute('data-language', lang);

    // Apply CSS class for styling hooks
    document.body.classList.remove(
      'lang-en', 'lang-ar', 'lang-fa', 'lang-he', 'lang-zh', 'lang-hi'
    );
    document.body.classList.add(`lang-${lang}`);

    // Update all elements with data-i18n attribute
    this.updateDOMElements();

    // Update page title if available
    const title = this.t('page.title');
    if (title && title !== 'page.title') {
      document.title = title;
    }
  }

  /**
   * Update all DOM elements with data-i18n attributes
   */
  updateDOMElements() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      const value = this.t(key);
      
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        // Update placeholder
        if (el.hasAttribute('data-i18n-placeholder')) {
          el.placeholder = value;
        } else {
          el.value = value;
        }
      } else {
        // Update text content
        el.textContent = value;
      }
    });

    // Update title attributes
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
      const key = el.getAttribute('data-i18n-title');
      el.title = this.t(key);
    });

    // Update aria-label attributes
    document.querySelectorAll('[data-i18n-aria-label]').forEach(el => {
      const key = el.getAttribute('data-i18n-aria-label');
      el.setAttribute('aria-label', this.t(key));
    });

    // Update placeholder attributes
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const key = el.getAttribute('data-i18n-placeholder');
      el.placeholder = this.t(key);
    });
  }

  /**
   * Get language name (e.g., "العربية" for Arabic)
   */
  getLanguageName(lang = this.currentLanguage) {
    return this.translations[lang]?.lang_name || lang;
  }

  /**
   * Check if current language is RTL
   */
  isRTL() {
    return this.translations[this.currentLanguage]?.dir === 'rtl';
  }

  /**
   * Get direction (ltr or rtl)
   */
  getDirection() {
    return this.translations[this.currentLanguage]?.dir || 'ltr';
  }

  /**
   * Get all supported languages with names
   */
  getLanguages() {
    return this.supportedLanguages.map(lang => ({
      code: lang,
      name: this.getLanguageName(lang)
    }));
  }
}

// Create global i18n instance
const i18n = new I18n();

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    i18n.init();
  });
} else {
  i18n.init();
}
