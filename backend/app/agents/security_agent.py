import ssl
import socket
import re
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urljoin, urlparse

import httpx


REQUIRED_HEADERS = {
    "Content-Security-Policy": 15,
    "Strict-Transport-Security": 15,
    "X-Frame-Options": 15,
    "X-Content-Type-Options": 15,
    "X-XSS-Protection": 10,
    "Referrer-Policy": 15,
    "Permissions-Policy": 15,
}

OWASP_MAP = {
    "ssl": "A02:2021 - Cryptographic Failures",
    "headers": "A05:2021 - Security Misconfiguration",
    "cors": "A05:2021 - Security Misconfiguration",
    "auth": "A01:2021 - Broken Access Control",
    "cookies": "A05:2021 - Security Misconfiguration",
    "token_leak": "A02:2021 - Cryptographic Failures",
    "drm": "A02:2021 - Cryptographic Failures",
    "api": "A01:2021 - Broken Access Control",
}


class SecurityAgent:
    def __init__(self) -> None:
        self.findings: list[dict[str, Any]] = []

    async def analyze(self, url: str, snapshot: dict[str, Any] | None = None) -> dict[str, Any]:
        self.findings = []
        parsed = urlparse(url)
        hostname = parsed.hostname or ""

        ssl_result = await self._check_ssl(hostname)
        headers_result: dict[str, Any] = {}
        cors_result: dict[str, Any] = {}
        cookie_result: list[dict[str, Any]] = []
        token_leaks: list[str] = []
        drm_status: dict[str, Any] = {"detected": False, "technologies": []}
        api_endpoints: list[dict[str, Any]] = []

        effective_url = url
        if snapshot and snapshot.get("ok") and snapshot.get("html"):
            effective_url = snapshot.get("final_url") or url
            html = snapshot["html"]
            headers_result = self._analyze_headers(dict(snapshot.get("headers") or {}))
            cookie_result = self._analyze_cookies_browser(snapshot.get("cookies") or [])
            token_leaks = self._detect_token_leaks(html)
            drm_status = self._check_drm(html)
            api_endpoints = self._discover_api_endpoints(html, effective_url)
            try:
                async with httpx.AsyncClient(
                    timeout=20, follow_redirects=True, verify=False
                ) as client:
                    cors_result = await self._check_cors(client, effective_url)
                    await self._check_api_auth(client, api_endpoints)
            except Exception as exc:
                self.findings.append({
                    "severity": "MEDIUM",
                    "title": "Follow-up HTTP checks failed",
                    "description": str(exc),
                    "category": "connectivity",
                    "remediation": "CORS/API checks require network access to the target.",
                })
        else:
            try:
                async with httpx.AsyncClient(
                    timeout=20, follow_redirects=True, verify=False
                ) as client:
                    resp = await client.get(url)
                    headers_result = self._analyze_headers(dict(resp.headers))
                    cors_result = await self._check_cors(client, url)
                    cookie_result = self._analyze_cookies(resp)
                    html = resp.text
                    token_leaks = self._detect_token_leaks(html)
                    drm_status = self._check_drm(html)
                    api_endpoints = self._discover_api_endpoints(html, url)
                    await self._check_api_auth(client, api_endpoints)
            except Exception as exc:
                self.findings.append({
                    "severity": "HIGH",
                    "title": "Page fetch failed",
                    "description": str(exc),
                    "category": "connectivity",
                    "remediation": "Ensure the URL is accessible.",
                })

        headers_score = headers_result.get("score", 0)
        ssl_grade = ssl_result.get("grade", "F")

        base_score = 100
        severity_penalties = {"CRITICAL": 15, "HIGH": 10, "MEDIUM": 5, "LOW": 2}
        for f in self.findings:
            base_score -= severity_penalties.get(f["severity"], 0)
        score = max(0, min(100, base_score))

        owasp_mapping: dict[str, list[str]] = {}
        for f in self.findings:
            cat = f.get("category", "general")
            owasp = OWASP_MAP.get(cat, "A05:2021 - Security Misconfiguration")
            owasp_mapping.setdefault(owasp, []).append(f["title"])

        return {
            "score": score,
            "findings": self.findings,
            "headers_score": headers_score,
            "headers_detail": headers_result.get("details", {}),
            "ssl_grade": ssl_grade,
            "ssl_detail": ssl_result,
            "cors_issues": cors_result,
            "cookie_issues": cookie_result,
            "token_leaks": token_leaks,
            "drm_status": drm_status,
            "api_endpoints": api_endpoints,
            "owasp_mapping": owasp_mapping,
        }

    async def _check_ssl(self, hostname: str) -> dict[str, Any]:
        result: dict[str, Any] = {"grade": "F", "expiry": None, "issuer": None}
        if not hostname:
            return result
        try:
            ctx = ssl.create_default_context()
            with socket.create_connection((hostname, 443), timeout=10) as sock:
                with ctx.wrap_socket(sock, server_hostname=hostname) as ssock:
                    cert = ssock.getpeercert()
                    if cert:
                        not_after = ssl.cert_time_to_seconds(cert["notAfter"])
                        expiry_dt = datetime.fromtimestamp(not_after, tz=timezone.utc)
                        days_left = (expiry_dt - datetime.now(timezone.utc)).days
                        issuer_parts = dict(x[0] for x in cert.get("issuer", []))
                        issuer = issuer_parts.get("organizationName", "Unknown")
                        result["expiry"] = expiry_dt.isoformat()
                        result["issuer"] = issuer
                        result["days_remaining"] = days_left

                        if days_left > 30:
                            result["grade"] = "A"
                        elif days_left > 7:
                            result["grade"] = "B"
                            self.findings.append({
                                "severity": "MEDIUM",
                                "title": "SSL certificate expiring soon",
                                "description": f"Certificate expires in {days_left} days.",
                                "category": "ssl",
                                "remediation": "Renew your SSL certificate before expiry.",
                            })
                        else:
                            result["grade"] = "C"
                            self.findings.append({
                                "severity": "CRITICAL",
                                "title": "SSL certificate about to expire",
                                "description": f"Certificate expires in {days_left} days.",
                                "category": "ssl",
                                "remediation": "Immediately renew your SSL certificate.",
                            })

                        proto = ssock.version()
                        result["protocol"] = proto
                        if proto and proto < "TLSv1.2":
                            result["grade"] = "C"
                            self.findings.append({
                                "severity": "HIGH",
                                "title": "Outdated TLS version",
                                "description": f"Server uses {proto}. TLS 1.2+ is recommended.",
                                "category": "ssl",
                                "remediation": "Upgrade to TLS 1.2 or higher.",
                            })
        except Exception as exc:
            result["error"] = str(exc)
            self.findings.append({
                "severity": "HIGH",
                "title": "SSL connection failed",
                "description": f"Could not establish SSL connection: {exc}",
                "category": "ssl",
                "remediation": "Ensure the server has a valid SSL certificate.",
            })
        return result

    def _analyze_headers(self, headers: dict[str, str]) -> dict[str, Any]:
        details: dict[str, Any] = {}
        total = 0
        lower_headers = {k.lower(): v for k, v in headers.items()}

        for header, weight in REQUIRED_HEADERS.items():
            present = header.lower() in lower_headers
            details[header] = {
                "present": present,
                "value": lower_headers.get(header.lower(), ""),
            }
            if present:
                total += weight
            else:
                sev = "HIGH" if weight >= 15 else "MEDIUM"
                self.findings.append({
                    "severity": sev,
                    "title": f"Missing {header} header",
                    "description": f"The {header} security header is not set.",
                    "category": "headers",
                    "remediation": f"Add the {header} header to your server responses.",
                })

        return {"score": total, "details": details}

    async def _check_cors(self, client: httpx.AsyncClient, url: str) -> dict[str, Any]:
        result: dict[str, Any] = {"misconfigured": False, "details": ""}
        try:
            resp = await client.options(
                url, headers={"Origin": "https://evil.example.com"}
            )
            acao = resp.headers.get("access-control-allow-origin", "")
            if acao == "*":
                result["misconfigured"] = True
                result["details"] = "Access-Control-Allow-Origin is set to wildcard (*)."
                self.findings.append({
                    "severity": "MEDIUM",
                    "title": "Wildcard CORS policy",
                    "description": "The server accepts requests from any origin.",
                    "category": "cors",
                    "remediation": "Restrict allowed origins to trusted domains.",
                })
            elif "evil.example.com" in acao:
                result["misconfigured"] = True
                result["details"] = "CORS reflects arbitrary origin."
                self.findings.append({
                    "severity": "HIGH",
                    "title": "CORS origin reflection",
                    "description": "The server reflects the Origin header without validation.",
                    "category": "cors",
                    "remediation": "Validate origins against an allow-list.",
                })
        except Exception:
            result["details"] = "CORS check could not be performed."
        return result

    def _analyze_cookies(self, resp: httpx.Response) -> list[dict[str, Any]]:
        issues: list[dict[str, Any]] = []
        for cookie in resp.cookies.jar:
            cookie_issues = []
            if not cookie.secure:
                cookie_issues.append("Missing Secure flag")
            if not cookie.has_nonstandard_attr("HttpOnly") and "httponly" not in str(cookie).lower():
                cookie_issues.append("Missing HttpOnly flag")
            samesite = cookie.get_nonstandard_attr("SameSite") or ""
            if not samesite:
                cookie_issues.append("Missing SameSite attribute")
            if cookie_issues:
                issues.append({"name": cookie.name, "issues": cookie_issues})
                self.findings.append({
                    "severity": "MEDIUM",
                    "title": f"Insecure cookie: {cookie.name}",
                    "description": "; ".join(cookie_issues),
                    "category": "cookies",
                    "remediation": "Set HttpOnly, Secure, and SameSite attributes on cookies.",
                })
        return issues

    def _analyze_cookies_browser(self, cookies: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """Cookie flags from Playwright context (post-render)."""
        issues: list[dict[str, Any]] = []
        for c in cookies:
            name = c.get("name") or "?"
            cookie_issues: list[str] = []
            if not c.get("secure"):
                cookie_issues.append("Missing Secure flag")
            if not c.get("httpOnly"):
                cookie_issues.append("Missing HttpOnly flag")
            ss = str(c.get("sameSite") or "").strip()
            if not ss:
                cookie_issues.append("Missing SameSite attribute")
            if cookie_issues:
                issues.append({"name": name, "issues": cookie_issues})
                self.findings.append({
                    "severity": "MEDIUM",
                    "title": f"Insecure cookie: {name}",
                    "description": "; ".join(cookie_issues),
                    "category": "cookies",
                    "remediation": "Set HttpOnly, Secure, and SameSite attributes on cookies.",
                })
        return issues

    def _detect_token_leaks(self, html: str) -> list[str]:
        leaks: list[str] = []
        patterns = [
            (r"localStorage\.setItem\s*\(\s*['\"](?:token|jwt|access_token|auth)['\"]", "Token stored in localStorage"),
            (r"sessionStorage\.setItem\s*\(\s*['\"](?:token|jwt|access_token|auth)['\"]", "Token stored in sessionStorage"),
            (r"(?:api[_-]?key|apikey|secret[_-]?key)\s*[:=]\s*['\"][A-Za-z0-9_\-]{16,}['\"]", "Hardcoded API key detected"),
            (r"Bearer\s+[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+", "Hardcoded JWT token found"),
        ]
        for pattern, desc in patterns:
            if re.search(pattern, html, re.IGNORECASE):
                leaks.append(desc)
                self.findings.append({
                    "severity": "CRITICAL",
                    "title": desc,
                    "description": f"Pattern detected in page source: {pattern[:40]}...",
                    "category": "token_leak",
                    "remediation": "Never expose tokens or secrets in client-side code.",
                })
        return leaks

    def _check_drm(self, html: str) -> dict[str, Any]:
        techs: list[str] = []
        drm_patterns = {
            "Widevine": [r"com\.widevine", r"widevine", r"WidevineMediaKeySystem"],
            "FairPlay": [r"com\.apple\.fps", r"FairPlay", r"skd://"],
            "PlayReady": [r"com\.microsoft\.playready", r"PlayReady"],
        }
        for tech, patterns in drm_patterns.items():
            for pat in patterns:
                if re.search(pat, html, re.IGNORECASE):
                    techs.append(tech)
                    break
        return {"detected": len(techs) > 0, "technologies": techs}

    def _discover_api_endpoints(self, html: str, base_url: str) -> list[dict[str, Any]]:
        endpoints: list[dict[str, Any]] = []
        seen: set[str] = set()
        patterns = [
            r"""fetch\s*\(\s*['"]([^'"]+)['"]""",
            r"""XMLHttpRequest.*?open\s*\(\s*['"](?:GET|POST|PUT|DELETE)['"],\s*['"]([^'"]+)['"]""",
            r"""axios\.\w+\s*\(\s*['"]([^'"]+)['"]""",
            r"""url:\s*['"]([^'"]+api[^'"]+)['"]""",
            r"""['"](/api/[^'"]+)['"]""",
        ]
        for pat in patterns:
            for match in re.findall(pat, html, re.IGNORECASE):
                ep = match.strip()
                if ep.startswith("/"):
                    ep = urljoin(base_url, ep)
                if ep not in seen and ep.startswith("http"):
                    seen.add(ep)
                    endpoints.append({"url": ep, "authenticated": None})
        return endpoints[:30]

    async def _check_api_auth(
        self, client: httpx.AsyncClient, endpoints: list[dict[str, Any]]
    ) -> None:
        for ep in endpoints[:10]:
            try:
                resp = await client.get(ep["url"], timeout=5)
                if resp.status_code < 400:
                    ep["authenticated"] = False
                    self.findings.append({
                        "severity": "HIGH",
                        "title": f"Unauthenticated API endpoint: {ep['url'][:60]}",
                        "description": "API endpoint accessible without authentication.",
                        "category": "api",
                        "remediation": "Require authentication on all API endpoints.",
                    })
                else:
                    ep["authenticated"] = True
            except Exception:
                ep["authenticated"] = None
