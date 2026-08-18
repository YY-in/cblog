(function () {
  'use strict';

  var STORAGE_KEY = 'netrunner_visitor_stats';

  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* ignore */ }
    return null;
  }

  function save(data) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) { /* ignore */ }
  }

  function formatUptime(ms) {
    var seconds = Math.floor(ms / 1000);
    var minutes = Math.floor(seconds / 60);
    var hours = Math.floor(minutes / 60);
    var days = Math.floor(hours / 24);

    if (days > 0) return days + 'd ' + (hours % 24) + 'h ' + (minutes % 60) + 'm';
    if (hours > 0) return hours + 'h ' + (minutes % 60) + 'm ' + (seconds % 60) + 's';
    if (minutes > 0) return minutes + 'm ' + (seconds % 60) + 's';
    return seconds + 's';
  }

  function injectStyles() {
    var id = 'visitor-stats-styles';
    if (document.getElementById(id)) return;
    var style = document.createElement('style');
    style.id = id;
    style.textContent = [
      '#visitor-stats-hud {',
      '  position: fixed;',
      '  bottom: 16px;',
      '  left: 16px;',
      '  z-index: 9999;',
      '  background: rgba(19, 19, 24, 0.8);',
      '  border-top: 2px solid #00d4ff;',
      '  height: 28px;',
      '  box-sizing: border-box;',
      '  padding: 0 10px;',
      '  font-family: "Share Tech Mono", monospace;',
      '  font-size: 9px;',
      '  color: #00d4ff;',
      '  letter-spacing: 0.05em;',
      '  display: flex;',
      '  align-items: center;',
      '  gap: 8px;',
      '  backdrop-filter: blur(4px);',
      '  user-select: none;',
      '  transition: background 0.3s, border-color 0.3s, color 0.3s;',
      '}',
      'html.light #visitor-stats-hud {',
      '  background: rgba(250, 247, 243, 0.8);',
      '  border-top: 2px solid #d92323;',
      '  color: #0d0d0d;',
      '}',
      '#visitor-stats-hud .close-btn {',
      '  cursor: pointer;',
      '  margin-left: 6px;',
      '  color: #00d4ff;',
      '  opacity: 0.6;',
      '  font-weight: bold;',
      '  transition: opacity 0.15s, color 0.3s;',
      '}',
      '#visitor-stats-hud .close-btn:hover {',
      '  opacity: 1;',
      '}',
      'html.light #visitor-stats-hud .close-btn {',
      '  color: #d92323;',
      '}'
    ].join('\n');
    document.head.appendChild(style);
  }

  function init() {
    var now = Date.now();
    var path = window.location.pathname;
    var data = load() || {
      visits: 0,
      pages: [],
      firstVisit: now,
      sessionPages: []
    };

    // Increment visit count on each page load
    data.visits += 1;

    // Track unique pages
    if (data.pages.indexOf(path) === -1) {
      data.pages.push(path);
    }

    // Track session pages
    if (data.sessionPages.indexOf(path) === -1) {
      data.sessionPages.push(path);
    }

    // Ensure firstVisit exists
    if (!data.firstVisit) {
      data.firstVisit = now;
    }

    save(data);
    injectStyles();

    // Build HUD widget
    var widget = document.createElement('div');
    widget.id = 'visitor-stats-hud';

    var label = document.createElement('span');
    label.id = 'visitor-stats-label';

    var closeBtn = document.createElement('span');
    closeBtn.className = 'close-btn';
    closeBtn.textContent = 'X';
    closeBtn.addEventListener('click', function () {
      widget.style.display = widget.style.display === 'none' ? 'flex' : 'none';
    });

    widget.appendChild(label);
    widget.appendChild(closeBtn);
    document.body.appendChild(widget);

    function update() {
      var elapsed = Date.now() - data.firstVisit;
      label.textContent = 'VISITS: ' + data.visits + ' | PAGES: ' + data.pages.length + ' | UPTIME: ' + formatUptime(elapsed);
    }

    update();
    setInterval(update, 1000);
  }

  // Expose API
  window.VisitorStats = {
    getData: function () { return load(); },
    reset: function () {
      localStorage.removeItem(STORAGE_KEY);
      var el = document.getElementById('visitor-stats-hud');
      if (el) el.remove();
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
