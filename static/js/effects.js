/* ============================================================
   effects.js — Cyberpunk Visual Effects (vanilla JS, IIFE)
   ============================================================ */

(function () {
  "use strict";

  /* ----------------------------------------------------------------
     1. Page Loading Bar
     ---------------------------------------------------------------- */
  var PageLoader = (function () {
    var bar = null;

    function ensureBar() {
      if (bar) return bar;
      bar = document.getElementById("page-loading-bar");
      if (!bar) {
        bar = document.createElement("div");
        bar.id = "page-loading-bar";
        document.body.appendChild(bar);
      }
      return bar;
    }

    function start() {
      var el = ensureBar();
      // Reset state
      el.classList.remove("loading-bar-complete");
      el.style.width = "";
      el.style.opacity = "";
      // Force reflow so the animation restarts cleanly
      void el.offsetWidth;
      el.classList.add("loading-bar-active");
    }

    function finish() {
      var el = ensureBar();
      el.classList.remove("loading-bar-active");
      // Force reflow
      void el.offsetWidth;
      el.classList.add("loading-bar-complete");
      // Clean up after fade-out
      setTimeout(function () {
        el.classList.remove("loading-bar-complete");
        el.style.width = "0%";
        el.style.opacity = "1";
      }, 600);
    }

    return { start: start, finish: finish };
  })();

  window.PageLoader = PageLoader;


  /* ----------------------------------------------------------------
     2. Boot Log Typewriter
     ---------------------------------------------------------------- */
  var BootAnimation = (function () {

    function init(containerSelector) {
      var container = document.querySelector(containerSelector);
      if (!container) return;

      var lines = container.querySelectorAll(".boot-line");
      if (!lines.length) return;

      // Lock container height to prevent layout shift during typing
      if (container.offsetHeight > 0) {
        container.style.minHeight = container.offsetHeight + "px";
      }

      // Hide line text initially but preserve line box height
      var i;
      for (i = 0; i < lines.length; i++) {
        lines[i].style.opacity = "0";
        lines[i].style.minHeight = "1.25rem";
        lines[i].style.lineHeight = "1.25rem";
        lines[i].style.borderRightColor = "transparent";
        lines[i].style.animation = "none";
        lines[i].classList.remove("done");
      }

      var lineIndex = 0;

      function processNextLine() {
        if (lineIndex >= lines.length) return;

        var line = lines[lineIndex];
        var fullText = line.textContent || line.innerText;
        line.textContent = "";
        line.style.opacity = "1";
        line.style.borderRightColor =
          document.documentElement.classList.contains("light") ? "#d92323" : "#f5e642";

        var charIndex = 0;

        function typeChar() {
          if (charIndex < fullText.length) {
            line.textContent += fullText.charAt(charIndex);
            charIndex++;
            setTimeout(typeChar, 25);
          } else {
            // Line complete — remove cursor, advance
            line.classList.add("done");
            line.style.borderRightColor = "transparent";
            lineIndex++;
            setTimeout(processNextLine, 120);
          }
        }

        typeChar();
      }

      processNextLine();
    }

    return { init: init };
  })();

  window.BootAnimation = BootAnimation;


  /* ----------------------------------------------------------------
     3. Glitch Text Effect
     ---------------------------------------------------------------- */
  var GlitchText = (function () {

    function randomOffset(max) {
      return (Math.random() * max * 2 - max).toFixed(1);
    }

    function triggerGlitch(el) {
      var duration = 200; // ms
      var interval = 30;
      var elapsed = 0;

      var timer = setInterval(function () {
        elapsed += interval;
        if (elapsed >= duration) {
          // Reset to clean state
          el.style.textShadow = "";
          clearInterval(timer);
          return;
        }
        var rx = randomOffset(3);
        var ry = randomOffset(2);
        var cx = randomOffset(3);
        var cy = randomOffset(2);
        el.style.textShadow =
          rx + "px " + ry + "px 0 rgba(255,45,120,0.6), " +
          cx + "px " + cy + "px 0 rgba(0,212,255,0.6)";
      }, interval);
    }

    function triggerP5RGlitch(el) {
      // P5R style: bold red shadow + skew, smooth transition
      el.style.transition = "all 0.2s ease";
      el.style.textShadow = "2px 2px 0 #d92323, -1px -1px 0 #0d0d0d";
      el.style.transform = "skewX(-5deg) scale(1.03)";
    }

    function resetP5RGlitch(el) {
      el.style.transition = "all 0.2s ease";
      el.style.textShadow = "";
      el.style.transform = "";
    }

    function isLightMode() {
      return document.documentElement.classList.contains("light");
    }

    function init() {
      var elements = document.querySelectorAll(".glitch-hover-text");
      if (!elements.length) return;

      for (var i = 0; i < elements.length; i++) {
        (function (el) {
          // Ensure data-text is set for pseudo-element content
          if (!el.getAttribute("data-text")) {
            el.setAttribute("data-text", el.textContent);
          }
          el.addEventListener("mouseenter", function () {
            if (isLightMode()) {
              triggerP5RGlitch(el);
            } else {
              triggerGlitch(el);
            }
          });
          el.addEventListener("mouseleave", function () {
            if (isLightMode()) {
              resetP5RGlitch(el);
            }
          });
        })(elements[i]);
      }
    }

    return { init: init };
  })();

  window.GlitchText = GlitchText;


  /* ----------------------------------------------------------------
     4. Noise Canvas Overlay (static, lightweight)
     ---------------------------------------------------------------- */
  var NoiseOverlay = (function () {

    function isLightMode() {
      return document.documentElement.classList.contains("light");
    }

    function generateNoiseCanvas(size) {
      var canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      var ctx = canvas.getContext("2d");
      if (!ctx) return null;

      var imageData = ctx.createImageData(size, size);
      var data = imageData.data;
      var len = data.length;
      for (var i = 0; i < len; i += 4) {
        var v = Math.floor(Math.random() * 256);
        data[i]     = v; // R
        data[i + 1] = v; // G
        data[i + 2] = v; // B
        data[i + 3] = 255; // A
      }
      ctx.putImageData(imageData, 0, 0);
      return canvas;
    }

    function generateHalftoneCanvas(size) {
      // P5R halftone dot pattern — manga printing texture
      var canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      var ctx = canvas.getContext("2d");
      if (!ctx) return null;

      ctx.clearRect(0, 0, size, size);

      var dotSpacing = 8;   // grid spacing in px
      var dotRadius  = 1.2; // small dots for subtlety

      ctx.fillStyle = "rgba(217, 35, 35, 0.08)"; // #d92323 at low opacity

      for (var y = 0; y < size; y += dotSpacing) {
        for (var x = 0; x < size; x += dotSpacing) {
          ctx.beginPath();
          ctx.arc(x, y, dotRadius, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      return canvas;
    }

    function init() {
      var size = 256;
      var canvas;

      if (isLightMode()) {
        canvas = generateHalftoneCanvas(size);
      } else {
        canvas = generateNoiseCanvas(size);
      }

      if (!canvas) return;

      var dataURL = canvas.toDataURL("image/png");

      var overlay = document.querySelector(".noise-overlay");
      if (!overlay) {
        overlay = document.createElement("div");
        overlay.className = "noise-overlay";
        document.body.appendChild(overlay);
      }

      overlay.style.backgroundImage = "url(" + dataURL + ")";
    }

    return { init: init };
  })();

  window.NoiseOverlay = NoiseOverlay;


  /* ----------------------------------------------------------------
     Auto-init on DOMContentLoaded
     ---------------------------------------------------------------- */
  document.addEventListener("DOMContentLoaded", function () {
    GlitchText.init();
    NoiseOverlay.init();
  });

})();


// P5R Scroll Animations — only in light mode
window.P5RAnimations = {
  init: function() {
    if (!document.documentElement.classList.contains('light')) return;

    // Add p5r-fade-in class to sections, cards, etc.
    var targets = document.querySelectorAll(
      '.project-card, .cut-corner-br, section > .grid > div, ' +
      '.protocol-content, .bg-surface-container-low, ' +
      'article, .cyber-modal-outline'
    );

    var observer = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });

    targets.forEach(function(el) {
      el.classList.add('p5r-fade-in');
      observer.observe(el);
    });
  }
};

// Also re-init on SPA navigation
var origPushState = history.pushState;
history.pushState = function() {
  origPushState.apply(this, arguments);
  setTimeout(function() {
    if (window.P5RAnimations) P5RAnimations.init();
  }, 100);
};

document.addEventListener('DOMContentLoaded', function() {
  if (window.P5RAnimations) P5RAnimations.init();
});
