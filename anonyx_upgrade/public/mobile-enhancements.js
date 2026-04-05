/**
 * Mobile Enhancements: Swipe Gestures, Keyboard Handling, Language Switching
 * Works with i18n.js for multi-language support
 */

class MobileEnhancements {
  constructor() {
    this.touchStartX = 0;
    this.touchStartY = 0;
    this.touchEndX = 0;
    this.touchEndY = 0;
    this.lastKeyboardHeight = 0;
    this.isKeyboardOpen = false;
    this.swipeThreshold = 50; // pixels
    this.velocityThreshold = 0.5; // 0.5 pixels/ms
    this.lastSwipeTime = 0;
    this.swipeCooldown = 300; // ms between swipes
    this.initialized = false;
  }

  /**
   * Initialize mobile enhancements
   */
  init() {
    if (this.initialized) return;

    this.setupTouchListeners();
    this.setupKeyboardDetection();
    this.setupLanguageSelector();
    this.optimizeForMobile();

    window.addEventListener('orientationchange', () => this.handleOrientationChange());
    window.addEventListener('languageChanged', () => this.updateLanguageUI());

    this.initialized = true;
    console.log('Mobile enhancements initialized');
  }

  /**
   * Setup touch event listeners for swipe gestures
   */
  setupTouchListeners() {
    document.addEventListener('touchstart', (e) => this.handleTouchStart(e), false);
    document.addEventListener('touchend', (e) => this.handleTouchEnd(e), false);

    // Optional: track touch move for swipe visualization
    document.addEventListener('touchmove', (e) => this.handleTouchMove(e), false);
  }

  /**
   * Handle touch start
   */
  handleTouchStart(e) {
    this.touchStartX = e.changedTouches[0].screenX;
    this.touchStartY = e.changedTouches[0].screenY;
    this.touchStartTime = Date.now();
  }

  /**
   * Handle touch move (for visual feedback)
   */
  handleTouchMove(e) {
    // Optional: Add swipe visualization here
    // e.g., highlight swipe zones, show directional feedback
  }

  /**
   * Handle touch end - detect swipe direction and trigger action
   */
  handleTouchEnd(e) {
    const now = Date.now();
    const timeDiff = now - (this.touchStartTime || 0);

    this.touchEndX = e.changedTouches[0].screenX;
    this.touchEndY = e.changedTouches[0].screenY;

    const deltaX = this.touchEndX - this.touchStartX;
    const deltaY = this.touchEndY - this.touchStartY;

    // Ignore very quick or very slow swipes
    if (timeDiff < 100 || timeDiff > 1000) return;

    // Calculate velocity
    const velocity = Math.abs(deltaX) / timeDiff;

    // Detect horizontal swipe (ignore if mostly vertical)
    if (Math.abs(deltaY) > Math.abs(deltaX) * 0.5) {
      return; // Vertical scroll, not a swipe
    }

    // Swipe left (next chat / forward)
    if (deltaX < -this.swipeThreshold && velocity > this.velocityThreshold) {
      this.handleSwipeLeft(e);
      this.provideFeedback('haptic', 'medium');
    }

    // Swipe right (back / menu)
    if (deltaX > this.swipeThreshold && velocity > this.velocityThreshold) {
      this.handleSwipeRight(e);
      this.provideFeedback('haptic', 'medium');
    }
  }

  /**
   * Handle left swipe - next chat / forward action
   */
  handleSwipeLeft(e) {
    const now = Date.now();
    if (now - this.lastSwipeTime < this.swipeCooldown) return;
    this.lastSwipeTime = now;

    const skipButton = document.querySelector('[data-action="skip"]');
    if (skipButton && !skipButton.disabled) {
      console.log('Swipe left: Skip / Next');
      skipButton.click();
      this.showSwipeFeedback('← Skip');
    }
  }

  /**
   * Handle right swipe - back / menu
   */
  handleSwipeRight(e) {
    const now = Date.now();
    if (now - this.lastSwipeTime < this.swipeCooldown) return;
    this.lastSwipeTime = now;

    const backButton = document.querySelector('[data-action="back"]');
    if (backButton) {
      console.log('Swipe right: Back');
      backButton.click();
      this.showSwipeFeedback('Back →');
    }
  }

  /**
   * Show temporary swipe feedback
   */
  showSwipeFeedback(text) {
    const feedback = document.createElement('div');
    feedback.className = 'swipe-feedback';
    feedback.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(124, 92, 255, 0.9);
      color: white;
      padding: 12px 20px;
      border-radius: 8px;
      font-weight: 600;
      z-index: 9999;
      pointer-events: none;
      animation: fadeInOut 0.6s ease;
    `;
    feedback.textContent = text;

    document.body.appendChild(feedback);

    setTimeout(() => feedback.remove(), 600);
  }

  /**
   * Detect keyboard appearance/disappearance on mobile
   */
  setupKeyboardDetection() {
    let initialHeight = window.innerHeight;

    window.addEventListener('resize', () => {
      const currentHeight = window.innerHeight;
      const isScrolling = document.documentElement.scrollTop > 0 || document.body.scrollTop > 0;

      // Keyboard is shown if inner height decreased
      if (currentHeight < initialHeight - 100 && !isScrolling) {
        this.handleKeyboardOpen();
      } else if (currentHeight >= initialHeight - 50) {
        this.handleKeyboardClose();
      }

      initialHeight = currentHeight;
    });

    // iOS: Detect visual viewport changes
    if ('visualViewport' in window) {
      window.visualViewport.addEventListener('resize', () => {
        if (window.visualViewport.height < window.innerHeight - 100) {
          this.handleKeyboardOpen();
        } else {
          this.handleKeyboardClose();
        }
      });
    }

    // Focus on input: keyboard is about to open
    document.addEventListener('focusin', (e) => {
      if (e.target.matches('input, textarea')) {
        this.handleKeyboardOpen();
      }
    });

    document.addEventListener('focusout', (e) => {
      if (e.target.matches('input, textarea')) {
        setTimeout(() => this.handleKeyboardClose(), 300);
      }
    });
  }

  /**
   * Handle keyboard open
   */
  handleKeyboardOpen() {
    if (this.isKeyboardOpen) return;

    this.isKeyboardOpen = true;
    document.body.classList.add('keyboard-visible');

    // Scroll input into view
    const activeInput = document.activeElement;
    if (activeInput && (activeInput.tagName === 'INPUT' || activeInput.tagName === 'TEXTAREA')) {
      activeInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    // Scroll chat messages to bottom
    const messagesContainer = document.querySelector('[role="log"]');
    if (messagesContainer) {
      setTimeout(() => {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
      }, 100);
    }

    console.log('Keyboard opened');
  }

  /**
   * Handle keyboard close
   */
  handleKeyboardClose() {
    if (!this.isKeyboardOpen) return;

    this.isKeyboardOpen = false;
    document.body.classList.remove('keyboard-visible');

    console.log('Keyboard closed');
  }

  /**
   * Setup language selector dropdown
   */
  setupLanguageSelector() {
    // Check if selector exists
    const selector = document.querySelector('[data-component="language-selector"]');
    if (!selector) return;

    // Build language options
    const languages = i18n.getLanguages();
    const currentLang = i18n.currentLanguage;

    let html = '<div class="lang-dropdown">';
    languages.forEach(lang => {
      const isActive = lang.code === currentLang ? ' active' : '';
      html += `<button class="lang-option${isActive}" data-lang="${lang.code}" title="${lang.name}">✓ ${lang.name}</button>`;
    });
    html += '</div>';

    selector.innerHTML = html;

    // Add click handlers to language options
    selector.querySelectorAll('.lang-option').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const lang = btn.getAttribute('data-lang');
        i18n.setLanguage(lang);
      });
    });

    // Setup language selector button toggle
    const btn = document.querySelector('.lang-selector-btn');
    if (btn) {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        selector.style.display = selector.style.display === 'none' ? 'block' : 'none';
      });

      // Close dropdown when clicking outside
      document.addEventListener('click', () => {
        selector.style.display = 'none';
      });
    }
  }

  /**
   * Update language selector UI after language change
   */
  updateLanguageUI() {
    const selector = document.querySelector('[data-component="language-selector"]');
    if (!selector) return;

    // Remove active class from all options
    selector.querySelectorAll('.lang-option').forEach(btn => {
      btn.classList.remove('active');
    });

    // Add active class to current language
    const activeBtn = selector.querySelector(`[data-lang="${i18n.currentLanguage}"]`);
    if (activeBtn) {
      activeBtn.classList.add('active');
    }
  }

  /**
   * Optimize page for mobile
   */
  optimizeForMobile() {
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    if (isMobile) {
      // Add mobile class to body
      document.body.classList.add('mobile-device');

      // Prevent pinch zoom
      document.addEventListener('touchmove', (e) => {
        if (e.touches.length > 1) {
          e.preventDefault();
        }
      }, { passive: false });

      // Set viewport optimizations
      const metaViewport = document.querySelector('meta[name="viewport"]');
      if (metaViewport) {
        metaViewport.setAttribute('content',
          'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover'
        );
      }
    }

    // Detect if device supports haptic feedback
    this.hasHaptic = 'vibrate' in navigator;
  }

  /**
   * Handle orientation change (portrait/landscape)
   */
  handleOrientationChange() {
    console.log('Orientation changed to:', window.orientation);

    // Collapse dropdowns on orientation change
    document.querySelectorAll('.lang-dropdown').forEach(dropdown => {
      dropdown.style.display = 'none';
    });

    // Reposition fixed elements
    const inputArea = document.querySelector('.chat-input-area');
    if (inputArea) {
      inputArea.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }

  /**
   * Provide haptic or visual feedback
   */
  provideFeedback(type = 'haptic', intensity = 'light') {
    if (type === 'haptic' && this.hasHaptic) {
      const patterns = {
        light: 10,
        medium: 50,
        heavy: 100
      };
      navigator.vibrate(patterns[intensity] || 50);
    }
  }

  /**
   * Auto-hide address bar on scroll (mobile browsers)
   */
  setupAutoHideAddressBar() {
    let lastScrollTop = 0;
    const navbar = document.querySelector('nav');

    if (!navbar) return;

    window.addEventListener('scroll', () => {
      const scrollTop = window.scrollY;

      if (scrollTop > lastScrollTop) {
        // Scrolling down: hide
        navbar.style.transform = 'translateY(-100%)';
      } else {
        // Scrolling up: show
        navbar.style.transform = 'translateY(0)';
      }

      lastScrollTop = scrollTop <= 0 ? 0 : scrollTop;
    });
  }

  /**
   * Get device info
   */
  getDeviceInfo() {
    return {
      userAgent: navigator.userAgent,
      isMobile: /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent),
      isTablet: /iPad|Android(?!.*Mobile)/i.test(navigator.userAgent),
      isIOS: /iPhone|iPad|iPod/.test(navigator.userAgent),
      isAndroid: /Android/.test(navigator.userAgent),
      screenWidth: window.innerWidth,
      screenHeight: window.innerHeight,
      orientation: window.orientation,
      hasHaptic: 'vibrate' in navigator,
      connectionType: navigator.connection?.effectiveType || 'unknown'
    };
  }
}

// Create global instance and initialize
const mobileEnhancements = new MobileEnhancements();

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    // Wait for i18n to initialize first
    if (i18n && i18n.initialized) {
      mobileEnhancements.init();
    } else {
      // If i18n not ready, wait a bit
      setTimeout(() => mobileEnhancements.init(), 500);
    }
  });
} else {
  mobileEnhancements.init();
}

// CSS for swipe feedback animation (inject if not in stylesheet)
if (!document.querySelector('style[data-mobile-animations]')) {
  const style = document.createElement('style');
  style.setAttribute('data-mobile-animations', 'true');
  style.textContent = `
    @keyframes fadeInOut {
      0%, 100% { opacity: 0; }
      50% { opacity: 1; }
    }
    
    .lang-dropdown {
      position: absolute;
      top: 100%;
      right: 0;
      background: rgba(20, 20, 40, 0.98);
      backdrop-filter: blur(10px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 8px;
      min-width: 150px;
      z-index: 1000;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
    }
    
    .lang-option {
      display: block;
      width: 100%;
      text-align: left;
      padding: 12px 16px;
      background: none;
      border: none;
      color: white;
      cursor: pointer;
      font-size: 14px;
      transition: background 0.2s ease;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    }
    
    .lang-option:last-child {
      border-bottom: none;
    }
    
    .lang-option:hover,
    .lang-option.active {
      background: rgba(124, 92, 255, 0.2);
      color: var(--primary);
    }
    
    @media (hover: none) and (pointer: coarse) {
      .lang-option:active {
        background: rgba(124, 92, 255, 0.3);
      }
    }
  `;
  document.head.appendChild(style);
}
