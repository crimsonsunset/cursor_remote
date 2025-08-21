/**
 * HTML i18n initialization
 * Applies translations to HTML elements when page loads
 */

function initializeHTMLI18n() {
  // Wait for i18n system to be ready
  if (typeof window.__ !== 'function') {
    // Retry after i18n system is loaded
    setTimeout(initializeHTMLI18n, 100);
    return;
  }

  try {
    console.log('🌐 Starting HTML i18n initialization...');
    
    // Generic data-i18n attribute handler
    document.querySelectorAll('[data-i18n]').forEach(element => {
      const translationKey = element.getAttribute('data-i18n');
      const translatedText = __(translationKey);
      
      if (translatedText && translatedText !== translationKey) {
        element.textContent = translatedText;
        console.log(`✅ Translated ${translationKey}: ${translatedText}`);
      }
    });

    // Handle data-i18n-placeholder attributes
    document.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
      const translationKey = element.getAttribute('data-i18n-placeholder');
      const translatedPlaceholder = __(translationKey);
      
      if (translatedPlaceholder && translatedPlaceholder !== translationKey) {
        element.placeholder = translatedPlaceholder;
        console.log(`✅ Translated placeholder ${translationKey}: ${translatedPlaceholder}`);
      }
    });

    // Fix specific remaining template tags that don't have data-i18n attributes
    document.querySelectorAll('*').forEach(element => {
      if (element.children.length === 0) { // Only text nodes
        const text = element.textContent?.trim();
        if (text && text.startsWith('html.') && !text.includes(' ')) {
          const translatedText = __(text);
          if (translatedText && translatedText !== text) {
            element.textContent = translatedText;
            console.log(`✅ Fixed template tag ${text}: ${translatedText}`);
          }
        }
      }
    });

    // Update button titles (tooltips) - keep existing logic for buttons without data-i18n
    const buttonMappings = {
      'historyButton': 'html.buttons.command_history',
      'statusButton': 'html.buttons.system_status',
      'recoveryButton': 'html.buttons.recover_lost_results', 
      'refreshButton': 'html.buttons.refresh_page_state',
      'themeToggle': 'html.buttons.toggle_theme',
      'sendButton': 'html.buttons.send'
    };

    Object.entries(buttonMappings).forEach(([elementId, translationKey]) => {
      const element = document.getElementById(elementId);
      if (element) {
        element.title = __(translationKey);
        // Also update aria-label if it exists
        if (element.hasAttribute('aria-label')) {
          element.setAttribute('aria-label', __(translationKey));
        }
      }
    });

    // Update GitHub link title
    const githubLink = document.querySelector('.github-link');
    if (githubLink) {
      githubLink.title = __('html.buttons.view_source_code');
    }

    // Update upload file button
    const uploadButton = document.querySelector('button[title*="上传"]');
    if (uploadButton) {
      uploadButton.title = __('html.buttons.upload_file');
    }

    console.log('✅ HTML i18n initialization complete');
  } catch (error) {
    console.error('❌ Error initializing HTML i18n:', error);
  }
}

/**
 * Update HTML comments to English (for development/maintenance)
 */
function updateHTMLComments() {
  // Note: HTML comments can't be updated via JavaScript
  // This is just a placeholder for documentation purposes
  // The actual comment translations need to be done in the HTML file directly
}

/**
 * Update status text based on connection state
 * @param {boolean} isConnected - Whether the connection is established
 */
function updateConnectionStatus(isConnected) {
  const statusText = document.getElementById('statusText');
  if (statusText) {
    statusText.textContent = isConnected ? 
      __('html.status.connected') : 
      __('html.status.disconnected');
  }
}

/**
 * Initialize when DOM is ready and i18n system is available
 */
function startHTMLI18n() {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      // Add a small delay to ensure all scripts are loaded
      setTimeout(initializeHTMLI18n, 200);
    });
  } else {
    // Add a small delay to ensure all scripts are loaded
    setTimeout(initializeHTMLI18n, 200);
  }
}

/**
 * Force re-run HTML i18n (for testing/debugging)
 */
function forceHTMLI18nUpdate() {
  initializeHTMLI18n();
}

// Auto-start HTML i18n initialization
startHTMLI18n();

// Expose utility functions globally
window.forceHTMLI18nUpdate = forceHTMLI18nUpdate;

// Expose utility functions globally
window.updateConnectionStatus = updateConnectionStatus;
