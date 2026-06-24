/*
文件说明: 承载公开站点全局前端增强，包括语言菜单、主题切换和页头广告加载。
*/

function initPublicShell() {
  const languageMenus = Array.from(document.querySelectorAll('[data-language-menu]'));

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
      localStorage.setItem('theme', nextTheme);
      updateIcons(nextTheme);
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
