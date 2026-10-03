/*
文件说明: 承载公开站点全局前端增强，包括语言菜单、主题切换、公告独立关闭与重显、页头广告加载和通用行内说明浮层。
*/

let inlineHelpId = 0;
function initInlineHelp(root = document) {
  const buttons = root instanceof Element && root.matches('[data-inline-help]') ? [root] : Array.from(root.querySelectorAll('[data-inline-help]'));

  buttons.forEach(button => {
    if (button.dataset.helpInitialized) return;
    button.dataset.helpInitialized = 'true';
    const tipText = button.dataset.tip || '';
    if (!tipText) return;
    const tipId = `inline-help-tip-${inlineHelpId++}`;
    button.setAttribute('aria-describedby', tipId);
    button.setAttribute('aria-expanded', 'false');
    const tip = document.createElement('div');
    tip.id = tipId;
    tip.className = 'inline-help-tooltip public-floating-layer hidden';
    tip.classList.toggle('inline-help-tooltip-wide', button.hasAttribute('data-tip-wide'));
    tipText.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).forEach(part => {
      if (part.startsWith('`') && part.endsWith('`')) {
        const code = document.createElement('code');
        code.textContent = part.slice(1, -1);
        tip.appendChild(code);
      } else if (part.startsWith('**') && part.endsWith('**')) {
        const strong = document.createElement('strong');
        strong.textContent = part.slice(2, -2);
        tip.appendChild(strong);
      } else tip.appendChild(document.createTextNode(part));
    });
    const linkHref = button.dataset.tipHref;
    const linkLabel = button.dataset.tipLinkLabel;
    let link;
    if (linkHref && linkLabel) {
      tip.setAttribute('role', 'dialog');
      tip.setAttribute('aria-label', button.getAttribute('aria-label') || tipText);
      button.setAttribute('aria-controls', tipId);
      button.setAttribute('aria-haspopup', 'dialog');
      link = document.createElement('a');
      link.href = linkHref;
      link.className = 'inline-help-link';
      link.textContent = linkLabel;
      tip.append(document.createTextNode(' '), link);
    } else tip.setAttribute('role', 'tooltip');
    document.body.appendChild(tip);
    let hideTimeout;

    const positionTip = () => {
      const triggerRect = button.getBoundingClientRect();
      const tipRect = tip.getBoundingClientRect();
      const viewportPadding = 12;
      const top = Math.min(
        window.innerHeight - tipRect.height - viewportPadding,
        triggerRect.bottom + 8,
      );
      const left = Math.min(
        window.innerWidth - tipRect.width - viewportPadding,
        Math.max(viewportPadding, triggerRect.right - tipRect.width),
      );
      tip.style.top = `${Math.max(viewportPadding, top)}px`;
      tip.style.left = `${left}px`;
    };

    const showTip = () => {
      window.clearTimeout(hideTimeout);
      tip.classList.remove('hidden');
      button.setAttribute('aria-expanded', 'true');
      positionTip();
    };

    const hideTip = () => {
      tip.classList.add('hidden');
      button.setAttribute('aria-expanded', 'false');
    };

    const scheduleHide = () => {
      window.clearTimeout(hideTimeout);
      hideTimeout = window.setTimeout(() => {
        if (!link || !tip.contains(document.activeElement)) hideTip();
      }, 180);
    };

    button.addEventListener('click', showTip);
    if (link) {
      button.addEventListener('keydown', event => {
        if (event.key === 'Tab' && !event.shiftKey) {
          event.preventDefault();
          showTip();
          link.focus();
        }
      });
      link.addEventListener('click', hideTip);
      tip.addEventListener('focusin', showTip);
      tip.addEventListener('focusout', event => {
        if (!tip.contains(event.relatedTarget) && event.relatedTarget !== button) hideTip();
      });
      document.addEventListener('click', event => {
        if (!button.contains(event.target) && !tip.contains(event.target)) hideTip();
      });
      const dismiss = event => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        button.focus();
        hideTip();
      };
      button.addEventListener('keydown', dismiss);
      tip.addEventListener('keydown', dismiss);
    }
    button.addEventListener('mouseenter', showTip);
    button.addEventListener('focus', showTip);
    button.addEventListener('mouseleave', scheduleHide);
    button.addEventListener('blur', event => {
      if (!tip.contains(event.relatedTarget)) scheduleHide();
    });
    tip.addEventListener('mouseenter', showTip);
    tip.addEventListener('mouseleave', scheduleHide);
    window.addEventListener('resize', () => {
      if (!tip.classList.contains('hidden')) positionTip();
    });
    window.addEventListener('scroll', () => {
      if (!tip.classList.contains('hidden')) positionTip();
    }, true);
  });
}

function initAnnouncement() {
  const pendingAnnouncements = [];
  const showNextAnnouncement = () => {
    const next = pendingAnnouncements[0];
    if (!next) return;
    next.classList.remove('public-announcement-pending');
    next.removeAttribute('hidden');
  };

  document.querySelectorAll('[data-announcement-id]').forEach(announcement => {
    const button = announcement.querySelector('[data-dismiss-announcement]');
    if (!button) return;

    const storageKey = `cardnav-announcement-${announcement.dataset.announcementId}-dismissed-at`;
    const repeatAfterHours = Number(announcement.dataset.repeatAfterHours);
    let dismissedAt = null;
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored !== null && Number.isFinite(Number(stored))) dismissedAt = Number(stored);
    } catch {
      // 浏览器无法保存记录时，仍允许关闭当前页面上的公告。
    }

    const eligible = dismissedAt === null || (repeatAfterHours > 0 && Date.now() - dismissedAt >= repeatAfterHours * 60 * 60 * 1000);
    if (!eligible) return;
    pendingAnnouncements.push(announcement);

    button.addEventListener('click', () => {
      window.CardNavTelemetry?.track('button-click', { scope: 'site', action: 'dismiss-announcement' }, button);
      announcement.classList.add('public-announcement-pending');
      announcement.setAttribute('hidden', '');
      pendingAnnouncements.shift();
      showNextAnnouncement();
      try {
        localStorage.setItem(storageKey, String(Date.now()));
      } catch {
        // 浏览器无法保存记录时，仍允许关闭当前页面上的公告。
      }
    });
  });
  showNextAnnouncement();
}

function initPublicShell() {
  const languageMenus = Array.from(document.querySelectorAll('.shell-menu'));

  document.addEventListener('click', event => {
    languageMenus.forEach(menu => {
      if (menu instanceof HTMLDetailsElement && !menu.contains(event.target)) {
        menu.open = false;
      }
    });
  });

  const toggleTargets = [
    {
      moonIcon: document.getElementById('themeMoonIcon'),
      sunIcon: document.getElementById('themeSunIcon'),
      toggleBtn: document.getElementById('themeToggle'),
    },
    {
      moonIcon: document.getElementById('themeMoonIconDesktop'),
      sunIcon: document.getElementById('themeSunIconDesktop'),
      toggleBtn: document.getElementById('themeToggleDesktop'),
    },
  ].filter(target => target.moonIcon && target.sunIcon && target.toggleBtn);

  if (toggleTargets.length === 0) return;

  function getTheme() {
    return document.documentElement.getAttribute('data-theme') || 'light';
  }

  function updateIcons(theme) {
    toggleTargets.forEach(({ moonIcon, sunIcon }) => {
      if (theme === 'dark') {
        moonIcon.classList.add('hidden');
        sunIcon.classList.remove('hidden');
      } else {
        sunIcon.classList.add('hidden');
        moonIcon.classList.remove('hidden');
      }
    });
    document.dispatchEvent(new CustomEvent('themechange', { detail: { theme } }));
  }

  updateIcons(getTheme());

  toggleTargets.forEach(({ toggleBtn }) => {
    toggleBtn.addEventListener('click', () => {
      const nextTheme = getTheme() === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', nextTheme);
      document.documentElement.style.colorScheme = nextTheme;
      try { localStorage.setItem('theme', nextTheme); } catch { /* The active theme still applies when storage is unavailable. */ }
      updateIcons(nextTheme);
      window.CardNavTelemetry?.track('button-click', { scope: 'site', action: 'toggle-theme', theme: nextTheme }, toggleBtn);
    });
  });
}

function initHeaderAd() {
  const trigger = document.querySelector('meta[data-header-ad-loader]');
  if (!trigger) return;
  const container = [document.documentElement, document.body].filter(Boolean).pop();
  if (!container) return;
  const script = document.createElement('script');
  script.dataset.zone = trigger.getAttribute('data-zone') || '';
  script.src = trigger.getAttribute('data-src') || '';
  if (!script.dataset.zone || !script.src) return;
  container.appendChild(script);
}

initPublicShell();
initHeaderAd();
initInlineHelp();
// Deferred tables create category help after the initial page render.
for (const eventName of ['mouseenter', 'focus', 'click']) {
  document.addEventListener(eventName, event => {
    const target = event.target instanceof Element ? event.target.closest('[data-inline-help]') : null;
    if (target) initInlineHelp(target);
  }, true);
}
initAnnouncement();

// Reading anchors follow the visible shell, including announcements before the sticky header.
const readingHeader = document.querySelector('.site-header');
if (readingHeader) {
  let readingOffsetQueued = false;
  const updateReadingOffset = () => {
    readingOffsetQueued = false;
    const bottom = readingHeader.getBoundingClientRect().bottom;
    document.documentElement.style.setProperty('--reading-top-offset', `${Math.max(0, bottom) + 16}px`);
  };
  const queueReadingOffset = () => {
    if (!readingOffsetQueued) {
      readingOffsetQueued = true;
      requestAnimationFrame(updateReadingOffset);
    }
  };
  const shellSizeObserver = new ResizeObserver(updateReadingOffset);
  shellSizeObserver.observe(readingHeader);
  document.querySelectorAll('.public-announcement').forEach(element => shellSizeObserver.observe(element));
  window.addEventListener('scroll', queueReadingOffset, { passive: true });
  window.addEventListener('resize', queueReadingOffset);
  updateReadingOffset();
}

const navigationDialog = document.getElementById('site-navigation-dialog');
const navigationTrigger = document.querySelector('[data-open-navigation]');
if (navigationDialog instanceof HTMLDialogElement && navigationTrigger) {
  navigationTrigger.addEventListener('click', () => {
    navigationDialog.showModal();
    navigationTrigger.setAttribute('aria-expanded', 'true');
  });
  navigationDialog.querySelector('[data-close-navigation]')?.addEventListener('click', () => navigationDialog.close());
  navigationDialog.addEventListener('click', event => {
    if (event.target !== navigationDialog) return;
    const bounds = navigationDialog.getBoundingClientRect();
    if (event.clientX > bounds.right || event.clientY > bounds.bottom) navigationDialog.close();
  });
  navigationDialog.addEventListener('close', () => navigationTrigger.setAttribute('aria-expanded', 'false'));
}
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') document.querySelectorAll('.shell-menu[open]').forEach(menu => { menu.open = false; });
});
