# GLOSSARY & CANONICAL ENUMS — `ibrahem`

| Metadata Field | Canonical Value |
|---|---|
| **Project Code** | `IBR` |
| **Semantic Version** | `v1.0.0` |
| **Status** | `DRAFT` |
| **Last Updated** | `2026-11-17` |
| **Semantic Digest** | `SRD-ENUM-055C6871F0AA` |

---

## 1. Bilingual Ubiquitous Language Glossary (`AR` / `EN`)
Every UI label, API business payload term, User Story, and QA scenario MUST use these exact terms—never invent synonyms across sprints.

| Term ID | English Term (`EN`) | Arabic Term (`AR`) | Canonical Business Definition | Owning Feature ID | Prohibited Synonyms |
|---|---|---|---|---|---|
| `TERM-001` | `Service Request` | `طلب خدمة` | Customer-submitted transactional booking bound to one service category and branch | `FEATURE-004` | `Order`, `Ticket`, `Job` |
| `TERM-002` | `Service Provider` | `مقدم الخدمة` | Verified external or internal specialist assigned to fulfil a `Service Request` | `FEATURE-002` | `Merchant`, `Agent`, `Contractor` |

---

## 2. Canonical Status & Badge Enum Registry (`ENUM-*`)
Single source of truth for lifecycle codes, localized labels, semantic UI badge tones (`neutral` | `info` | `warning` | `success` | `danger`), and allowed state transitions.

| Enum Group | Code | AR Label | EN Label | UI Badge Semantic Tone | Allowed Next States | Consumed By (`Web`/`Mobile`/`API`) |
|---|---|---|---|---|---|---|
| `ENUM-ACCOUNT-STATUS` | `PENDING_VERIFICATION` | `بانتظار التفعيل` | `Pending Verification` | `warning` | `ACTIVE`, `REJECTED` | `Web`, `Mobile`, `API` |
| `ENUM-ACCOUNT-STATUS` | `ACTIVE` | `نشط` | `Active` | `success` | `SUSPENDED`, `DEACTIVATED` | `Web`, `Mobile`, `API` |
| `ENUM-ACCOUNT-STATUS` | `SUSPENDED` | `موقوف مؤقتاً` | `Suspended` | `danger` | `ACTIVE`, `DEACTIVATED` | `Web`, `Mobile`, `API` |
| `ENUM-ACCOUNT-STATUS` | `DEACTIVATED` | `ملغى` | `Deactivated` | `neutral` | `NONE (Terminal)` | `Web`, `Mobile`, `API` |
| `ENUM-REQUEST-STATUS` | `SUBMITTED` | `تم الإرسال` | `Submitted` | `info` | `CONFIRMED`, `CANCELLED`, `REJECTED` | `Web`, `Mobile`, `API` |
| `ENUM-REQUEST-STATUS` | `CONFIRMED` | `مؤكد` | `Confirmed` | `info` | `IN_PROGRESS`, `CANCELLED` | `Web`, `Mobile`, `API` |
| `ENUM-REQUEST-STATUS` | `IN_PROGRESS` | `قيد التنفيذ` | `In Progress` | `warning` | `COMPLETED`, `DISPUTED` | `Web`, `Mobile`, `API` |
| `ENUM-REQUEST-STATUS` | `COMPLETED` | `مكتمل` | `Completed` | `success` | `NONE (Terminal)` | `Web`, `Mobile`, `API` |
| `ENUM-REQUEST-STATUS` | `CANCELLED` | `ملغى` | `Cancelled` | `neutral` | `NONE (Terminal)` | `Web`, `Mobile`, `API` |
| `ENUM-REQUEST-STATUS` | `REJECTED` | `مرفوض` | `Rejected` | `danger` | `NONE (Terminal)` | `Web`, `Mobile`, `API` |

---

## 3. Evolution & Version History (`Was / Current / Update Needed`)
| Ver | Date | Trigger / CR | Target ID | WAS | CURRENT | UPDATE NEEDED BY TEAM (`BA`, `PM`, `Dev`, `Mobile`, `QA`) |
|---|---|---|---|---|---|---|
| `v1.0.0` | `2026-11-17` | Initial Baseline Seal | `ALL` | Pre-baseline draft (`v0.x`) | Canonical bilingual glossary & enum registry sealed | `BA`: None \| `PM`: Lock taxonomy \| `Dev`: Seed enum constants \| `Mobile`: Bind badge tones & AR/EN keys \| `QA`: Assert exact status transitions |

