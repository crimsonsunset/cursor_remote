/**
 * Initialize client-side i18n system
 * This script loads translations and sets up the i18n system
 */

// Load translations from JSON files
async function loadTranslations() {
  try {
    // Load both language files
    const [enResponse, zhResponse] = await Promise.all([
      fetch('./locales/en.json'),
      fetch('./locales/zh.json')
    ]);

    const enTranslations = await enResponse.json();
    const zhTranslations = await zhResponse.json();

    // Load translations into i18n system
    window.i18n.loadTranslations('en', enTranslations);
    window.i18n.loadTranslations('zh', zhTranslations);

    console.log('✅ Client i18n translations loaded successfully');
    console.log(`🌐 Available locales: ${window.i18n.getAvailableLocales().join(', ')}`);
    console.log(`🔤 Current locale: ${window.i18n.getLocale()}`);

    return true;
  } catch (error) {
    console.error('❌ Failed to load i18n translations:', error);
    return false;
  }
}

// Initialize i18n system when DOM is ready
function initI18n() {
  // Set default locale based on various sources
  let initialLocale = 'en';

  // Try to get locale from URL parameters
  const urlParams = new URLSearchParams(window.location.search);
  const urlLocale = urlParams.get('lang') || urlParams.get('locale');
  if (urlLocale && ['en', 'zh'].includes(urlLocale)) {
    initialLocale = urlLocale;
  }

  // Try to get locale from localStorage
  const savedLocale = localStorage.getItem('cursorRemote_locale');
  if (savedLocale && ['en', 'zh'].includes(savedLocale)) {
    initialLocale = savedLocale;
  }

  // Try to detect browser language
  const browserLang = navigator.language || navigator.userLanguage;
  if (browserLang.startsWith('zh')) {
    initialLocale = 'zh';
  }

  // Set initial locale
  window.i18n.setLocale(initialLocale);

  console.log(`🚀 Client i18n system initialized with locale: ${initialLocale}`);
}

// Utility function for easy access to translations
window.__ = function(key, params = {}) {
  return window.i18n.__(key, params);
};

// Utility function to switch language
window.switchLanguage = function(locale) {
  if (window.i18n.setLocale(locale)) {
    console.log(`🔄 Language switched to: ${locale}`);
    // Optionally reload page to apply changes
    // window.location.reload();
    return true;
  } else {
    console.error(`❌ Failed to switch to locale: ${locale}`);
    return false;
  }
};

// Auto-initialize when script loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    initI18n();
    loadTranslations();
  });
} else {
  initI18n();
  loadTranslations();
}
