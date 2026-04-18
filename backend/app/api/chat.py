import asyncio
import re
import uuid

import httpx
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.config import settings
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.user import User
from app.models.scan import ChatMessage
from app.schemas.scan import ChatRequest, ChatResponse

router = APIRouter(prefix="/api/chat", tags=["chat"])

# Tried in order after GEMINI_MODEL if Google returns 404/400 (retired or wrong region).
_GEMINI_MODEL_FALLBACKS: tuple[str, ...] = (
    "gemini-2.0-flash",
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "gemini-1.5-flash-8b",
    "gemini-1.5-flash-latest",
    "gemini-1.5-flash-001",
    "gemini-1.5-flash",
)
_GEMINI_API_VERSIONS: tuple[str, ...] = ("v1beta", "v1")

SYSTEM_PROMPTS = {
    "developer": (
        "You are a senior DevOps and security engineer assistant for the VZY OTT Verification Agent. "
        "Provide technical, actionable advice about security vulnerabilities, performance optimization, "
        "and code quality improvements. Reference specific findings, metrics, and remediation steps. "
        "Use technical language appropriate for developers."
    ),
    "management": (
        "You are a business-oriented technology advisor for the VZY OTT Verification Agent. "
        "Summarize technical findings in business terms, focusing on risk levels, compliance status, "
        "and strategic recommendations. Avoid deep technical jargon. Present information in terms of "
        "business impact, timelines, and resource requirements."
    ),
}


@router.post("", response_model=ChatResponse)
async def chat(
    body: ChatRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    session_id = body.session_id or f"chat-{uuid.uuid4().hex[:12]}"
    mode = body.mode if body.mode in SYSTEM_PROMPTS else "developer"

    user_msg = ChatMessage(
        session_id=session_id,
        role="user",
        content=body.message,
        mode=mode,
        context_url=body.context_url,
        context_score=body.context_score,
        user_id=user.id,
    )
    db.add(user_msg)
    db.commit()

    history = (
        db.query(ChatMessage)
        .filter(ChatMessage.session_id == session_id)
        .order_by(ChatMessage.timestamp)
        .all()
    )

    messages = [{"role": "system", "content": SYSTEM_PROMPTS[mode]}]

    if body.context_url or body.context_score is not None:
        ctx = f"Context: URL={body.context_url or 'N/A'}, Score={body.context_score or 'N/A'}."
        messages.append({"role": "system", "content": ctx})

    for msg in history[-20:]:
        messages.append({"role": msg.role, "content": msg.content})

    ai_text = await _call_ai_chat(messages)

    ai_msg = ChatMessage(
        session_id=session_id,
        role="assistant",
        content=ai_text,
        mode=mode,
        user_id=user.id,
    )
    db.add(ai_msg)
    db.commit()

    return ChatResponse(response=ai_text, session_id=session_id)


@router.get("/sessions/{session_id}")
async def get_chat_history(
    session_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    messages = (
        db.query(ChatMessage)
        .filter(ChatMessage.session_id == session_id)
        .order_by(ChatMessage.timestamp)
        .all()
    )
    return {
        "session_id": session_id,
        "messages": [
            {
                "id": m.id,
                "role": m.role,
                "content": m.content,
                "mode": m.mode,
                "timestamp": m.timestamp.isoformat() if m.timestamp else None,
            }
            for m in messages
        ],
    }


def _openai_style_to_gemini_contents(messages: list[dict]) -> tuple[str | None, list[dict]]:
    """Split system prompts from OpenAI-style messages and build Gemini contents."""
    system_chunks: list[str] = []
    contents: list[dict] = []
    for m in messages:
        role = m.get("role", "user")
        text = m.get("content", "") or ""
        if role == "system":
            system_chunks.append(text)
            continue
        g_role = "model" if role == "assistant" else "user"
        if contents and contents[-1]["role"] == g_role:
            contents[-1]["parts"][0]["text"] += "\n\n" + text
        else:
            contents.append({"role": g_role, "parts": [{"text": text}]})
    system_instruction = "\n\n".join(system_chunks) if system_chunks else None
    return system_instruction, contents


def _resolved_gemini_api_key() -> str | None:
    """Google samples use GOOGLE_API_KEY; we accept GEMINI_API_KEY first for this app."""
    return settings.GEMINI_API_KEY or settings.GOOGLE_API_KEY


@router.get("/assistant-info")
async def assistant_info(user: User = Depends(get_current_user)):
    """Which AI backend the chat will use (no secrets exposed)."""
    if _resolved_gemini_api_key():
        return {
            "provider": "gemini",
            "model": settings.GEMINI_MODEL,
            "configured": True,
            "openai_fallback": bool(settings.OPENAI_API_KEY),
        }
    if settings.OPENAI_API_KEY:
        return {"provider": "openai", "model": settings.OPENAI_MODEL, "configured": True, "openai_fallback": False}
    return {"provider": "none", "model": None, "configured": False, "openai_fallback": False}


def _parse_gemini_generate_response(data: dict) -> str:
    parts = (
        data.get("candidates", [{}])[0]
        .get("content", {})
        .get("parts", [])
    )
    texts = [p.get("text", "") for p in parts if isinstance(p, dict)]
    out = "".join(texts).strip()
    return out or "(Empty model response)"


async def _gemini_http_post(
    client: httpx.AsyncClient,
    url: str,
    body: dict,
    api_key: str,
) -> httpx.Response:
    hdr = {"Content-Type": "application/json", "x-goog-api-key": api_key}
    resp = await client.post(url, headers=hdr, json=body)
    if resp.status_code in (401, 403):
        resp = await client.post(
            url,
            params={"key": api_key},
            headers={"Content-Type": "application/json"},
            json=body,
        )
    return resp


def _retry_delay_seconds_from_gemini_error(payload: dict) -> float | None:
    """Parse google.rpc.RetryInfo retryDelay (e.g. '7s') from a 429 JSON body."""
    try:
        for d in payload.get("error", {}).get("details") or []:
            if not isinstance(d, dict):
                continue
            if "RetryInfo" not in str(d.get("@type", "")):
                continue
            rd = d.get("retryDelay")
            if rd is None:
                continue
            if isinstance(rd, (int, float)):
                return float(rd)
            s = str(rd).strip().strip('"')
            m = re.match(r"^(\d+(?:\.\d+)?)s$", s, re.I)
            if m:
                return min(float(m.group(1)) + 0.25, 60.0)
    except Exception:
        pass
    return None


def _format_gemini_quota_help(err: dict, api_key: str) -> str:
    msg = str(err.get("error", {}).get("message", "")).lower()
    lines = [
        "\n**What you can do**",
        "- **Wait** a few minutes (free tier has per-minute caps); the app retries automatically with backoff.",
        "- In **Google Cloud Console** → Billing: ensure the project for this API key has **billing enabled** if you see free-tier limits at **0**.",
        "- In **Google AI Studio** (https://aistudio.google.com/apikey): confirm the key’s project still has **Generative Language API** quota.",
    ]
    if settings.OPENAI_API_KEY:
        lines.append(
            "- **OPENAI_API_KEY** is set — the app will try OpenAI when Gemini returns quota / 429 errors."
        )
    else:
        lines.append(
            "- Optional: set **OPENAI_API_KEY** in `backend/.env` for automatic fallback when Gemini is rate-limited."
        )
    if "limit: 0" in msg or "free_tier" in msg:
        lines.insert(
            1,
            "- Your key may show **free tier limit 0** until the Cloud project is linked to **billing** or a different key/project is used.",
        )
    if api_key.startswith("AQ."):
        lines.append("- Prefer an **AIza…** API key from Cloud Console with Generative Language API enabled (see README).")
    return "\n".join(lines)


async def _gemini_post_with_429_retries(
    client: httpx.AsyncClient,
    url: str,
    body: dict,
    api_key: str,
    *,
    max_attempts: int = 4,
) -> httpx.Response:
    """Retry transient 429s using RetryInfo when present, else exponential backoff."""
    resp: httpx.Response | None = None
    for attempt in range(max_attempts):
        resp = await _gemini_http_post(client, url, body, api_key)
        if resp.status_code != 429:
            return resp
        delay = 2.0**attempt
        try:
            j = resp.json()
            parsed = _retry_delay_seconds_from_gemini_error(j)
            if parsed is not None:
                delay = max(parsed, 1.0)
        except Exception:
            pass
        if attempt + 1 < max_attempts:
            await asyncio.sleep(min(delay, 45.0))
    assert resp is not None
    return resp


async def _call_gemini(messages: list[dict]) -> str:
    api_key = _resolved_gemini_api_key()
    if not api_key:
        return "No Gemini API key configured."

    system_instruction, contents = _openai_style_to_gemini_contents(messages)
    if not contents:
        return "No user message to send to the model."

    body: dict = {
        "contents": contents,
        "generationConfig": {
            "maxOutputTokens": 768,
            "temperature": 0.7,
        },
    }
    if system_instruction:
        body["systemInstruction"] = {"parts": [{"text": system_instruction}]}

    primary = settings.GEMINI_MODEL.strip()
    model_order = [primary] + [m for m in _GEMINI_MODEL_FALLBACKS if m != primary]
    last_failure: tuple[int, str, dict | None] | None = None

    async with httpx.AsyncClient(timeout=90) as client:
        for api_version in _GEMINI_API_VERSIONS:
            for model in model_order:
                url = (
                    f"https://generativelanguage.googleapis.com/{api_version}/"
                    f"models/{model}:generateContent"
                )
                resp = await _gemini_post_with_429_retries(client, url, body, api_key)
                if resp.status_code == 200:
                    try:
                        return _parse_gemini_generate_response(resp.json())
                    except Exception as exc:
                        return f"Gemini response parse error: {exc}"
                if resp.status_code in (401, 403):
                    try:
                        err = resp.json()
                    except Exception:
                        err = {"raw": resp.text[:500]}
                    hint = ""
                    if api_key.startswith("AQ."):
                        hint = (
                            " Keys shown as AQ. in AI Studio are often not accepted by the public "
                            "generativelanguage.googleapis.com endpoint. Create a classic API key in "
                            "Google Cloud Console → APIs & Services → Credentials → Create credentials → API key, "
                            "enable Generative Language API on the project, restrict the key to that API — "
                            "those keys usually start with AIza. See README."
                        )
                    return f"Gemini API error ({resp.status_code}): {err}{hint}"
                if resp.status_code == 429:
                    try:
                        err_obj = resp.json()
                    except Exception:
                        err_obj = {"raw": resp.text[:500]}
                    last_failure = (429, str(err_obj)[:1200], err_obj if isinstance(err_obj, dict) else None)
                    continue
                try:
                    err_txt = str(resp.json())[:800]
                except Exception:
                    err_txt = resp.text[:800]
                last_failure = (resp.status_code, err_txt, None)

    hint = ""
    if api_key.startswith("AQ."):
        hint = (
            " Keys shown as AQ. in AI Studio are often not accepted by the public "
            "generativelanguage.googleapis.com endpoint. Create a classic API key (AIza…) with "
            "Generative Language API enabled. See README."
        )
    models_hint = (
        f"Tried models (in order): {', '.join(model_order[:6])}{'…' if len(model_order) > 6 else ''} "
        f"on API versions {', '.join(_GEMINI_API_VERSIONS)}. Set GEMINI_MODEL in backend/.env "
        f"to a model your key supports (e.g. gemini-2.0-flash or gemini-2.5-flash)."
    )
    if last_failure and last_failure[0] == 429 and isinstance(last_failure[2], dict):
        help_txt = _format_gemini_quota_help(last_failure[2], api_key)
        return (
            "Gemini API rate limited (429) — quota or free-tier cap exhausted for this key/project.\n"
            f"Details: {last_failure[1]}\n"
            f"{help_txt}\n\n{models_hint}{hint}"
        )
    if last_failure:
        return (
            f"Gemini API: no working model ({last_failure[0]}): {last_failure[1]}\n"
            f"{models_hint}{hint}"
        )
    return f"Gemini API failed. {models_hint}{hint}"


async def _call_openai(messages: list[dict]) -> str:
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            "https://api.openai.com/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {settings.OPENAI_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": settings.OPENAI_MODEL,
                "messages": messages,
                "max_tokens": 1024,
                "temperature": 0.7,
            },
        )
        resp.raise_for_status()
        data = resp.json()
        return data["choices"][0]["message"]["content"]


def _gemini_out_indicates_quota_or_rate_limit(text: str) -> bool:
    t = text.lower()
    return (
        "429" in text
        or "resource_exhausted" in t
        or "quota" in t
        or "rate limited" in t
        or "exceeded your current quota" in t
    )


async def _call_ai_chat(messages: list[dict]) -> str:
    if _resolved_gemini_api_key():
        try:
            out = await _call_gemini(messages)
        except Exception as exc:
            return f"Gemini request failed: {exc}"
        if _gemini_out_indicates_quota_or_rate_limit(out) and settings.OPENAI_API_KEY:
            try:
                oa = await _call_openai(messages)
                return (
                    f"[Gemini unavailable due to quota/rate limits — answered with OpenAI ({settings.OPENAI_MODEL}).]\n\n"
                    f"{oa}"
                )
            except Exception as exc:
                return f"{out}\n\n(OpenAI fallback failed: {exc})"
        return out

    if settings.OPENAI_API_KEY:
        try:
            return await _call_openai(messages)
        except Exception as exc:
            return f"OpenAI request failed: {exc}"

    return (
        "AI chat is off — add a key in backend/.env and restart:\n"
        "• GEMINI_API_KEY or GOOGLE_API_KEY — Gemini (AI Studio key starting with AIza)\n"
        "• or OPENAI_API_KEY — legacy OpenAI\n"
        "Never commit API keys to git."
    )
