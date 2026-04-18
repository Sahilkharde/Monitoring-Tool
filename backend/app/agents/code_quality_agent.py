import re
from typing import Any
from urllib.parse import urljoin

import httpx


class CodeQualityAgent:
    async def analyze(self, url: str, snapshot: dict[str, Any] | None = None) -> dict[str, Any]:
        findings: list[dict[str, Any]] = []
        js_files: list[dict[str, Any]] = []
        total_lint_errors = 0
        total_lint_warnings = 0
        auto_fixable = 0
        dead_code_count = 0
        memory_leaks: list[dict[str, Any]] = []
        async_issues: list[dict[str, Any]] = []
        anti_patterns: list[dict[str, Any]] = []
        global_vars = 0
        duplicate_blocks = 0
        max_cyclomatic = 0
        sum_cyclomatic = 0
        file_count = 0
        cognitive_sum = 0

        base_url = (snapshot or {}).get("final_url") or url
        if snapshot and snapshot.get("ok") and snapshot.get("html"):
            html = snapshot["html"]
        else:
            html = ""

        try:
            async with httpx.AsyncClient(
                timeout=30, follow_redirects=True, verify=False
            ) as client:
                if not html:
                    resp = await client.get(url)
                    html = resp.text
                js_urls = self._discover_js(html, base_url)

                if not js_urls and html.strip():
                    findings.append({
                        "severity": "INFO",
                        "title": "No external script bundles found",
                        "description": (
                            "Code quality runs on JS loaded via <script src=\"...\">. "
                            "This page may use inline scripts, dynamic imports only, or block script fetches."
                        ),
                        "category": "code_quality",
                        "remediation": "Ensure the target returns HTML with linked JS bundles (try another page or disable ad blockers for the scan host).",
                    })

                for js_url in js_urls[:20]:
                    try:
                        js_resp = await client.get(js_url, timeout=15)
                        if js_resp.status_code != 200:
                            continue
                        code = js_resp.text
                        if len(code) < 10:
                            continue

                        file_count += 1
                        result = self._analyze_js(code, js_url)
                        js_files.append(result)

                        total_lint_errors += result["errors"]
                        total_lint_warnings += result["warnings"]
                        auto_fixable += result["auto_fixable"]
                        dead_code_count += result["dead_code"]
                        global_vars += result["global_vars"]
                        duplicate_blocks += result["duplicate_blocks"]
                        max_cyclomatic = max(max_cyclomatic, result["max_cyclomatic"])
                        sum_cyclomatic += result["avg_cyclomatic"]
                        cognitive_sum += result["cognitive"]

                        memory_leaks.extend(result["memory_leaks"])
                        async_issues.extend(result["async_issues"])
                        anti_patterns.extend(result["anti_patterns"])
                        findings.extend(result["findings"])
                    except Exception:
                        continue

        except Exception as exc:
            findings.append({
                "severity": "CRITICAL",
                "title": "Failed to fetch page",
                "description": str(exc),
                "category": "connectivity",
                "remediation": "Ensure the URL is accessible.",
            })

        avg_cyclomatic = round(sum_cyclomatic / file_count, 1) if file_count else 0
        avg_cognitive = round(cognitive_sum / file_count, 1) if file_count else 0

        memory_leaks_capped = memory_leaks[:20]
        anti_patterns_capped = anti_patterns[:20]
        async_issues_capped = async_issues[:20]

        total_issues = (
            total_lint_errors
            + total_lint_warnings
            + dead_code_count
            + len(memory_leaks_capped)
        )
        score = max(
            0,
            100
            - total_lint_errors * 3
            - total_lint_warnings
            - dead_code_count * 2
            - len(memory_leaks_capped) * 5,
        )
        score = min(100, score)

        tech_debt_hours = round(total_issues * 0.25, 1)

        findings_by_category: dict[str, int] = {}
        for fn in findings:
            cat = (fn.get("category") or "other").strip() or "other"
            findings_by_category[cat] = findings_by_category.get(cat, 0) + 1

        memory_leak_details = [
            {
                "description": f"{m.get('type', 'issue')}: {m.get('detail', '')}",
                "file": m.get("file"),
            }
            for m in memory_leaks_capped
        ]
        async_issue_details = [
            {
                "description": f"{a.get('type', 'async')}: count {a.get('count', 0)}",
                "file": a.get("file"),
            }
            for a in async_issues_capped
        ]

        high_complexity_functions: list[dict[str, Any]] = []
        for f in js_files:
            if f.get("max_cyclomatic", 0) > 12:
                high_complexity_functions.append(
                    {
                        "name": self._short(f["url"]),
                        "file": f["url"],
                        "complexity": int(f["max_cyclomatic"]),
                    }
                )
        high_complexity_functions.sort(key=lambda x: x["complexity"], reverse=True)
        high_complexity_functions = high_complexity_functions[:25]

        problematic_files = [
            {
                "file": f["url"],
                "total": int(f["errors"]) + int(f["warnings"]),
                "critical": int(f["errors"]),
                "high": int(f["warnings"]),
            }
            for f in sorted(js_files, key=lambda x: x["errors"] + x["warnings"], reverse=True)[:15]
        ]

        return {
            "score": score,
            "lint_errors": total_lint_errors,
            "lint_warnings": total_lint_warnings,
            "auto_fixable": auto_fixable,
            "dead_code": dead_code_count,
            # Counts (UI MetricCards expect numbers, not arrays)
            "memory_leaks": len(memory_leaks_capped),
            "anti_patterns": len(anti_patterns_capped),
            "async_issues": len(async_issues_capped),
            "avg_complexity": avg_cyclomatic,
            "max_complexity": max_cyclomatic,
            "avg_cognitive": avg_cognitive,
            "duplicate_blocks": duplicate_blocks,
            "tech_debt": f"{tech_debt_hours}h estimated",
            "tech_debt_hours": tech_debt_hours,
            "global_vars": global_vars,
            "complexity": {
                "avg_cyclomatic": avg_cyclomatic,
                "max_cyclomatic": max_cyclomatic,
                "avg_cognitive": avg_cognitive,
                "duplicate_blocks": duplicate_blocks,
            },
            "memory_leak_details": memory_leak_details,
            "async_issue_details": async_issue_details,
            "high_complexity_functions": high_complexity_functions,
            "problematic_files": problematic_files,
            "findings_by_category": findings_by_category,
            "findings": findings,
            "files_analyzed": file_count,
            # Detailed lists for Raw JSON / debugging
            "memory_leak_items": memory_leaks_capped,
            "anti_pattern_items": anti_patterns_capped,
            "async_issue_items": async_issues_capped,
        }

    def _discover_js(self, html: str, base_url: str) -> list[str]:
        urls: list[str] = []
        seen: set[str] = set()

        def add(raw: str) -> None:
            raw = (raw or "").strip()
            if not raw or raw.startswith(("data:", "javascript:")):
                return
            full = urljoin(base_url, raw)
            if full not in seen:
                seen.add(full)
                urls.append(full)

        try:
            from bs4 import BeautifulSoup

            soup = BeautifulSoup(html, "html.parser")
            for tag in soup.find_all("script", src=True):
                add(tag.get("src") or "")
            for tag in soup.find_all("link", rel=lambda v: v and "modulepreload" in str(v).lower()):
                href = tag.get("href") or ""
                if ".js" in href.lower():
                    add(href)
        except Exception:
            pass

        for m in re.finditer(
            r'<script[^>]*?src\s*=\s*(["\'])([^"\']+)\1',
            html,
            re.I | re.DOTALL,
        ):
            add(m.group(2))

        return urls

    def _analyze_js(self, code: str, url: str) -> dict[str, Any]:
        errors = 0
        warnings = 0
        fixable = 0
        file_findings: list[dict[str, Any]] = []
        file_memory_leaks: list[dict[str, Any]] = []
        file_async_issues: list[dict[str, Any]] = []
        file_anti_patterns: list[dict[str, Any]] = []

        # --- eval usage ---
        eval_count = len(re.findall(r"\beval\s*\(", code))
        if eval_count:
            errors += eval_count
            file_findings.append({
                "severity": "CRITICAL",
                "title": f"eval() usage detected ({eval_count}x)",
                "description": f"Found {eval_count} eval() calls in {self._short(url)}.",
                "category": "code_quality",
                "remediation": "Replace eval() with safer alternatives.",
            })
            file_anti_patterns.append({"pattern": "eval()", "file": url, "count": eval_count})

        # --- console.log ---
        console_count = len(re.findall(r"\bconsole\.(log|debug|info)\s*\(", code))
        if console_count:
            warnings += console_count
            fixable += console_count
            file_findings.append({
                "severity": "LOW",
                "title": f"console statements ({console_count}x)",
                "description": f"Found {console_count} console statements in {self._short(url)}.",
                "category": "code_quality",
                "remediation": "Remove or replace with a proper logging library.",
            })

        # --- debugger ---
        debugger_count = len(re.findall(r"\bdebugger\b", code))
        if debugger_count:
            errors += debugger_count
            fixable += debugger_count
            file_findings.append({
                "severity": "HIGH",
                "title": f"debugger statement ({debugger_count}x)",
                "description": f"Found debugger statements in {self._short(url)}.",
                "category": "code_quality",
                "remediation": "Remove all debugger statements before production.",
            })

        # --- var usage ---
        var_count = len(re.findall(r"\bvar\s+\w+", code))
        if var_count > 5:
            warnings += var_count
            fixable += var_count
            file_findings.append({
                "severity": "LOW",
                "title": f"var usage ({var_count}x)",
                "description": f"Found {var_count} var declarations in {self._short(url)}.",
                "category": "code_quality",
                "remediation": "Use let/const instead of var.",
            })

        # --- Cyclomatic complexity ---
        functions = re.findall(
            r"(?:function\s+\w+|(?:const|let|var)\s+\w+\s*=\s*(?:async\s+)?(?:function|\([^)]*\)\s*=>))",
            code,
        )
        nesting_keywords = len(re.findall(r"\b(if|else if|for|while|switch|case|catch)\b", code))
        file_cyclomatic = max(1, nesting_keywords // max(len(functions), 1))
        max_cyc = min(50, nesting_keywords // 2) if nesting_keywords > 10 else file_cyclomatic
        cognitive = file_cyclomatic + len(re.findall(r"\b(&&|\|\||\?)\s", code)) // max(len(functions), 1)

        if max_cyc > 15:
            file_findings.append({
                "severity": "HIGH",
                "title": "High cyclomatic complexity",
                "description": f"Max complexity {max_cyc} in {self._short(url)}.",
                "category": "code_quality",
                "remediation": "Break complex functions into smaller, focused functions.",
            })

        # --- Dead code (unreachable after return) ---
        dead_code = len(re.findall(r"return\s+[^;]+;\s*\n\s*(?:var|let|const|if|for)\b", code))

        # --- Memory leak patterns ---
        add_listener = set(re.findall(r"addEventListener\s*\(\s*['\"](\w+)['\"]", code))
        remove_listener = set(re.findall(r"removeEventListener\s*\(\s*['\"](\w+)['\"]", code))
        unremoved = add_listener - remove_listener
        for evt in unremoved:
            file_memory_leaks.append({
                "type": "event_listener",
                "detail": f"'{evt}' listener added but never removed",
                "file": url,
            })

        set_intervals = len(re.findall(r"\bsetInterval\s*\(", code))
        clear_intervals = len(re.findall(r"\bclearInterval\s*\(", code))
        if set_intervals > clear_intervals:
            file_memory_leaks.append({
                "type": "interval",
                "detail": f"{set_intervals} setInterval vs {clear_intervals} clearInterval",
                "file": url,
            })

        if file_memory_leaks:
            errors += len(file_memory_leaks)
            file_findings.append({
                "severity": "HIGH",
                "title": f"Potential memory leaks ({len(file_memory_leaks)})",
                "description": f"Found memory leak patterns in {self._short(url)}.",
                "category": "code_quality",
                "remediation": "Clean up event listeners and intervals on unmount.",
            })

        # --- Async issues ---
        promise_no_catch = len(re.findall(r"\.then\s*\([^)]*\)(?!\s*\.catch)", code))
        if promise_no_catch:
            file_async_issues.append({
                "type": "unhandled_promise",
                "count": promise_no_catch,
                "file": url,
            })
            warnings += promise_no_catch

        async_no_await = len(re.findall(r"async\s+function\s+\w+\s*\([^)]*\)\s*\{[^}]{0,200}\}", code))
        async_with_await = len(re.findall(r"async\s+function\s+\w+[^}]*\bawait\b", code, re.DOTALL))
        if async_no_await > async_with_await:
            file_async_issues.append({
                "type": "async_without_await",
                "count": async_no_await - async_with_await,
                "file": url,
            })

        # --- Global variables ---
        global_v = len(re.findall(r"^\s*var\s+\w+", code, re.MULTILINE))

        # --- Duplicate code (simple heuristic: repeated long lines) ---
        lines = [l.strip() for l in code.split("\n") if len(l.strip()) > 40]
        seen: dict[str, int] = {}
        dup = 0
        for line in lines:
            seen[line] = seen.get(line, 0) + 1
        for count in seen.values():
            if count > 2:
                dup += 1

        return {
            "url": url,
            "errors": errors,
            "warnings": warnings,
            "auto_fixable": fixable,
            "dead_code": dead_code,
            "global_vars": global_v,
            "max_cyclomatic": max_cyc,
            "avg_cyclomatic": file_cyclomatic,
            "cognitive": cognitive,
            "duplicate_blocks": dup,
            "memory_leaks": file_memory_leaks,
            "async_issues": file_async_issues,
            "anti_patterns": file_anti_patterns,
            "findings": file_findings,
        }

    @staticmethod
    def _short(url: str) -> str:
        parts = url.rsplit("/", 1)
        return parts[-1][:50] if parts else url[:50]
