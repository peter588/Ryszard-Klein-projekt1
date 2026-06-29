function setActiveLink(nav, href) {
  const links = nav.querySelectorAll('a');
  links.forEach((link) => {
    const isMatch = href === 'index.html'
      ? link.getAttribute('href') === 'index.html' || link.getAttribute('href') === '#home'
      : link.getAttribute('href') === href;
    link.classList.toggle('is-active', isMatch);
  });
}

function initStaticNav(nav, section) {
  const hrefMap = {
    home: 'index.html',
    ksiazki: 'index.html#droga-ciszy',
    'o-mnie': 'index.html#o-mnie',
    media: 'index.html#media',
    zakup: 'zakup_ksiazek.html',
    kontakt: 'index.html#kontakt'
  };

  setActiveLink(nav, hrefMap[section] || 'index.html');
}

function initScrollSpy(nav) {
  const sectionMap = [
    { id: 'home', href: '#home' },
    { id: 'droga-ciszy', href: '#droga-ciszy' },
    { id: 'o-mnie', href: '#o-mnie' },
    { id: 'media', href: '#media' },
    { id: 'kontakt', href: '#kontakt' }
  ];

  const sections = sectionMap
    .map((entry) => ({ ...entry, element: document.getElementById(entry.id) }))
    .filter((entry) => entry.element);

  if (!sections.length) {
    return;
  }

  const updateActiveSection = () => {
    const marker = window.scrollY + window.innerHeight * 0.32;
    let current = sections[0];

    sections.forEach((entry) => {
      if (entry.element.offsetTop <= marker) {
        current = entry;
      }
    });

    setActiveLink(nav, current.href);
  };

  updateActiveSection();
  window.addEventListener('scroll', updateActiveSection, { passive: true });
  window.addEventListener('hashchange', updateActiveSection);

  nav.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      const href = link.getAttribute('href');
      if (href && href.startsWith('#')) {
        setActiveLink(nav, href);
      }
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const nav = document.querySelector('.nav-links');
  const body = document.body;

  if (!nav || !body) {
    return;
  }

  if (body.dataset.scrollspy === 'true') {
    initScrollSpy(nav);
    return;
  }

  initStaticNav(nav, body.dataset.navSection || 'home');
});
