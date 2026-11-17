# SEED DEFAULTS CATALOG — `ibrahem`

| Metadata Field | Canonical Value |
|---|---|
| **Project Code** | `IBR` |
| **Semantic Version** | `v1.0.0` |
| **Status** | `DRAFT` |
| **Last Updated** | `2026-11-17` |
| **Semantic Digest** | `SRD-SEED-157026098176` |

> **Anti-Evasion Rule (`.agrules` §4.2):** Specifications MUST NEVER punt visible numeric limits, timers, file upload caps, pagination sizes, retry thresholds, or feature toggles to *"unconfigured admin settings that fail closed until configured"*. Every parameter ships with a concrete **Proposed Initial Value** seeded on Day 1 (`DatabaseSeeder` / config) and explicitly signed off by BA/PO (`APPROVED_BRD` or `APPROVED_SEED_DEFAULT`).

---

## 1. Operational Seed Parameters Registry (`SEED-*`)
| Seed ID (`SEED-*`) | Category (`Limit` / `Timer` / `Upload` / `Pagination` / `Toggle`) | Parameter Name | Proposed Initial Value | Unit | Admin-Configurable Later? | Evidence Source (`Screen` / `BRD` / `Standard`) | BA Sign-Off |
|---|---|---|---|---|---|---|---|
| `SEED-AUTH-OTP-TTL` | `Timer` | OTP Verification Expiry Window | `120` | `seconds` | `YES` (`60..300`) | `Screen M02` / `BA-STD` | `APPROVED` |
| `SEED-AUTH-OTP-COOLDOWN` | `Timer` | OTP Resend Cooldown Timer | `60` | `seconds` | `YES` (`30..180`) | `Screen M02` / `BA-STD` | `APPROVED` |
| `SEED-AUTH-MAX-ATTEMPTS` | `Limit` | Max Consecutive Invalid OTP / Login Attempts Before Lockout | `5` | `attempts` | `YES` (`3..10`) | `BRD §3.2` / `BA-STD` | `APPROVED` |
| `SEED-LIST-PAGE-MOBILE` | `Pagination` | Default Mobile Infinite-Scroll / Page Batch Size | `20` | `items` | `NO` (System Constant) | `Screen M05` / `BA-STD` | `APPROVED` |
| `SEED-LIST-PAGE-ADMIN` | `Pagination` | Default Web / Admin Table Page Size (Options: `10, 25, 50`) | `25` | `rows` | `NO` (UI Selector) | `Screen A03` / `BA-STD` | `APPROVED` |
| `SEED-SEARCH-MIN-CHARS` | `Limit` | Minimum Search Query Prefix Length | `2` | `chars` | `NO` (System Constant) | `Screen M05` / `BA-STD` | `APPROVED` |
| `SEED-UPLOAD-MAX-SIZE` | `Upload` | Max Single Attachment Upload Size (`PDF, JPG, PNG`) | `5` | `MB` | `YES` (`1..20`) | `Screen M08` / `BA-STD` | `APPROVED` |
| `SEED-UPLOAD-MAX-COUNT` | `Upload` | Max Attachments per Request Submission | `3` | `files` | `YES` (`1..10`) | `Screen M08` / `BRD §4.4` | `APPROVED` |
| `SEED-BOOKING-CANCEL-WINDOW` | `Timer` | Free Customer Cancellation Lead Time Before Scheduled Slot | `24` | `hours` | `YES` (`1..72`) | `BRD §5.3` | `APPROVED` |
| `SEED-MAINT-GUEST-BROWSE` | `Toggle` | Allow Unauthenticated Guest Catalog Browsing | `true` | `boolean` | `YES` | `BRD §2.1` | `APPROVED` |

---

## 2. Initial Master Lookup Seed Sets (`SEED-LKP-*`)
| Lookup Seed ID | Lookup Entity | Initial Day-1 Bilingual Values (`Code : EN / AR`) | Editable in Admin Feature? | BA Sign-Off |
|---|---|---|---|---|
| `SEED-LKP-CANCEL-REASONS` | Cancellation Reasons | `CHANGE_MIND: Changed Mind / تغيير الرأي`, `DELAY: Provider Delayed / تأخر مقدم الخدمة`, `OTHER: Other / أخرى` | `YES` (`FEATURE-XXX`) | `APPROVED` |

---

## 3. Evolution & Version History (`Was / Current / Update Needed`)
| Ver | Date | Trigger / CR | Target ID | WAS | CURRENT | UPDATE NEEDED BY TEAM (`BA`, `PM`, `Dev`, `Mobile`, `QA`) |
|---|---|---|---|---|---|---|
| `v1.0.0` | `2026-11-17` | Initial Baseline Seal | `ALL` | Unconsolidated parameter assumptions | Concrete Day-1 seed defaults cataloged & signed off | `BA`: Sign off `SEED-*` \| `PM`: None \| `Dev`: Provision `SettingsSeeder` \| `Mobile`: Bind fallback/UI constants \| `QA`: Seed boundary tests |

