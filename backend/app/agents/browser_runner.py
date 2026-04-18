"""
Real Chromium navigation via Playwright: optional login flow + performance snapshot.

Requires: `playwright install chromium` (see README).
"""
from __future__ import annotations

from typing import Any

from app.config import settings

_VITALS_JS = r"""
() => {
  const nav = performance.getEntriesByType('navigation')[0];
  const paints = performance.getEntriesByType('paint');
  const fcpEntry = paints.find(p => p.name === 'first-contentful-paint');
  let lcpMs = null;
  try {
    const lcpEntries = performance.getEntriesByType('largest-contentful-paint');
    if (lcpEntries && lcpEntries.length) {
      const last = lcpEntries[lcpEntries.length - 1];
      lcpMs = last.renderTime || last.loadTime || last.startTime || null;
    }
  } catch (e) {}
  let cls = 0;
  try {
    for (const e of performance.getEntriesByType('layout-shift')) {
      if (!e.hadRecentInput) cls += e.value;
    }
  } catch (e) {}
  const ttfb = nav ? Math.max(0, nav.responseStart - nav.requestStart) : null;
  const domReady = nav ? Math.max(0, nav.domContentLoadedEventEnd - nav.startTime) : null;
  const load = nav ? Math.max(0, nav.loadEventEnd - nav.startTime) : null;
  const fcp = fcpEntry ? fcpEntry.startTime : null;
  const resources = performance.getEntriesByType('resource') || [];
  let js = 0, css = 0, images = 0, fonts = 0, other = 0;
  for (const r of resources) {
    const t = (r.initiatorType || '').toLowerCase();
    const sz = r.transferSize || 0;
    if (t === 'script') js += sz;
    else if (t === 'css' || t === 'link' || t === 'stylesheet') css += sz;
    else if (t === 'img' || t === 'image') images += sz;
    else if (t === 'font') fonts += sz;
    else other += sz;
  }
  return {
    ttfb_ms: ttfb,
    fcp_ms: fcp,
    lcp_ms: lcpMs,
    cls,
    dom_content_loaded_ms: domReady,
    load_ms: load,
    resource_bytes: { js, css, images, fonts, other },
    resource_count: resources.length,
  };
}
"""


async def capture_page_snapshot(url: str, browser_options: dict[str, Any] | None) -> dict[str, Any]:
    """
    Returns snapshot dict with ok, html, headers, cookies, vitals, resource_bytes, or error.
    """
    opts = browser_options or {}
    if not opts.get("use_browser", True):
        return {"ok": False, "error": "browser_disabled", "skipped": True}

    timeout_ms = int(opts.get("navigation_timeout_ms") or settings.PLAYWRIGHT_TIMEOUT_MS)
    headless = opts.get("headless", True)
    viewport = {
        "width": int(opts.get("viewport_width") or 1365),
        "height": int(opts.get("viewport_height") or 900),
    }
    ua = opts.get("user_agent")

    try:
        from playwright.async_api import async_playwright
    except ImportError as e:
        return {"ok": False, "error": f"playwright_not_installed: {e}", "skipped": True}

    login_cfg = opts.get("login") or {}
    login_enabled = bool(login_cfg.get("enabled")) and bool(
        (login_cfg.get("username") or login_cfg.get("email")) and login_cfg.get("password")
    )

    out: dict[str, Any] = {
        "ok": False,
        "url": url,
        "final_url": url,
        "html": "",
        "headers": {},
        "cookies": [],
        "vitals": {},
        "resource_bytes": {"js": 0, "css": 0, "images": 0, "fonts": 0, "other": 0},
        "login_attempted": login_enabled,
        "login_succeeded": None,
        "browser": "chromium",
        "headless": headless,
    }

    try:
        async with async_playwright() as p:
            launch_kwargs: dict[str, Any] = {"headless": headless}
            browser = await p.chromium.launch(**launch_kwargs)
            context_kwargs: dict[str, Any] = {"viewport": viewport, "ignore_https_errors": True}
            if ua:
                context_kwargs["user_agent"] = ua
            context = await browser.new_context(**context_kwargs)
            page = await context.new_page()
            page.set_default_timeout(timeout_ms)

            if login_enabled:
                login_url = login_cfg.get("login_url") or url
                user = login_cfg.get("username") or login_cfg.get("email") or ""
                password = login_cfg.get("password") or ""
                email_sel = login_cfg.get("email_selector") or (
                    'input[type="email"], input[name="email"], input[name="username"], '
                    'input[name="userName"], input[id*="email" i], input[id*="user" i]'
                )
                pass_sel = login_cfg.get("password_selector") or (
                    'input[type="password"], input[name="password"], input[id*="pass" i]'
                )
                submit_sel = login_cfg.get("submit_selector") or (
                    'button[type="submit"], input[type="submit"], button:has-text("Sign"), '
                    'button:has-text("Log in"), button:has-text("Login")'
                )
                try:
                    await page.goto(login_url, wait_until="domcontentloaded", timeout=timeout_ms)
                    await page.wait_for_timeout(500)
                    await page.fill(email_sel, user, timeout=15000)
                    await page.fill(pass_sel, password, timeout=15000)
                    async with page.expect_navigation(
                        wait_until="domcontentloaded", timeout=timeout_ms
                    ):
                        await page.click(submit_sel, timeout=15000)
                    await page.wait_for_timeout(int(login_cfg.get("post_login_wait_ms") or 2000))
                    out["login_succeeded"] = True
                except Exception as le:
                    out["login_succeeded"] = False
                    out["login_error"] = str(le)
                    # continue to target URL anyway

            # "networkidle" often never completes on SPAs (analytics, websockets); use "load" + short settle.
            response = await page.goto(url, wait_until="load", timeout=timeout_ms)
            await page.wait_for_timeout(2000)
            out["final_url"] = page.url
            if response:
                try:
                    out["headers"] = {k.lower(): v for k, v in response.headers.items()}
                except Exception:
                    out["headers"] = {}

            vitals = await page.evaluate(_VITALS_JS)
            out["vitals"] = vitals or {}
            out["html"] = await page.content()
            rb = (vitals or {}).get("resource_bytes") or {}
            out["resource_bytes"] = {
                "js": int(rb.get("js") or 0),
                "css": int(rb.get("css") or 0),
                "images": int(rb.get("images") or 0),
                "fonts": int(rb.get("fonts") or 0),
                "other": int(rb.get("other") or 0),
            }

            raw_cookies = await context.cookies()
            for c in raw_cookies:
                out["cookies"].append({
                    "name": c.get("name", ""),
                    "value": c.get("value", ""),
                    "domain": c.get("domain", ""),
                    "path": c.get("path", "/"),
                    "secure": bool(c.get("secure")),
                    "httpOnly": bool(c.get("httpOnly")),
                    "sameSite": c.get("sameSite") or "",
                })

            await context.close()
            await browser.close()

        out["ok"] = True
        out["error"] = None
        return out

    except Exception as e:
        out["ok"] = False
        out["error"] = str(e)
        return out
