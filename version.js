(function () {
  const APP_VERSION = "2026.09.22.2";

  window.APP_VERSION = APP_VERSION;

  function addVersionBadge() {
    if (document.getElementById("app-version-badge")) return;

    const badge = document.createElement("div");
    badge.id = "app-version-badge";
    badge.textContent = `v${APP_VERSION}`;
    badge.setAttribute("aria-label", `App version ${APP_VERSION}`);
    badge.style.position = "fixed";
    badge.style.left = "8px";
    badge.style.bottom = "6px";
    badge.style.zIndex = "2147483647";
    badge.style.padding = "2px 7px";
    badge.style.border = "1px solid rgba(44, 62, 80, 0.14)";
    badge.style.borderRadius = "6px";
    badge.style.background = "rgba(255, 255, 255, 0.88)";
    badge.style.color = "#5f6f7a";
    badge.style.font = "600 11px/1.4 Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    badge.style.boxShadow = "0 1px 4px rgba(0, 0, 0, 0.08)";
    badge.style.pointerEvents = "none";

    document.body.appendChild(badge);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", addVersionBadge);
  } else {
    addVersionBadge();
  }
})();
