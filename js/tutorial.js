// =============== INTERACTIVE TUTORIAL SYSTEM ===============

class Tutorial {
  constructor() {
    this.currentStep = 0;
    this.steps = [
      {
        target: '#timeline',
        title: 'Timeline Graph',
        message: 'Each dot represents a game across the entire season. Feel free to click and drag to select a specific date range.',
        position: 'bottom'
      },
      {
        target: '#bars',
        title: 'Beeswarm Chart',
        message: 'This graph shows the specific make and miss baskets within the selected date range.',
        position: 'bottom'
      },
      {
        target: '#player-stats-section, #player-card-container',
        title: 'Player Statistics',
        message: "This section shows the specific player's averaged statistics performance across the number of games played in the selected date range.",
        position: 'left'
      },
      {
        target: '.kpis, #key-insights',
        title: 'Key Performance Indicators',
        message: 'This section shows the key performance upon filtering "Home", "Away", or against a specific team.',
        position: 'bottom'
      },
      {
        target: '.controls',
        title: 'Filter Controls',
        message: 'By default, the selected date range is across the entire season.',
        position: 'bottom'
      }
    ];
    this.isActive = false;
  }

  start() {
    console.log('Tutorial: start() called, isActive:', this.isActive);
    if (this.isActive) return;
    
    this.isActive = true;
    this.currentStep = 0;
    console.log('Tutorial: Creating overlay...');
    this.createOverlay();
    console.log('Tutorial: Showing step 0...');
    this.showStep(0);
  }

  createOverlay() {
    console.log('Tutorial: createOverlay() called');
    // Create dark overlay
    const overlay = document.createElement('div');
    overlay.id = 'tutorial-overlay';
    // Add inline styles to ensure visibility
    overlay.style.cssText = `
      position: fixed !important;
      top: 0 !important;
      left: 0 !important;
      width: 100% !important;
      height: 100% !important;
      background-color: rgba(0, 0, 0, 0.5) !important;
      z-index: 999999 !important;
      opacity: 1 !important;
      display: block !important;
    `;
    overlay.innerHTML = `
      <div id="tutorial-highlight" style="position: absolute; border: 3px solid #FDB927; border-radius: 8px; z-index: 1000000; opacity: 0; transition: all 0.4s ease; background-color: transparent; box-shadow: none;"></div>
      <div id="tutorial-tooltip" style="position: fixed; background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); border: 2px solid #FDB927; border-radius: 12px; padding: 24px; max-width: 400px; min-width: 300px; box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5); z-index: 1000001; display: block; color: white;">
        <div class="tutorial-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; gap: 16px;">
          <h3 id="tutorial-title" style="color: #FDB927; font-size: 20px; font-weight: 700; margin: 0; flex: 1;"></h3>
          <div id="tutorial-step-indicator" style="background-color: #552583; color: #FDB927; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; white-space: nowrap; border: 1px solid #FDB927;"></div>
        </div>
        <p id="tutorial-message" style="color: #e0e0e0; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;"></p>
        <div class="tutorial-controls" style="display: flex; gap: 12px; justify-content: flex-end;">
          <button id="tutorial-skip" class="tutorial-btn tutorial-btn-skip" style="padding: 10px 20px; border: 1px solid #555; border-radius: 6px; font-size: 14px; font-weight: 600; cursor: pointer; background-color: transparent; color: #999; text-transform: uppercase;">Skip Tutorial</button>
          <button id="tutorial-next" class="tutorial-btn tutorial-btn-next" style="padding: 10px 20px; border: none; border-radius: 6px; font-size: 14px; font-weight: 600; cursor: pointer; background: linear-gradient(135deg, #FDB927 0%, #FFD700 100%); color: #1a1a2e; text-transform: uppercase; box-shadow: 0 4px 12px rgba(253, 185, 39, 0.4);">Next</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    console.log('Tutorial: Overlay appended to body');

    // Add event listeners
    document.getElementById('tutorial-skip').addEventListener('click', () => this.end());
    document.getElementById('tutorial-next').addEventListener('click', () => this.nextStep());
    
    // Allow clicking overlay to skip (optional)
    overlay.addEventListener('click', (e) => {
      if (e.target.id === 'tutorial-overlay') {
        this.end();
      }
    });
    console.log('Tutorial: Event listeners added');
  }

  showStep(stepIndex) {
    console.log('Tutorial: showStep() called with index:', stepIndex);
    if (stepIndex >= this.steps.length) {
      this.end();
      return;
    }

    const step = this.steps[stepIndex];
    console.log('Tutorial: Step data:', step);
    
    // Handle multiple targets (comma-separated selectors)
    const targets = step.target.split(',').map(t => t.trim());
    let targetElement = null;
    
    for (const selector of targets) {
      targetElement = document.querySelector(selector);
      if (targetElement) break;
    }
    
    if (!targetElement) {
      console.warn(`Tutorial target not found: ${step.target}`);
      this.nextStep();
      return;
    }
    
    console.log('Tutorial: Target element found:', targetElement);

    // Update step indicator
    const stepIndicator = document.getElementById('tutorial-step-indicator');
    const titleEl = document.getElementById('tutorial-title');
    const messageEl = document.getElementById('tutorial-message');
    const nextBtn = document.getElementById('tutorial-next');
    
    console.log('Tutorial: Elements found:', {
      stepIndicator: !!stepIndicator,
      titleEl: !!titleEl,
      messageEl: !!messageEl,
      nextBtn: !!nextBtn
    });
    
    if (stepIndicator) {
      stepIndicator.textContent = `${stepIndex + 1} of ${this.steps.length}`;
    }
    
    // Update content
    if (titleEl) titleEl.textContent = step.title;
    if (messageEl) messageEl.textContent = step.message;
    
    // Update "Next" button text for last step
    if (nextBtn) {
      if (stepIndex === this.steps.length - 1) {
        nextBtn.textContent = 'Finish';
      } else {
        nextBtn.textContent = 'Next';
      }
    }

    console.log('Tutorial: Calling highlightElement...');
    // Highlight the target element(s)
    this.highlightMultipleElements(targets, step.position);
  }

  highlightMultipleElements(selectors, position = 'bottom') {
    console.log('Tutorial: highlightMultipleElements() called with selectors:', selectors);
    const highlight = document.getElementById('tutorial-highlight');
    const tooltip = document.getElementById('tutorial-tooltip');
    
    if (!highlight || !tooltip) {
      console.error('Tutorial: highlight or tooltip element not found!');
      return;
    }
    
    // Get all matching elements
    const elements = selectors
      .map(selector => document.querySelector(selector))
      .filter(el => el !== null);
    
    if (elements.length === 0) {
      console.warn('Tutorial: No elements found for selectors:', selectors);
      return;
    }
    
    console.log('Tutorial: Found', elements.length, 'elements to highlight');
    
    // Calculate bounding box that encompasses all elements
    let minTop = Infinity, minLeft = Infinity;
    let maxBottom = -Infinity, maxRight = -Infinity;
    
    elements.forEach(element => {
      const rect = element.getBoundingClientRect();
      minTop = Math.min(minTop, rect.top);
      minLeft = Math.min(minLeft, rect.left);
      maxBottom = Math.max(maxBottom, rect.bottom);
      maxRight = Math.max(maxRight, rect.right);
    });
    
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
    
    // Scroll to center of combined area
    const centerY = (minTop + maxBottom) / 2;
    window.scrollTo({
      top: centerY + scrollTop - window.innerHeight / 2,
      behavior: 'smooth'
    });
    
    setTimeout(() => {
      // Recalculate after scroll
      minTop = Infinity; minLeft = Infinity;
      maxBottom = -Infinity; maxRight = -Infinity;
      
      elements.forEach(element => {
        const rect = element.getBoundingClientRect();
        minTop = Math.min(minTop, rect.top);
        minLeft = Math.min(minLeft, rect.left);
        maxBottom = Math.max(maxBottom, rect.bottom);
        maxRight = Math.max(maxRight, rect.right);
      });
      
      const padding = 10;
      const combinedRect = {
        top: minTop,
        left: minLeft,
        bottom: maxBottom,
        right: maxRight,
        width: maxRight - minLeft,
        height: maxBottom - minTop
      };
      
      // Position and size the highlight box to cover all elements
      highlight.style.top = `${combinedRect.top + scrollTop - padding}px`;
      highlight.style.left = `${combinedRect.left + scrollLeft - padding}px`;
      highlight.style.width = `${combinedRect.width + padding * 2}px`;
      highlight.style.height = `${combinedRect.height + padding * 2}px`;
      highlight.style.opacity = '1';
      highlight.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
      highlight.style.boxShadow = '0 0 0 9999px rgba(0, 0, 0, 0.5), 0 0 40px rgba(253, 185, 39, 0.8), inset 0 0 50px rgba(255, 255, 255, 0.1)';
      highlight.style.pointerEvents = 'none';
      
      console.log('Tutorial: Combined highlight positioned');
      
      // Position the tooltip relative to the combined area
      this.positionTooltip(tooltip, combinedRect, position, scrollTop, scrollLeft);
    }, 300);
  }

  highlightElement(element, position = 'bottom') {
    console.log('Tutorial: highlightElement() called');
    const highlight = document.getElementById('tutorial-highlight');
    const tooltip = document.getElementById('tutorial-tooltip');
    
    console.log('Tutorial: Highlight element:', highlight);
    console.log('Tutorial: Tooltip element:', tooltip);
    
    if (!highlight || !tooltip) {
      console.error('Tutorial: highlight or tooltip element not found!');
      return;
    }
    
    // Get element position
    const rect = element.getBoundingClientRect();
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
    
    console.log('Tutorial: Element rect:', rect);
    
    // Scroll element into view if needed
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    
    // Wait a bit for scroll to complete, then position highlight
    setTimeout(() => {
      const updatedRect = element.getBoundingClientRect();
      const padding = 10;
      
      // Position and size the highlight box
      highlight.style.top = `${updatedRect.top + scrollTop - padding}px`;
      highlight.style.left = `${updatedRect.left + scrollLeft - padding}px`;
      highlight.style.width = `${updatedRect.width + padding * 2}px`;
      highlight.style.height = `${updatedRect.height + padding * 2}px`;
      highlight.style.opacity = '1';
      highlight.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
      highlight.style.boxShadow = '0 0 0 9999px rgba(0, 0, 0, 0.5), 0 0 40px rgba(253, 185, 39, 0.8), inset 0 0 50px rgba(255, 255, 255, 0.1)';
      highlight.style.pointerEvents = 'none';
      
      console.log('Tutorial: Highlight positioned');
      
      // Position the tooltip
      this.positionTooltip(tooltip, updatedRect, position, scrollTop, scrollLeft);
    }, 300);
  }

  positionTooltip(tooltip, targetRect, position, scrollTop, scrollLeft) {
    console.log('Tutorial: positionTooltip() called');
    const gap = 20;
    let top, left;

    // Position the tooltip first to get its size
    tooltip.style.display = 'block';
    tooltip.style.visibility = 'visible';
    const tooltipRect = tooltip.getBoundingClientRect();

    // Use fixed positioning relative to viewport, not absolute
    switch (position) {
      case 'bottom':
        top = targetRect.bottom + gap;
        left = targetRect.left + (targetRect.width / 2) - (tooltipRect.width / 2);
        break;
      case 'top':
        top = targetRect.top - tooltipRect.height - gap;
        left = targetRect.left + (targetRect.width / 2) - (tooltipRect.width / 2);
        break;
      case 'left':
        top = targetRect.top + (targetRect.height / 2) - (tooltipRect.height / 2);
        left = targetRect.left - tooltipRect.width - gap;
        break;
      case 'right':
        top = targetRect.top + (targetRect.height / 2) - (tooltipRect.height / 2);
        left = targetRect.right + gap;
        break;
      default:
        top = targetRect.bottom + gap;
        left = targetRect.left + (targetRect.width / 2) - (tooltipRect.width / 2);
    }

    // Keep tooltip within viewport bounds
    const maxLeft = window.innerWidth - tooltipRect.width - 20;
    const minLeft = 20;
    left = Math.max(minLeft, Math.min(left, maxLeft));
    
    // Keep tooltip within vertical bounds
    const maxTop = window.innerHeight - tooltipRect.height - 20;
    const minTop = 20;
    top = Math.max(minTop, Math.min(top, maxTop));
    
    console.log('Tutorial: Tooltip position (fixed):', { top, left, width: tooltipRect.width, height: tooltipRect.height });
    
    // Apply position and make visible (using fixed positioning)
    tooltip.style.position = 'fixed';
    tooltip.style.top = `${top}px`;
    tooltip.style.left = `${left}px`;
    tooltip.style.opacity = '1';
    tooltip.style.transform = 'scale(1)';
    tooltip.style.display = 'block';
    tooltip.style.visibility = 'visible';
    
    console.log('Tutorial: Tooltip styles applied');
  }

  nextStep() {
    this.currentStep++;
    if (this.currentStep >= this.steps.length) {
      this.end();
    } else {
      // Fade out and fade in for smooth transition
      const highlight = document.getElementById('tutorial-highlight');
      const tooltip = document.getElementById('tutorial-tooltip');
      
      highlight.style.opacity = '0';
      tooltip.style.opacity = '0';
      tooltip.style.transform = 'scale(0.9)';
      
      setTimeout(() => {
        this.showStep(this.currentStep);
      }, 300);
    }
  }

  end() {
    const overlay = document.getElementById('tutorial-overlay');
    if (overlay) {
      overlay.style.opacity = '0';
      setTimeout(() => {
        overlay.remove();
      }, 300);
    }
    this.isActive = false;
  }

  static shouldShowTutorial() {
    // Check if tutorial has been shown before
    return !localStorage.getItem('lakersAnalysisTutorialShown');
  }

  static reset() {
    // For testing: reset tutorial so it shows again
    localStorage.removeItem('lakersAnalysisTutorialShown');
  }
}

// Global tutorial instance
window.tutorialInstance = new Tutorial();

// Auto-start tutorial on page load (every time)
window.addEventListener('load', () => {
  console.log('Tutorial: Page loaded, starting tutorial in 1 second...');
  // Wait a bit for all visualizations to load
  setTimeout(() => {
    console.log('Tutorial: Starting now...');
    window.tutorialInstance.start();
  }, 1500);
});

// Also try DOMContentLoaded as backup
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    console.log('Tutorial: DOM ready');
  });
} else {
  console.log('Tutorial: DOM already ready');
}

// Expose function to manually start tutorial (for testing or user-triggered restart)
window.startTutorial = () => {
  console.log('Tutorial: Manual start triggered');
  window.tutorialInstance.start();
};

// Expose function to reset tutorial flag (for development/testing)
window.resetTutorial = () => {
  Tutorial.reset();
  console.log('Tutorial reset. Reload the page to see it again.');
};
