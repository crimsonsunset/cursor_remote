/**
 * Client-side internationalization system
 * Lightweight i18n implementation for browser use
 */

class ClientI18n {
  constructor() {
    this.translations = {};
    this.currentLocale = 'en';
    this.defaultLocale = 'en';
    this.fallbackEnabled = true;
    
    // Get locale from root package.json config if available
    this.loadConfig();
  }

  /**
   * Load configuration from various sources
   */
  loadConfig() {
    // Try to get locale from environment or default to English
    // In a real deployment, this could come from user preferences, URL params, etc.
    const savedLocale = localStorage.getItem('cursorRemote_locale');
    if (savedLocale && ['en', 'zh'].includes(savedLocale)) {
      this.currentLocale = savedLocale;
    }
  }

  /**
   * Load translations for a specific locale
   * @param {string} locale - The locale code (e.g., 'en', 'zh') 
   * @param {Object} translations - The translations object
   */
  loadTranslations(locale, translations) {
    this.translations[locale] = translations;
  }

  /**
   * Set the current locale
   * @param {string} locale - The locale code
   */
  setLocale(locale) {
    if (this.translations[locale]) {
      this.currentLocale = locale;
      localStorage.setItem('cursorRemote_locale', locale);
      return true;
    }
    return false;
  }

  /**
   * Get the current locale
   * @returns {string} Current locale code
   */
  getLocale() {
    return this.currentLocale;
  }

  /**
   * Get available locales
   * @returns {Array<string>} Array of available locale codes
   */
  getAvailableLocales() {
    return Object.keys(this.translations);
  }

  /**
   * Translate a key with optional parameters
   * @param {string} key - The translation key (supports nested keys like 'errors.connection_failed')
   * @param {Object} params - Parameters for string interpolation
   * @returns {string} Translated string
   */
  __(key, params = {}) {
    const translation = this.getTranslation(key, this.currentLocale);
    return this.interpolate(translation, params);
  }

  /**
   * Get translation for a specific key and locale
   * @param {string} key - The translation key
   * @param {string} locale - The locale to use
   * @returns {string} The translation or the key if not found
   */
  getTranslation(key, locale) {
    const translations = this.translations[locale];
    if (!translations) {
      return this.getFallbackTranslation(key);
    }

    // Support nested keys like 'errors.connection_failed'
    const keys = key.split('.');
    let result = translations;
    
    for (const k of keys) {
      if (result && typeof result === 'object' && k in result) {
        result = result[k];
      } else {
        return this.getFallbackTranslation(key);
      }
    }

    return typeof result === 'string' ? result : this.getFallbackTranslation(key);
  }

  /**
   * Get fallback translation (try default locale, then return key)
   * @param {string} key - The translation key
   * @returns {string} Fallback translation or key
   */
  getFallbackTranslation(key) {
    if (this.fallbackEnabled && this.currentLocale !== this.defaultLocale) {
      const defaultTranslation = this.getTranslation(key, this.defaultLocale);
      if (defaultTranslation !== key) {
        return defaultTranslation;
      }
    }
    
    // Return the key itself as last resort
    return key;
  }

  /**
   * Interpolate variables in translation strings
   * @param {string} str - The string with placeholders like {{variable}}
   * @param {Object} params - The parameters to substitute
   * @returns {string} The interpolated string
   */
  interpolate(str, params) {
    return str.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return params[key] !== undefined ? params[key] : match;
    });
  }

  /**
   * Add translations dynamically
   * @param {string} locale - The locale code
   * @param {string} key - The translation key (supports nested keys)
   * @param {string} value - The translation value
   */
  addTranslation(locale, key, value) {
    if (!this.translations[locale]) {
      this.translations[locale] = {};
    }

    const keys = key.split('.');
    let target = this.translations[locale];
    
    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i];
      if (!(k in target)) {
        target[k] = {};
      }
      target = target[k];
    }
    
    target[keys[keys.length - 1]] = value;
  }
}

// Create global instance
window.i18n = new ClientI18n();

// Export for module systems if available
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ClientI18n;
}
