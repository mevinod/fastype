# Fastype Architecture

```mermaid
flowchart LR
  Dev[Developer Push] --> GH[GitHub Repository]
  GH --> GHA[GitHub Actions CI/CD]
  GHA --> EC2[AWS EC2]
  EC2 --> Node[Fastype Node.js App]
  Node --> DB[(SQLite: fastype.db)]
  User[Browser] --> Nginx[Nginx Path /fastype/]
  Nginx --> Node
```

## Runtime Components

```mermaid
flowchart TB
  subgraph Browser
    UI[Typing UI]
    API[Calls: api/session, api/results, api/leaderboard]
  end

  subgraph Fastype Server
    S1[Session resolver]
    S2[Leaderboard service]
    S3[Static file server]
  end

  subgraph Storage
    U[(users)]
    R[(results)]
  end

  UI --> API --> S1
  API --> S2
  S1 --> U
  S2 --> R
  S3 --> UI
```

## Data Lifetime

- **Session window:** 24 hours (cookie + IP fallback).
- **Leaderboard window:** rolling 24 hours, top 20 users (best score per user).
- **Expiry:** stale results are deleted during API requests.
