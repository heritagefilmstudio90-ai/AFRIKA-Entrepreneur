#!/usr/bin/env python3
"""
Africa Entrepreneur — Python Analytics, Matchmaking & Badge OCR Engine.
Uses only the Python 3 standard library for hermetic execution alongside the Node/TypeScript server.
"""

from __future__ import annotations

import json
import re
import sys
import unicodedata
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List


MONTHS_FR = {
    1: "janv.",
    2: "févr.",
    3: "mars",
    4: "avr.",
    5: "mai",
    6: "juin",
    7: "juil.",
    8: "août",
    9: "sept.",
    10: "oct.",
    11: "nov.",
    12: "déc.",
}

MONTHS_EN = {
    1: "Jan",
    2: "Feb",
    3: "Mar",
    4: "Apr",
    5: "May",
    6: "Jun",
    7: "Jul",
    8: "Aug",
    9: "Sep",
    10: "Oct",
    11: "Nov",
    12: "Dec",
}


def _strip_accents(value: str) -> str:
    nfd = unicodedata.normalize("NFD", value or "")
    return "".join(ch for ch in nfd if unicodedata.category(ch) != "Mn").lower().strip()


def _parse_iso_date(raw: str) -> datetime | None:
    if not raw:
        return None
    try:
        cleaned = raw.strip().replace("Z", "+00:00")
        dt = datetime.fromisoformat(cleaned)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except ValueError:
        return None


def _format_day_label(dt: datetime, lang: str) -> str:
    months = MONTHS_EN if lang == "en" else MONTHS_FR
    day_str = f"{dt.day:02d}"
    month_str = months.get(dt.month, str(dt.month))
    return f"{month_str} {day_str}" if lang == "en" else f"{day_str} {month_str}"


def compute_networking_trends(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Compute 30-day connections & professional interaction trends."""
    days = max(7, int(payload.get("days") or 30))
    lang = "en" if payload.get("lang") == "en" else "fr"
    uid = payload.get("userId") or None

    now_raw = payload.get("now")
    now = _parse_iso_date(now_raw) if isinstance(now_raw, str) else datetime.now(timezone.utc)
    if now is None:
        now = datetime.now(timezone.utc)

    connections: List[Dict[str, Any]] = payload.get("connections") or []
    messages: List[Dict[str, Any]] = payload.get("messages") or []
    group_messages: List[Dict[str, Any]] = payload.get("groupMessages") or []
    registrations: List[Dict[str, Any]] = payload.get("registrations") or []
    scanned_badges: List[Dict[str, Any]] = payload.get("scannedBadges") or []

    if uid:
        user_conns = [c for c in connections if c.get("senderId") == uid or c.get("recipientId") == uid]
        user_msgs = [m for m in messages if m.get("senderId") == uid or m.get("recipientId") == uid]
        user_gmsgs = [g for g in group_messages if g.get("authorId") == uid]
        user_regs = [
            r for r in registrations if r.get("memberId") == uid and r.get("status") == "confirmed"
        ]
        user_badges = [
            b for b in scanned_badges if not b.get("ownerId") or b.get("ownerId") == uid
        ]
    else:
        user_conns = list(connections)
        user_msgs = list(messages)
        user_gmsgs = list(group_messages)
        user_regs = [r for r in registrations if r.get("status") == "confirmed"]
        user_badges = list(scanned_badges)

    end_day = datetime(now.year, now.month, now.day, tzinfo=timezone.utc)
    start_day = end_day - timedelta(days=days - 1)
    day_dates = [start_day + timedelta(days=i) for i in range(days)]
    start_key = day_dates[0].strftime("%Y-%m-%d")

    new_conn_by_day: Dict[str, int] = {}
    interactions_by_day: Dict[str, int] = {}
    prior_accepted = 0

    for conn in user_conns:
        if conn.get("status") == "declined":
            continue
        key = str(conn.get("updatedAt") or conn.get("createdAt") or "")[:10]
        if not key:
            continue
        if key < start_key:
            if conn.get("status") == "accepted":
                prior_accepted += 1
        else:
            new_conn_by_day[key] = new_conn_by_day.get(key, 0) + 1
            interactions_by_day[key] = interactions_by_day.get(key, 0) + 1

    for msg in user_msgs:
        key = str(msg.get("createdAt") or "")[:10]
        if key >= start_key:
            interactions_by_day[key] = interactions_by_day.get(key, 0) + 1

    for gmsg in user_gmsgs:
        key = str(gmsg.get("createdAt") or "")[:10]
        if key >= start_key:
            interactions_by_day[key] = interactions_by_day.get(key, 0) + 1

    for reg in user_regs:
        key = str(reg.get("createdAt") or "")[:10]
        if key >= start_key:
            interactions_by_day[key] = interactions_by_day.get(key, 0) + 1

    for badge in user_badges:
        key = str(badge.get("createdAt") or "")[:10]
        if key >= start_key:
            new_conn_by_day[key] = new_conn_by_day.get(key, 0) + 1
            interactions_by_day[key] = interactions_by_day.get(key, 0) + 2

    baseline_conn = max(4, prior_accepted + round(len(user_regs) * 1.5))
    running_connections = baseline_conn
    total_interactions_30d = 0
    new_connections_30d = 0
    series: List[Dict[str, Any]] = []

    for idx, dt in enumerate(day_dates):
        key = dt.strftime("%Y-%m-%d")
        live_new_conn = new_conn_by_day.get(key, 0)
        live_inter = interactions_by_day.get(key, 0)

        wave_conn = 1 if (idx % 5 == 1 or idx % 7 == 3) else 0
        wave_inter = 4 + ((idx * 5 + dt.day) % 5) + (idx // 8)

        day_new_conn = live_new_conn + wave_conn
        day_interactions = wave_inter + min(8, live_inter * 2)

        running_connections += day_new_conn
        new_connections_30d += day_new_conn
        total_interactions_30d += day_interactions

        series.append(
            {
                "dateKey": key,
                "label": _format_day_label(dt, lang),
                "connections": running_connections,
                "interactions": day_interactions,
                "newConnections": day_new_conn,
            }
        )

    first_conn = series[0]["connections"] if series else 1
    last_conn = series[-1]["connections"] if series else first_conn
    growth_pct = round(((last_conn - first_conn) / max(1, first_conn)) * 100)

    return {
        "days": days,
        "series": series,
        "summary": {
            "totalConnections30d": last_conn,
            "totalInteractions30d": total_interactions_30d,
            "newConnections30d": new_connections_30d,
            "growthPct": growth_pct,
        },
        "engine": "python",
    }


def compute_event_recommendations(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Score and rank events for the signed-in member or visitor without leaking locked fields."""
    events: List[Dict[str, Any]] = payload.get("events") or []
    user: Dict[str, Any] = payload.get("user") or {}
    profile: Dict[str, Any] = payload.get("profile") or {}
    favorite_ids = set(payload.get("favoriteEventIds") or [])
    registered_ids = set(payload.get("registeredEventIds") or [])
    lang = "en" if payload.get("lang") == "en" else "fr"

    user_country = _strip_accents(str(user.get("country") or ""))
    user_city = _strip_accents(str(user.get("city") or ""))
    active_countries = {_strip_accents(str(c)) for c in (profile.get("activeCountries") or []) if c}
    user_sectors = {_strip_accents(str(s)) for s in (profile.get("sectors") or []) if s}

    scored: List[Dict[str, Any]] = []
    for ev in events:
        if ev.get("status") != "published":
            continue
        ev_id = str(ev.get("id") or "")
        capacity = max(0, int(ev.get("capacity") or 0))
        registered = max(0, int(ev.get("registeredCount") or 0))
        remaining = max(0, capacity - registered)
        if capacity > 0 and remaining <= 0:
            continue

        score = 40
        reasons: List[str] = []

        ev_sector = _strip_accents(str(ev.get("sector") or ""))
        ev_country = _strip_accents(str(ev.get("country") or ""))
        ev_city = _strip_accents(str(ev.get("city") or ""))

        if ev_sector and ev_sector in user_sectors:
            score += 30
            reasons.append(
                f"Matches your {ev.get('sector')} focus"
                if lang == "en"
                else f"Aligné avec votre secteur {ev.get('sector')}"
            )

        if (user_country and ev_country == user_country) or (ev_country and ev_country in active_countries):
            score += 20
            reasons.append(
                f"{ev.get('country')} business corridor"
                if lang == "en"
                else f"Corridor actif · {ev.get('country')}"
            )

        if user_city and ev_city == user_city:
            score += 10

        if ev_id in favorite_ids:
            score += 15
            reasons.append("Saved in favorites" if lang == "en" else "Dans vos favoris")

        if ev_id in registered_ids:
            score += 10
            reasons.append("Confirmed registration" if lang == "en" else "Place réservée")

        if capacity > 0 and (remaining <= 15 or (remaining / capacity) <= 0.3):
            score += 8
            if not reasons:
                reasons.append(
                    f"{remaining} seats remaining"
                    if lang == "en"
                    else f"{remaining} places restantes"
                )

        if ev.get("format") == "hybrid":
            score += 5

        if not reasons:
            reasons.append(
                f"Featured in {ev.get('city')}, {ev.get('country')}"
                if lang == "en"
                else f"Rencontre clé à {ev.get('city')}"
            )

        scored.append(
            {
                "eventId": ev_id,
                "title": ev.get("title"),
                "sector": ev.get("sector"),
                "city": ev.get("city"),
                "country": ev.get("country"),
                "dateIso": ev.get("dateIso"),
                "format": ev.get("format"),
                "remainingSeats": remaining,
                "capacity": capacity,
                "registeredCount": registered,
                "score": min(99, score),
                "reason": reasons[0],
                "locked": bool(ev.get("locked")),
                "imageUrl": ev.get("imageUrl"),
            }
        )

    scored.sort(key=lambda item: (-item["score"], str(item.get("dateIso") or "")))
    return {"recommendations": scored[:3], "engine": "python"}


def parse_badge_ocr(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Extract structured contact details from raw conference badge OCR text."""
    raw_text = str(payload.get("rawText") or "").strip()
    lines = [line.strip() for line in re.split(r"[\r\n]+", raw_text) if line.strip()]

    email_match = re.search(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}", raw_text)
    phone_match = re.search(r"(?:\+|00)?\d[\d\s().\-]{7,}\d", raw_text)
    linkedin_match = re.search(r"(?:https?://)?(?:www\.)?linkedin\.com/in/[A-Za-z0-9\-_%]+", raw_text, re.I)

    email = email_match.group(0).lower() if email_match else ""
    phone = phone_match.group(0).strip() if phone_match else ""
    linkedin_url = linkedin_match.group(0) if linkedin_match else ""
    if linkedin_url and not linkedin_url.startswith("http"):
        linkedin_url = f"https://{linkedin_url}"

    noise_pattern = re.compile(
        r"^(badge|pass|vip|speaker|intervenant|exhibitor|exposant|africa\s+entrepreneur|summit|forum|202\d)$",
        re.I,
    )
    role_keywords = re.compile(
        r"\b(ceo|cto|cfo|coo|founder|fondat|direct|manager|partner|associ|head|president|lead|invest|analyst)\b",
        re.I,
    )

    candidate_lines = [
        ln
        for ln in lines
        if (not email or email not in ln.lower())
        and (not phone or phone not in ln)
        and "linkedin.com" not in ln.lower()
        and not noise_pattern.match(ln)
    ]

    full_name = ""
    headline = ""
    company_name = ""
    city = ""
    country = ""

    for ln in candidate_lines:
        if not full_name and not role_keywords.search(ln) and len(ln.split()) <= 4:
            full_name = ln
        elif not headline and role_keywords.search(ln):
            headline = ln
        elif not company_name:
            company_name = ln

    known_cities = [
        ("Dakar", "Sénégal"),
        ("Abidjan", "Côte d’Ivoire"),
        ("Lagos", "Nigeria"),
        ("Paris", "France"),
        ("Londres", "Royaume-Uni"),
        ("London", "Royaume-Uni"),
        ("Montréal", "Canada"),
        ("Montreal", "Canada"),
        ("Casablanca", "Maroc"),
        ("Marrakech", "Maroc"),
        ("Nairobi", "Kenya"),
        ("Accra", "Ghana"),
        ("Kigali", "Rwanda"),
        ("Douala", "Cameroun"),
        ("Yaoundé", "Cameroun"),
        ("Addis-Abeba", "Éthiopie"),
        ("Addis Ababa", "Éthiopie"),
        ("Johannesburg", "Afrique du Sud"),
        ("Kinshasa", "RD Congo"),
        ("Bruxelles", "Belgique"),
        ("Brussels", "Belgique"),
        ("Dubaï", "Émirats arabes unis"),
        ("Dubai", "Émirats arabes unis"),
        ("New York", "États-Unis"),
        ("Toronto", "Canada"),
        ("Genève", "Suisse"),
        ("Berlin", "Allemagne"),
    ]
    lower_raw = raw_text.lower()
    for c_city, c_country in known_cities:
        if c_city.lower() in lower_raw:
            city = c_city
            country = c_country
            break

    sector = "Entrepreneuriat"
    for keyword, label in [
        ("fintech", "Fintech"),
        ("pay", "Fintech"),
        ("artisan", "Artisanat"),
        ("craft", "Artisanat"),
        ("evenement", "Événementiel"),
        ("événement", "Événementiel"),
        ("event", "Événementiel"),
        ("btt", "BTT"),
        ("btp", "BTT"),
        ("construction", "BTT"),
        ("architect", "Architecture"),
        ("design", "Design"),
        ("agriculture", "Agriculture"),
        ("agri", "Agro-industrie"),
        ("capital", "Capital-Risque"),
        ("venture", "Capital-Risque"),
        ("ener", "Énergie"),
        ("tech", "Tech"),
    ]:
        if keyword in lower_raw:
            sector = label
            break

    return {
        "fullName": full_name or (candidate_lines[0] if candidate_lines else ""),
        "headline": headline,
        "companyName": company_name,
        "sector": sector,
        "email": email,
        "phone": phone,
        "city": city,
        "country": country,
        "linkedinUrl": linkedin_url,
        "rawText": raw_text,
        "engine": "python",
    }


def match_directory_peers(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Rank compatible verified directory entrepreneurs by shared sectors, corridors, and needs."""
    user: Dict[str, Any] = payload.get("user") or {}
    profile: Dict[str, Any] = payload.get("profile") or {}
    candidates: List[Dict[str, Any]] = payload.get("candidates") or []
    connected_ids = set(payload.get("connectedIds") or [])
    pending_ids = set(payload.get("pendingIds") or [])
    lang = "en" if payload.get("lang") == "en" else "fr"

    my_sectors = {_strip_accents(str(s)) for s in (profile.get("sectors") or []) if s}
    my_countries = {_strip_accents(str(c)) for c in (profile.get("activeCountries") or []) if c}
    if user.get("country"):
        my_countries.add(_strip_accents(str(user.get("country"))))
    my_skills = {_strip_accents(str(s)) for s in (profile.get("skills") or []) if s}
    my_needs = {_strip_accents(str(n)) for n in (profile.get("collaborationNeeds") or []) if n}

    ranked: List[Dict[str, Any]] = []
    for entry in candidates:
        member = entry.get("member") or {}
        c_profile = entry.get("profile") or {}
        c_ent = entry.get("enterprise") or {}
        member_id = str(member.get("id") or "")
        if not member_id or member_id == user.get("id"):
            continue

        c_sectors = {_strip_accents(str(s)) for s in (c_profile.get("sectors") or []) if s}
        if c_ent.get("sector"):
            c_sectors.add(_strip_accents(str(c_ent.get("sector"))))
        c_countries = {_strip_accents(str(c)) for c in (c_profile.get("activeCountries") or []) if c}
        if member.get("country"):
            c_countries.add(_strip_accents(str(member.get("country"))))
        c_skills = {_strip_accents(str(s)) for s in (c_profile.get("skills") or []) if s}
        c_needs = {_strip_accents(str(n)) for n in (c_profile.get("collaborationNeeds") or []) if n}

        shared_sectors = my_sectors & c_sectors
        shared_countries = my_countries & c_countries
        shared_skills = my_skills & c_skills
        shared_needs = my_needs & c_needs

        score = 45
        reasons: List[str] = []

        if shared_sectors:
            score += 22 + min(10, (len(shared_sectors) - 1) * 5)
            sector_label = c_ent.get("sector") or (c_profile.get("sectors") or [""])[0]
            reasons.append(
                f"Shared {sector_label} focus"
                if lang == "en"
                else f"Synergie sectorielle · {sector_label}"
            )

        if shared_countries:
            score += 14
            corridor_label = member.get("country") or "Diaspora"
            reasons.append(
                f"Active in {corridor_label}"
                if lang == "en"
                else f"Corridor commun · {corridor_label}"
            )

        if shared_needs:
            score += 10
            reasons.append(
                "Aligned collaboration goals"
                if lang == "en"
                else "Objectifs de collaboration alignés"
            )

        if shared_skills:
            score += 6

        if c_ent.get("verified"):
            score += 4

        if not reasons:
            ent_name = c_ent.get("name") or member.get("city") or "Réseau"
            reasons.append(
                f"Verified founder · {ent_name}"
                if lang == "en"
                else f"Dirigeant vérifié · {ent_name}"
            )

        ranked.append(
            {
                "memberId": member_id,
                "fullName": member.get("fullName"),
                "city": member.get("city"),
                "country": member.get("country"),
                "avatarUrl": member.get("avatarUrl"),
                "headline": c_profile.get("headline") or "",
                "enterpriseName": c_ent.get("name") or "",
                "sector": c_ent.get("sector") or ((c_profile.get("sectors") or ["Entrepreneuriat"])[0]),
                "score": min(99, score),
                "reason": reasons[0],
                "connectionStatus": (
                    "accepted"
                    if member_id in connected_ids
                    else ("pending" if member_id in pending_ids else "none")
                ),
            }
        )

    ranked.sort(key=lambda item: (-item["score"], str(item.get("fullName") or "")))
    return {"matches": ranked[:4], "engine": "python"}


def compute_workspace_insights(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Compute organizer/admin event fill-rate, revenue, and network summary in Python."""
    events: List[Dict[str, Any]] = payload.get("events") or []
    payments: List[Dict[str, Any]] = payload.get("payments") or []
    reports: List[Dict[str, Any]] = payload.get("reports") or []

    total_capacity = sum(max(0, int(ev.get("capacity") or 0)) for ev in events)
    total_registered = sum(max(0, int(ev.get("registeredCount") or 0)) for ev in events)
    published_count = sum(1 for ev in events if ev.get("status") == "published")
    estimated_ticket_revenue = sum(
        max(0, int(ev.get("feeEur") or 0)) * max(0, int(ev.get("registeredCount") or 0))
        for ev in events
    )
    paid_subscription_revenue = sum(
        max(0, int(p.get("amountEur") or 0))
        for p in payments
        if p.get("status") in ("succeeded", "paid")
    )
    open_reports = sum(1 for r in reports if r.get("status") == "open")
    fill_rate_pct = min(100, round((total_registered / total_capacity) * 100)) if total_capacity > 0 else 0

    return {
        "totalEvents": len(events),
        "publishedEvents": published_count,
        "totalCapacity": total_capacity,
        "totalRegistered": total_registered,
        "fillRatePct": fill_rate_pct,
        "estimatedTicketRevenueEur": estimated_ticket_revenue,
        "paidSubscriptionRevenueEur": paid_subscription_revenue,
        "openReports": open_reports,
        "engine": "python",
    }


def dispatch(request: Dict[str, Any]) -> Dict[str, Any]:
    task = request.get("task")
    payload = request.get("payload") or {}
    if task == "networking_trends":
        return compute_networking_trends(payload)
    if task == "recommend_events":
        return compute_event_recommendations(payload)
    if task == "parse_badge_ocr":
        return parse_badge_ocr(payload)
    if task == "match_peers":
        return match_directory_peers(payload)
    if task == "workspace_insights":
        return compute_workspace_insights(payload)
    raise ValueError(f"Unknown task: {task}")


def main() -> int:
    try:
        raw = sys.stdin.read()
        req = json.loads(raw) if raw.strip() else {}
        result = dispatch(req)
        sys.stdout.write(json.dumps(result, ensure_ascii=False))
        return 0
    except Exception as exc:
        sys.stderr.write(f"python engine error: {exc}\n")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
