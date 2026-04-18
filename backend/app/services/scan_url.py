"""Normalize user-provided URLs so each scan hits the intended host."""


def normalize_scan_url(raw: str) -> str:
    u = (raw or "").strip().strip('"').strip("'")
    if not u:
        return u
    u = u.split()[0]
    if not u.startswith(("http://", "https://")):
        u = "https://" + u
    return u
