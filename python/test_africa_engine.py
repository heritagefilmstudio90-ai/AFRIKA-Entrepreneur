import unittest
from python.africa_engine import (
    compute_event_recommendations,
    compute_networking_trends,
    compute_workspace_insights,
    match_directory_peers,
    parse_badge_ocr,
)


class TestAfricaEngine(unittest.TestCase):
    def test_networking_trends_returns_30_days_and_reflects_activity(self) -> None:
        res = compute_networking_trends(
            {
                "userId": "u-amina",
                "now": "2026-11-21T10:00:00.000Z",
                "days": 30,
                "lang": "fr",
                "connections": [
                    {
                        "id": "c-1",
                        "senderId": "u-amina",
                        "recipientId": "u-kwame",
                        "status": "accepted",
                        "createdAt": "2026-11-18T10:00:00.000Z",
                        "updatedAt": "2026-11-18T10:00:00.000Z",
                    }
                ],
                "registrations": [
                    {
                        "id": "r-1",
                        "memberId": "u-amina",
                        "status": "confirmed",
                        "createdAt": "2026-11-16T11:00:00.000Z",
                    }
                ],
                "scannedBadges": [
                    {
                        "id": "b-1",
                        "ownerId": "u-amina",
                        "createdAt": "2026-11-20T09:00:00.000Z",
                    }
                ],
            }
        )
        self.assertEqual(res["engine"], "python")
        self.assertEqual(len(res["series"]), 30)
        self.assertGreaterEqual(res["summary"]["totalConnections30d"], 6)
        self.assertGreater(res["summary"]["totalInteractions30d"], 100)

    def test_recommend_events_prioritizes_sector_and_excludes_full_events(self) -> None:
        res = compute_event_recommendations(
            {
                "lang": "fr",
                "user": {"id": "u-amina", "country": "Sénégal", "city": "Dakar"},
                "profile": {"sectors": ["Fintech"], "activeCountries": ["Sénégal"]},
                "favoriteEventIds": ["evt-dakar"],
                "events": [
                    {
                        "id": "evt-full",
                        "title": "Full Event",
                        "sector": "Fintech",
                        "city": "Dakar",
                        "country": "Sénégal",
                        "dateIso": "2026-12-05T09:00:00.000Z",
                        "format": "in_person",
                        "capacity": 50,
                        "registeredCount": 50,
                        "status": "published",
                    },
                    {
                        "id": "evt-dakar",
                        "title": "Dakar Business Summit 2026",
                        "sector": "Fintech",
                        "city": "Dakar",
                        "country": "Sénégal",
                        "dateIso": "2026-12-14T09:00:00.000Z",
                        "format": "hybrid",
                        "capacity": 120,
                        "registeredCount": 85,
                        "status": "published",
                    },
                    {
                        "id": "evt-abidjan",
                        "title": "Abidjan AgriTech",
                        "sector": "Agro-industrie",
                        "city": "Abidjan",
                        "country": "Côte d’Ivoire",
                        "dateIso": "2027-01-28T15:00:00.000Z",
                        "format": "virtual",
                        "capacity": 200,
                        "registeredCount": 112,
                        "status": "published",
                    },
                ],
            }
        )
        self.assertEqual(res["engine"], "python")
        ids = [r["eventId"] for r in res["recommendations"]]
        self.assertNotIn("evt-full", ids)
        self.assertEqual(ids[0], "evt-dakar")

    def test_parse_badge_ocr_extracts_contact_fields(self) -> None:
        parsed = parse_badge_ocr(
            {
                "rawText": "SPEAKER\nMoussa Ndiaye\nCEO & Founder\nTeranga Fintech\nmoussa@teranga.sn\n+221 77 555 01 99\nDakar, Sénégal"
            }
        )
        self.assertEqual(parsed["fullName"], "Moussa Ndiaye")
        self.assertEqual(parsed["email"], "moussa@teranga.sn")
        self.assertEqual(parsed["city"], "Dakar")
        self.assertEqual(parsed["country"], "Sénégal")
        self.assertEqual(parsed["sector"], "Fintech")

        parsed_arch = parse_badge_ocr(
            {
                "rawText": "Yasmine El Fassi\nDirectrice Architecture & Design\nAtlas Studio\nyasmine@atlas.ma\nCasablanca, Maroc"
            }
        )
        self.assertEqual(parsed_arch["city"], "Casablanca")
        self.assertEqual(parsed_arch["country"], "Maroc")
        self.assertEqual(parsed_arch["sector"], "Architecture")

    def test_match_directory_peers_ranks_shared_sector_and_corridor(self) -> None:
        res = match_directory_peers(
            {
                "lang": "fr",
                "user": {"id": "u-amina", "country": "Sénégal"},
                "profile": {
                    "sectors": ["Fintech"],
                    "activeCountries": ["Sénégal", "Côte d’Ivoire"],
                    "collaborationNeeds": ["Co-investissement"],
                },
                "connectedIds": ["u-chidi"],
                "candidates": [
                    {
                        "member": {"id": "u-kwame", "fullName": "Kwame Mensah", "city": "Londres", "country": "Royaume-Uni"},
                        "profile": {"headline": "Partner", "sectors": ["Capital-Risque"], "activeCountries": ["Ghana"], "collaborationNeeds": []},
                        "enterprise": {"name": "Diaspora Capital", "sector": "Capital-Risque", "verified": True},
                    },
                    {
                        "member": {"id": "u-chidi", "fullName": "Chidi Okonkwo", "city": "Lagos", "country": "Nigeria"},
                        "profile": {"headline": "Fintech Studio", "sectors": ["Fintech"], "activeCountries": ["Sénégal"], "collaborationNeeds": ["Co-investissement"]},
                        "enterprise": {"name": "Alara Studio", "sector": "Fintech", "verified": True},
                    },
                ],
            }
        )
        self.assertEqual(res["engine"], "python")
        self.assertEqual(res["matches"][0]["memberId"], "u-chidi")
        self.assertEqual(res["matches"][0]["connectionStatus"], "accepted")
        self.assertGreater(res["matches"][0]["score"], res["matches"][1]["score"])

    def test_workspace_insights_computes_fill_rate_and_revenue(self) -> None:
        res = compute_workspace_insights(
            {
                "events": [
                    {"id": "e1", "status": "published", "capacity": 100, "registeredCount": 80, "feeEur": 25},
                    {"id": "e2", "status": "draft", "capacity": 100, "registeredCount": 20, "feeEur": 0},
                ],
                "payments": [
                    {"id": "p1", "amountEur": 99, "status": "succeeded"},
                    {"id": "p2", "amountEur": 12, "status": "failed"},
                ],
                "reports": [
                    {"id": "r1", "status": "open"},
                    {"id": "r2", "status": "resolved"},
                ],
            }
        )
        self.assertEqual(res["engine"], "python")
        self.assertEqual(res["totalEvents"], 2)
        self.assertEqual(res["publishedEvents"], 1)
        self.assertEqual(res["fillRatePct"], 50)
        self.assertEqual(res["estimatedTicketRevenueEur"], 2000)
        self.assertEqual(res["paidSubscriptionRevenueEur"], 99)
        self.assertEqual(res["openReports"], 1)


if __name__ == "__main__":
    unittest.main()
