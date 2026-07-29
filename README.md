# AI Provider Abstraction Pattern — Personal Finance Tracker

> A swappable AI provider architecture for backend applications, demonstrated through a personal finance tracker with automatic transaction categorization.

## The Pattern

Most tutorials wire an AI backend directly into application logic — one provider, one SDK, tightly coupled. This project inverts that: the domain (personal finance) is the example, not the point. The point is a clean `AIProvider` interface that lets the underlying model be swapped without touching business logic.

```
AI_PROVIDER=gemini   → GeminiProvider   (production)
AI_PROVIDER=local    → LocalProvider    (development, via FastMCP over local hardware)
```

Both implementations satisfy the same contract. Switching providers is a single environment variable — no code change, no redeploy of business logic.

**The empirical proof isn't just architectural — it's in the data.** Every transaction persists which provider categorized it (`ai_provider` field), so the abstraction isn't just a design claim on paper; it's verifiable per row in the database.

## Why this matters

AI SDKs change fast, pricing models shift, and rate limits vary by provider. An application whose core logic depends on one vendor's client library inherits that vendor's outages, pricing changes, and API breaking changes directly. This pattern treats the AI provider as infrastructure — interchangeable, testable in isolation, and swappable without touching the domain layer.

## Stack

- **Backend:** NestJS
- **Database / Auth:** Supabase (PostgreSQL + Auth)
- **Frontend:** React
- **AI:** Google Gemini API (production) / local model via FastMCP (development)

## Architecture

```
src/
├── ai/
│   ├── ai-provider.interface.ts   # The contract both implementations satisfy
│   ├── gemini.provider.ts         # Production implementation
│   ├── local.provider.ts          # Development implementation (FastMCP)
│   └── ai-provider.factory.ts     # Resolves the active provider from env
├── transactions/
│   ├── transactions.module.ts
│   ├── transactions.service.ts    # Calls AIProvider, persists ai_provider field
│   └── entities/transaction.entity.ts
└── ...
```

## What this project demonstrates

- Interface-driven design for a volatile dependency (AI providers)
- Environment-based dependency injection without a DI framework workaround
- Empirical, data-backed verification of an architectural claim (not just a README assertion)
- A working, deployed application — not just a design exercise

## Status

🚧 Active development — first commit as of July 2026.

## License

MIT
