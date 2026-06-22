(function () {
  const navToggle = document.querySelector('[data-menu-toggle]');
  const navLinks = document.querySelector('[data-nav-links]');

  if (navToggle && navLinks) {
    navToggle.addEventListener('click', () => {
      const isOpen = navLinks.classList.toggle('is-open');
      navToggle.setAttribute('aria-expanded', String(isOpen));
    });

    navLinks.addEventListener('click', (event) => {
      if (event.target.closest('a')) {
        navLinks.classList.remove('is-open');
        navToggle.setAttribute('aria-expanded', 'false');
      }
    });
  }

  const currentPath = window.location.pathname.replace(/\/index\.html$/, '/');
  document.querySelectorAll('[data-nav-link]').forEach((link) => {
    const href = link.getAttribute('href');
    if (!href) return;
    const normalized = new URL(href, window.location.origin).pathname;
    if (
      (normalized === '/' && currentPath === '/') ||
      (normalized !== '/' && currentPath.startsWith(normalized))
    ) {
      link.setAttribute('aria-current', 'page');
    }
  });

  document.querySelectorAll('[data-segment-group]').forEach((group) => {
    const targetSelector = group.getAttribute('data-segment-group');
    const target = targetSelector ? document.querySelector(targetSelector) : null;
    const segments = Array.from(group.querySelectorAll('[data-segment]'));
    segments.forEach((segment) => {
      segment.addEventListener('click', () => {
        segments.forEach((item) => item.setAttribute('aria-pressed', 'false'));
        segment.setAttribute('aria-pressed', 'true');
        if (target) {
          target.value = segment.getAttribute('data-segment') || target.value;
          target.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
    });
  });

  const planSelect = document.querySelector('[data-plan-select]');
  const planSummary = document.querySelector('[data-plan-summary]');
  const planPrice = document.querySelector('[data-plan-price]');
  const giftRecipient = document.querySelector('[data-gift-recipient]');
  const giftRecipientName = document.querySelector('[data-gift-recipient-name]');
  const giftNote = document.querySelector('[data-gift-note]');
  const giftNotePreview = document.querySelector('[data-gift-note-preview]');

  const prices = {
    monthly: '$8 monthly',
    annual: '$72 yearly',
    gift: '$72 gift year',
  };

  function updateGiftPreview() {
    if (planSelect && planSummary) {
      const value = planSelect.value || 'gift';
      planSummary.textContent = value === 'annual'
        ? 'One year of Our Little World'
        : value === 'monthly'
          ? 'First month of Our Little World'
          : 'Gift year of Our Little World';
      if (planPrice) planPrice.textContent = prices[value] || prices.gift;
    }

    if (giftRecipient && giftRecipientName) {
      giftRecipientName.textContent = giftRecipient.value.trim() || 'your friend';
    }

    if (giftNote && giftNotePreview) {
      giftNotePreview.textContent = giftNote.value.trim()
        || 'I wanted to give you a quiet place to keep the tiny moments before they blur together.';
    }
  }

  [planSelect, giftRecipient, giftNote].forEach((field) => {
    if (field) field.addEventListener('input', updateGiftPreview);
    if (field) field.addEventListener('change', updateGiftPreview);
  });
  updateGiftPreview();

  document.querySelectorAll('[data-demo-form]').forEach((form) => {
    const status = form.querySelector('[data-form-status]');
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const required = Array.from(form.querySelectorAll('[required]'));
      const firstInvalid = required.find((field) => !field.value.trim());
      if (firstInvalid) {
        firstInvalid.focus();
        if (status) {
          status.textContent = 'Please complete the highlighted field before continuing.';
          status.classList.add('is-visible');
        }
        return;
      }

      const kind = form.getAttribute('data-demo-form');
      if (status) {
        if (kind === 'gift') {
          status.textContent = 'Your gift checkout is ready. The next step is payment and delivery confirmation.';
        } else if (kind === 'partner') {
          status.textContent = 'Your partner inquiry is ready to send. We will follow up with package options.';
        } else {
          status.textContent = 'Your family checkout is ready. The next step is payment confirmation.';
        }
        status.classList.add('is-visible');
      }
      form.dispatchEvent(new CustomEvent('olw:demo-submit', { bubbles: true }));
    });
  });

  if (window.lucide) {
    window.lucide.createIcons({
      attrs: {
        'stroke-width': 1.8,
      },
    });
  }
})();
