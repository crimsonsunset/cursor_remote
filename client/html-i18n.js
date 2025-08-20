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
    // Update page title
    document.title = __('html.page_title');

    // Update main app title
    const appTitle = document.querySelector('.app-title');
    if (appTitle) {
      appTitle.textContent = __('html.app_title');
    }

    // Update button titles (tooltips)
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

    // Update status text
    const statusText = document.getElementById('statusText');
    if (statusText && statusText.textContent.includes('未连接')) {
      statusText.textContent = __('html.status.disconnected');
    }

    // Update welcome message
    const welcomeMessage = document.querySelector('.welcome-message p');
    if (welcomeMessage) {
      welcomeMessage.textContent = __('html.welcome.text');
    }

    // Update input placeholder
    const messageInput = document.getElementById('messageInput');
    if (messageInput) {
      messageInput.placeholder = __('html.input.placeholder');
    }

    // Update comments
    updateHTMLComments();

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
    document.addEventListener('DOMContentLoaded', initializeHTMLI18n);
  } else {
    initializeHTMLI18n();
  }
}

// Auto-start HTML i18n initialization
startHTMLI18n();

// Expose utility functions globally
window.updateConnectionStatus = updateConnectionStatus;
