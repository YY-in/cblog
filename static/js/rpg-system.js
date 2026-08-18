/**
 * RPG Gamification System
 * Cyberpunk-themed visitor XP & achievement tracker
 * Uses localStorage for persistence, sessionStorage for per-session dedup
 */
(function () {
  'use strict';

  // ── Theme detection ──────────────────────────────────────────────
  function isLight() {
    return document.documentElement.classList.contains('light');
  }

  // ── Palette & Fonts ──────────────────────────────────────────────
  function getColors() {
    var light = isLight();
    return {
      primary:   light ? '#d92323' : '#f5e642',
      secondary: light ? '#0d0d0d' : '#00d4ff',
      tertiary:  light ? '#732424' : '#ff2d78',
      bg:        light ? '#faf7f3' : '#131318',
      bgAlpha:   light ? 'rgba(250,247,243,0.92)' : 'rgba(19,19,24,0.92)',
    };
  }
  var C = getColors();
  var FONT_HEADLINE = "'Orbitron', sans-serif";
  var FONT_LABEL    = "'Share Tech Mono', monospace";

  // ── Inject global styles (re-injectable on theme change) ─────────
  var styleEl = document.createElement('style');
  styleEl.id = 'rpg-system-styles';

  function injectStyles() {
    C = getColors();
    styleEl.textContent = [
      '@keyframes rpg-slide-in  { from { transform: translateX(120%); opacity:0; } to { transform: translateX(0); opacity:1; } }',
      '@keyframes rpg-slide-out { from { transform: translateX(0); opacity:1; } to { transform: translateX(120%); opacity:0; } }',
      '@keyframes rpg-glitch {',
      '  0%   { text-shadow: 2px 0 ' + C.tertiary + ', -2px 0 ' + C.secondary + '; }',
      '  20%  { text-shadow: -2px 1px ' + C.tertiary + ', 2px -1px ' + C.secondary + '; }',
      '  40%  { text-shadow: 2px -1px ' + C.tertiary + ', -2px 1px ' + C.secondary + '; }',
      '  60%  { text-shadow: -1px 2px ' + C.tertiary + ', 1px -2px ' + C.secondary + '; }',
      '  80%  { text-shadow: 1px -2px ' + C.tertiary + ', -1px 2px ' + C.secondary + '; }',
      '  100% { text-shadow: 2px 0 ' + C.tertiary + ', -2px 0 ' + C.secondary + '; }',
      '}',
      '@keyframes rpg-bar-pulse { 0%,100%{ box-shadow: 0 0 4px ' + C.primary + '44; } 50%{ box-shadow: 0 0 8px ' + C.primary + '88; } }',
      '.rpg-toast-in  { animation: rpg-slide-in .4s ease-out forwards; }',
      '.rpg-toast-out { animation: rpg-slide-out .35s ease-in forwards; }',
      '.rpg-glitch    { animation: rpg-glitch .3s ease-in-out 3; }',
    ].join('\n');
  }
  injectStyles();
  document.head.appendChild(styleEl);

  // ── Helpers ──────────────────────────────────────────────────────
  function getJSON(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) || fallback; }
    catch (_) { return fallback; }
  }
  function setJSON(key, val) { localStorage.setItem(key, JSON.stringify(val)); }
  function sessionFlag(key)  { return !!sessionStorage.getItem(key); }
  function setSessionFlag(k) { sessionStorage.setItem(k, '1'); }

  // ── XP / Level maths ────────────────────────────────────────────
  var MAX_LEVEL = 50;

  function calcLevel(xp) {
    var lvl = Math.floor(Math.sqrt(xp / 25)) + 1;
    return Math.min(lvl, MAX_LEVEL);
  }
  function xpForLevel(lvl) {
    // XP needed to *reach* this level: (lvl-1)^2 * 25
    return (lvl - 1) * (lvl - 1) * 25;
  }

  // ── Achievement definitions ──────────────────────────────────────
  var ACHIEVEMENT_DEFS = [
    { id: 'first_boot', name: 'FIRST_BOOT',  desc: 'Visit any page',               xp: 0  },
    { id: 'explorer',   name: 'FULL_RECON',   desc: 'Visit all 5 main pages',       xp: 50 },
    { id: 'deep_dive',  name: 'DEEP_DIVE',    desc: 'View 3+ project detail pages', xp: 40 },
    { id: 'polyglot',   name: 'POLYGLOT',     desc: 'Switch language',              xp: 25 },
    { id: 'audiophile', name: 'AUDIOPHILE',    desc: 'Play music',                   xp: 20 },
    { id: 'data_miner', name: 'DATA_MINER',   desc: 'Read 3+ blog posts',           xp: 40 },
    { id: 'max_level',  name: 'LEVEL_MAX',    desc: 'Reach level 10+',              xp: 100},
    { id: 'night_owl',  name: 'NIGHT_OWL',    desc: 'Visit between 00:00-05:00',    xp: 30 },
    { id: 'speed_runner',name:'SPEED_RUNNER',  desc: 'Visit 5 pages in 60 seconds',  xp: 60 },
  ];

  function defById(id) {
    for (var i = 0; i < ACHIEVEMENT_DEFS.length; i++) {
      if (ACHIEVEMENT_DEFS[i].id === id) return ACHIEVEMENT_DEFS[i];
    }
    return null;
  }

  // ── Toast system ─────────────────────────────────────────────────
  var toastStack = [];

  function showToast(achDef) {
    C = getColors();
    var el = document.createElement('div');
    var yOffset = 100 + toastStack.length * 72;
    el.className = 'rpg-toast-in';
    el.style.cssText = [
      'position:fixed', 'right:16px', 'bottom:' + yOffset + 'px', 'z-index:9999',
      'background:' + C.bg, 'border-left:4px solid ' + C.primary,
      'border-top:1px solid ' + C.primary + '30', 'border-bottom:1px solid ' + C.primary + '30',
      'border-right:1px solid ' + C.primary + '15',
      'padding:10px 16px', 'display:flex', 'align-items:center', 'gap:10px',
      'min-width:240px', 'max-width:320px',
      'box-shadow:0 0 20px ' + C.primary + '26, inset 0 0 30px ' + C.primary + '08',
      'font-family:' + FONT_LABEL, 'pointer-events:none',
    ].join(';');

    var icon = document.createElement('span');
    icon.className = 'material-symbols-outlined';
    icon.style.cssText = 'font-size:24px;color:' + C.primary + ';';
    icon.textContent = 'emoji_events';

    var textWrap = document.createElement('div');
    textWrap.style.cssText = 'display:flex;flex-direction:column;gap:2px;';

    var nameEl = document.createElement('div');
    nameEl.className = 'rpg-glitch';
    nameEl.style.cssText = 'color:' + C.primary + ';font-size:12px;font-weight:700;letter-spacing:2px;font-family:' + FONT_HEADLINE + ';';
    nameEl.textContent = achDef.name;

    var xpEl = document.createElement('div');
    xpEl.style.cssText = 'color:' + C.secondary + ';font-size:10px;letter-spacing:1px;';
    xpEl.textContent = achDef.xp > 0 ? '+' + achDef.xp + ' XP' : 'ACHIEVEMENT UNLOCKED';

    textWrap.appendChild(nameEl);
    textWrap.appendChild(xpEl);
    el.appendChild(icon);
    el.appendChild(textWrap);
    document.body.appendChild(el);
    toastStack.push(el);

    setTimeout(function () {
      el.className = 'rpg-toast-out';
      setTimeout(function () {
        if (el.parentNode) el.parentNode.removeChild(el);
        var idx = toastStack.indexOf(el);
        if (idx !== -1) toastStack.splice(idx, 1);
        // Reposition remaining
        toastStack.forEach(function (t, i) {
          t.style.bottom = (100 + i * 72) + 'px';
        });
      }, 400);
    }, 3000);
  }

  // ── HUD XP Bar ───────────────────────────────────────────────────
  var hud, hudLevel, hudBarFill, popup;

  function buildHUD() {
    C = getColors();
    // Mini HUD
    hud = document.createElement('div');
    hud.id = 'rpg-hud';
    hud.style.cssText = [
      'position:fixed', 'bottom:16px', 'right:16px', 'z-index:100',
      'background:' + C.bgAlpha, 'border:1px solid ' + C.primary + '4d',
      'height:28px', 'box-sizing:border-box', 'padding:0 12px', 'cursor:pointer', 'user-select:none',
      'display:flex', 'align-items:center', 'gap:8px',
      'font-family:' + FONT_LABEL, 'font-size:11px', 'color:' + C.primary,
      'letter-spacing:1px', 'width:120px', 'box-sizing:border-box',
      'backdrop-filter:blur(6px)', '-webkit-backdrop-filter:blur(6px)',
    ].join(';');

    hudLevel = document.createElement('span');
    hudLevel.style.cssText = 'white-space:nowrap;font-weight:700;font-family:' + FONT_HEADLINE + ';font-size:10px;';

    var barWrap = document.createElement('div');
    barWrap.style.cssText = 'flex:1;height:5px;background:' + C.primary + '1a;position:relative;overflow:hidden;';

    hudBarFill = document.createElement('div');
    hudBarFill.style.cssText = 'height:100%;background:' + C.primary + ';transition:width .4s ease;animation:rpg-bar-pulse 2s infinite;width:0%;';
    barWrap.appendChild(hudBarFill);

    hud.appendChild(hudLevel);
    hud.appendChild(barWrap);
    document.body.appendChild(hud);

    hud.addEventListener('click', function (e) {
      e.stopPropagation();
      togglePopup();
    });
  }

  function updateHUD() {
    C = getColors();
    var xp  = RPG.getXP();
    var lvl = RPG.getLevel();
    var cur = xpForLevel(lvl);
    var nxt = xpForLevel(Math.min(lvl + 1, MAX_LEVEL + 1));
    var pct = nxt > cur ? Math.min(((xp - cur) / (nxt - cur)) * 100, 100) : 100;

    hudLevel.textContent = 'LVL ' + lvl;
    hudBarFill.style.width = pct.toFixed(1) + '%';

    // Re-apply theme colors to HUD elements
    hud.style.background = C.bgAlpha;
    hud.style.borderColor = C.primary + '4d';
    hud.style.color = C.primary;
    hudBarFill.style.background = C.primary;

    // Also update popup if open
    if (popup && popup.style.display !== 'none') renderPopupContent();
  }

  // ── Popup ────────────────────────────────────────────────────────
  function buildPopup() {
    C = getColors();
    popup = document.createElement('div');
    popup.id = 'rpg-popup';
    popup.style.cssText = [
      'position:fixed', 'bottom:104px', 'right:16px', 'z-index:101',
      'background:' + C.bg, 'border:1px solid ' + C.primary + '4d',
      'padding:20px', 'display:none', 'min-width:260px', 'max-width:300px',
      'box-shadow:0 0 30px ' + C.primary + '1f',
      'font-family:' + FONT_LABEL, 'color:' + (isLight() ? '#1a1a1a' : '#e4e1e9'), 'font-size:11px',
      'max-height:70vh', 'overflow-y:auto',
      'backdrop-filter:blur(8px)', '-webkit-backdrop-filter:blur(8px)',
    ].join(';');
    document.body.appendChild(popup);

    // Close on outside click
    document.addEventListener('click', function (e) {
      if (popup.style.display !== 'none' && !popup.contains(e.target) && !hud.contains(e.target)) {
        popup.style.display = 'none';
      }
    });
  }

  function renderPopupContent() {
    C = getColors();
    // Re-apply theme to popup container
    popup.style.background = C.bg;
    popup.style.borderColor = C.primary + '4d';
    popup.style.boxShadow = '0 0 30px ' + C.primary + '1f';
    popup.style.color = isLight() ? '#1a1a1a' : '#e4e1e9';

    var xp  = RPG.getXP();
    var lvl = RPG.getLevel();
    var cur = xpForLevel(lvl);
    var nxt = xpForLevel(Math.min(lvl + 1, MAX_LEVEL + 1));
    var toNext = Math.max(nxt - xp, 0);
    var unlocked = RPG.achievements.getAll();

    var html = '';

    // Header
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">';
    html += '<span style="font-family:' + FONT_HEADLINE + ';color:' + C.primary + ';font-size:14px;font-weight:700;letter-spacing:2px;">PROFILE</span>';
    html += '<span id="rpg-popup-close" style="cursor:pointer;color:' + C.tertiary + ';font-size:18px;line-height:1;">&times;</span>';
    html += '</div>';

    // Stats
    html += '<div style="display:flex;flex-direction:column;gap:6px;margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid ' + C.primary + '22;">';
    html += '<div style="display:flex;justify-content:space-between;"><span style="color:' + C.primary + '99;">LEVEL</span><span style="color:' + C.primary + ';font-weight:700;">' + lvl + '</span></div>';
    html += '<div style="display:flex;justify-content:space-between;"><span style="color:' + C.primary + '99;">TOTAL XP</span><span style="color:' + C.secondary + ';">' + xp + '</span></div>';
    html += '<div style="display:flex;justify-content:space-between;"><span style="color:' + C.primary + '99;">NEXT LVL</span><span style="color:' + C.secondary + ';">' + (lvl >= MAX_LEVEL ? 'MAX' : toNext + ' XP') + '</span></div>';
    html += '</div>';

    // Achievements
    html += '<div style="font-family:' + FONT_HEADLINE + ';color:' + C.primary + ';font-size:11px;letter-spacing:2px;margin-bottom:10px;">ACHIEVEMENTS</div>';

    ACHIEVEMENT_DEFS.forEach(function (def) {
      var isUnlocked = unlocked.indexOf(def.id) !== -1;
      html += '<div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid ' + C.primary + '0d;' + (isUnlocked ? '' : 'opacity:0.35;') + '">';
      if (isUnlocked) {
        html += '<span class="material-symbols-outlined" style="font-size:16px;color:' + C.primary + ';">check_circle</span>';
        var descColor = isLight() ? '#666' : '#999';
        html += '<div><div style="color:' + C.primary + ';font-size:11px;letter-spacing:1px;">' + def.name + '</div>';
        html += '<div style="color:' + descColor + ';font-size:9px;">' + def.desc + '</div></div>';
      } else {
        var lockedColor = isLight() ? '#aaa' : '#555';
        var lockedText = isLight() ? '#999' : '#666';
        var lockedSub = isLight() ? '#bbb' : '#444';
        html += '<span class="material-symbols-outlined" style="font-size:16px;color:' + lockedColor + ';">lock</span>';
        html += '<div><div style="color:' + lockedText + ';font-size:11px;letter-spacing:1px;">???</div>';
        html += '<div style="color:' + lockedSub + ';font-size:9px;">LOCKED</div></div>';
      }
      html += '</div>';
    });

    popup.innerHTML = html;

    // Bind close
    var closeBtn = document.getElementById('rpg-popup-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        popup.style.display = 'none';
      });
    }
  }

  function togglePopup() {
    if (popup.style.display === 'none' || !popup.style.display) {
      renderPopupContent();
      popup.style.display = 'block';
    } else {
      popup.style.display = 'none';
    }
  }

  // ── Core RPG object ──────────────────────────────────────────────
  var RPG = {
    onXPGain: null,

    getXP: function () {
      return parseInt(localStorage.getItem('rpg_xp'), 10) || 0;
    },

    getLevel: function () {
      return calcLevel(this.getXP());
    },

    addXP: function (amount, source) {
      if (source) {
        var flag = 'rpg_xp_' + source;
        if (sessionFlag(flag)) return; // already awarded this session
        setSessionFlag(flag);
      }
      var prev = this.getXP();
      var newXP = prev + amount;
      localStorage.setItem('rpg_xp', newXP);

      if (typeof this.onXPGain === 'function') {
        this.onXPGain(amount, source, newXP);
      }

      updateHUD();
      checkLevelAchievement();
    },

    achievements: {
      unlock: function (id) {
        var list = getJSON('rpg_achievements', []);
        if (list.indexOf(id) !== -1) return false; // already unlocked
        list.push(id);
        setJSON('rpg_achievements', list);

        var def = defById(id);
        if (def) {
          showToast(def);
          if (def.xp > 0) {
            // Award achievement XP (bypass session dedup)
            var prev = RPG.getXP();
            localStorage.setItem('rpg_xp', prev + def.xp);
            updateHUD();
          }
        }
        return true;
      },

      isUnlocked: function (id) {
        var list = getJSON('rpg_achievements', []);
        return list.indexOf(id) !== -1;
      },

      getAll: function () {
        return getJSON('rpg_achievements', []);
      },
    },
  };

  window.RPG = RPG;

  // ── Page detection ───────────────────────────────────────────────
  function currentPath() {
    return window.location.pathname.replace(/\/+$/, '') || '/';
  }

  var PAGE_XP = {
    '/':         { amount: 10, source: 'visit_home' },
    '/about':    { amount: 15, source: 'visit_about' },
    '/projects': { amount: 15, source: 'visit_projects' },
    '/skills':   { amount: 15, source: 'visit_skills' },
    '/contact':  { amount: 10, source: 'visit_contact' },
    '/blog':     { amount: 10, source: 'visit_blog' },
  };

  var MAIN_PAGES = ['/', '/about', '/projects', '/skills', '/contact'];

  function awardPageXP() {
    var path = currentPath();
    var entry = PAGE_XP[path];
    if (entry) {
      RPG.addXP(entry.amount, entry.source);
    } else if (path.indexOf('/projects/') === 0) {
      RPG.addXP(20, 'visit_project_' + path);
    } else if (path.indexOf('/blog/') === 0) {
      RPG.addXP(10, 'visit_blogpost_' + path);
    }
  }

  // ── Achievement checkers ─────────────────────────────────────────
  function recordVisit(path) {
    var visits = getJSON('rpg_visits', []);
    if (visits.indexOf(path) === -1) {
      visits.push(path);
      setJSON('rpg_visits', visits);
    }
  }

  function recordTimestamp() {
    var ts = getJSON('rpg_timestamps', []);
    ts.push(Date.now());
    // Keep only last 20
    if (ts.length > 20) ts = ts.slice(-20);
    setJSON('rpg_timestamps', ts);
  }

  function checkAchievements() {
    var path = currentPath();

    // first_boot
    RPG.achievements.unlock('first_boot');

    // Record this visit
    recordVisit(path);
    recordTimestamp();

    // explorer - all 5 main pages
    var visits = getJSON('rpg_visits', []);
    var allMain = MAIN_PAGES.every(function (p) { return visits.indexOf(p) !== -1; });
    if (allMain) RPG.achievements.unlock('explorer');

    // deep_dive - 3+ project detail pages
    var projVisits = visits.filter(function (v) { return v.indexOf('/projects/') === 0; });
    if (projVisits.length >= 3) RPG.achievements.unlock('deep_dive');

    // data_miner - 3+ blog posts
    var blogVisits = visits.filter(function (v) { return v.indexOf('/blog/') === 0; });
    if (blogVisits.length >= 3) RPG.achievements.unlock('data_miner');

    // night_owl - visit between 00:00-05:00
    var hour = new Date().getHours();
    if (hour >= 0 && hour < 5) RPG.achievements.unlock('night_owl');

    // speed_runner - 5 pages within 60 seconds
    var ts = getJSON('rpg_timestamps', []);
    if (ts.length >= 5) {
      var recent = ts.slice(-5);
      if (recent[4] - recent[0] <= 60000) RPG.achievements.unlock('speed_runner');
    }

    // max_level
    checkLevelAchievement();
  }

  function checkLevelAchievement() {
    if (RPG.getLevel() >= 10) RPG.achievements.unlock('max_level');
  }

  // ── Scroll-to-bottom detection ───────────────────────────────────
  function setupScrollDetection() {
    var awarded = false;
    function onScroll() {
      if (awarded) return;
      var scrollTop = window.pageYOffset || document.documentElement.scrollTop;
      var scrollHeight = document.documentElement.scrollHeight;
      var clientHeight = document.documentElement.clientHeight;
      if (scrollTop + clientHeight >= scrollHeight - 50) {
        awarded = true;
        RPG.addXP(10, 'scroll_bottom_' + currentPath());
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  // ── Music play detection ─────────────────────────────────────────
  function setupMusicDetection() {
    // Watch the play icon for text change to 'pause' (means music started)
    var playIcon = document.getElementById('mp-play-icon');
    if (playIcon) {
      var observer = new MutationObserver(function (mutations) {
        mutations.forEach(function (m) {
          if (playIcon.textContent === 'pause') {
            RPG.addXP(20, 'play_music');
            RPG.achievements.unlock('audiophile');
          }
        });
      });
      observer.observe(playIcon, { childList: true, characterData: true, subtree: true });
    }
  }

  // ── Language switch detection ────────────────────────────────────
  function setupLangDetection() {
    document.addEventListener('click', function (e) {
      var link = e.target.closest('.lang-switch');
      if (link) {
        RPG.addXP(25, 'switch_language');
        RPG.achievements.unlock('polyglot');
      }
    });
  }

  // ── SPA navigation hook ──────────────────────────────────────────
  // The site uses SPA with pushState. Re-run detection on URL change.
  function setupSPAHook() {
    var lastPath = currentPath();

    // Patch pushState to detect SPA navigations
    var origPush = history.pushState;
    history.pushState = function () {
      origPush.apply(this, arguments);
      onNavChange();
    };

    // Also listen for popstate
    window.addEventListener('popstate', function () {
      setTimeout(onNavChange, 100);
    });

    function onNavChange() {
      var newPath = currentPath();
      if (newPath !== lastPath) {
        lastPath = newPath;
        awardPageXP();
        checkAchievements();
        // Reset scroll-bottom tracking for new page
        setupScrollDetection();
      }
    }
  }

  // ── Theme change observer — live-update all RPG UI ───────────────
  function setupThemeObserver() {
    var observer = new MutationObserver(function (mutations) {
      mutations.forEach(function (m) {
        if (m.attributeName === 'class') {
          // Theme class changed on <html> — refresh everything
          C = getColors();
          injectStyles();
          updateHUD();
          // Re-style the popup bar background
          if (popup) {
            popup.style.background = C.bg;
            popup.style.borderColor = C.primary + '4d';
            popup.style.boxShadow = '0 0 30px ' + C.primary + '1f';
            popup.style.color = isLight() ? '#1a1a1a' : '#e4e1e9';
            if (popup.style.display !== 'none') renderPopupContent();
          }
          // Re-style the HUD bar wrapper background
          if (hud) {
            var barWrap = hud.querySelector('div');
            if (barWrap) barWrap.style.background = C.primary + '1a';
          }
        }
      });
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  }

  // ── Init on DOMContentLoaded ─────────────────────────────────────
  function init() {
    buildHUD();
    buildPopup();
    awardPageXP();
    checkAchievements();
    setupScrollDetection();
    setupMusicDetection();
    setupLangDetection();
    setupSPAHook();
    setupThemeObserver();
    updateHUD();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
