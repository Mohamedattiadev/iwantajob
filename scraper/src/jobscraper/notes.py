"""Per-skill markdown notebook storage.

Each skill maps to a file at `data/notes/{slug}.md`. First read auto-creates
the file from a curated starter template (or generic fallback) so the user
always lands on something educational, not an empty textarea.
"""
from __future__ import annotations

import re
from pathlib import Path

from .config import DATA_DIR

NOTES_DIR = DATA_DIR / "notes"
NOTES_DIR.mkdir(parents=True, exist_ok=True)


def slug(name: str) -> str:
    s = name.lower().strip()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s or "skill"


def note_path(name: str) -> Path:
    return NOTES_DIR / f"{slug(name)}.md"


# Curated starter notebooks. Each is plain markdown; user can edit freely.
TEMPLATES: dict[str, str] = {
    "Docker": """# Docker

> Containers package an app with everything it needs to run. Same image works on your laptop, CI, and prod.

## Why this matters
Docker is the **default** way teams ship apps today. You almost cannot read a backend job description without seeing it. Goal: be able to write a `Dockerfile`, build, run, and debug containers — not just memorize commands.

## Core concepts (understand each, in one paragraph in your own words)
- [ ] **Image vs container** — image = blueprint, container = running instance
- [ ] **Layers** — each instruction in a Dockerfile becomes a cached layer
- [ ] **Tags** — `name:tag`, why `latest` is dangerous in prod
- [ ] **Volumes** — persistent data across container restarts
- [ ] **Networking** — bridge network, port publishing, container-to-container DNS
- [ ] **docker compose** — multi-container apps in one YAML
- [ ] **Multi-stage builds** — small final images, no dev tools shipped

## Commands you must know cold
```bash
docker build -t myapp .
docker run --rm -it -p 8000:8000 myapp
docker ps              # running containers
docker logs -f <id>    # follow logs
docker exec -it <id> sh
docker compose up -d
docker image prune
```

## Hands-on (do these in order, no AI for first attempt)
1. Dockerize a "hello world" Flask/FastAPI app. One Dockerfile, one command to run.
2. Add a second stage: build with full Python image, copy to slim. Compare sizes.
3. Add Postgres via docker-compose. Connect from your app over the compose network.
4. Mount a volume so DB data survives `docker compose down`.
5. **Real project**: dockerize the `jobscraper` itself. Backend + DB in one compose file.

## Common gotchas
- Builds slow? Order your `COPY` lines so requirements.txt is copied/installed *before* your source code — otherwise the cache busts on every file change.
- `localhost` inside a container is the *container*, not the host. Use `host.docker.internal` (Mac/Win) or compose service names.
- Files written inside a container without a volume vanish on restart.

## Your notes
<!-- Write what you learned, what tripped you up, links. -->
""",
    "Kubernetes": """# Kubernetes (K8s)

> Orchestrates containers across many machines. Heavy. Worth learning the *shape*, not every flag, as a junior.

## Why this matters
Most large companies run K8s. You won't deploy production clusters as a junior — but understanding pods, services, and how a deployment rolls out makes you legible in interviews.

## Core concepts
- [ ] **Pod** — smallest unit, usually one container
- [ ] **Deployment** — declarative spec for desired pod state + replicas
- [ ] **Service** — stable network endpoint in front of pods
- [ ] **Ingress** — HTTP routing into the cluster
- [ ] **ConfigMap / Secret** — config and credentials
- [ ] **Namespace** — logical isolation
- [ ] **kubectl** — the only CLI you need to learn

## Hands-on (local cluster, no cloud bill)
1. Install `kind` (Kubernetes in Docker). Create one-node cluster.
2. Deploy nginx with `kubectl create deployment nginx --image=nginx`.
3. Expose it as a Service. Port-forward and curl it.
4. Write the same in YAML (`deployment.yaml`, `service.yaml`). Apply, delete, re-apply.
5. Deploy your jobscraper as a Deployment with 2 replicas + a Service.

## What to skip as a junior
Helm internals, CRDs, operators, service mesh. Know they exist; don't dive.

## Curated resources
- Kubernetes docs Tutorials section (official)
- TechWorld with Nana — "Kubernetes Tutorial for Beginners" (1h video)

## Your notes
""",
    "AWS": """# AWS (Amazon Web Services)

> Cloud platform. Hundreds of services. As a junior, you only need ~10.

## Why this matters
AWS is the default cloud. "We deploy on AWS" is the most common single line in backend job descs.

## The 10 services you must know
- [ ] **EC2** — virtual machines
- [ ] **S3** — object storage (files, backups, static sites)
- [ ] **RDS** — managed Postgres/MySQL
- [ ] **Lambda** — run code without a server
- [ ] **API Gateway** — HTTP front for Lambda
- [ ] **IAM** — permissions. The thing that bites you most.
- [ ] **CloudWatch** — logs and metrics
- [ ] **Route 53** — DNS
- [ ] **VPC** — network. Just the basics: subnets, security groups.
- [ ] **ECS / Fargate** — run containers (alternative to K8s)

## Hands-on (use the free tier)
1. Spin up a t2.micro EC2. SSH in. Install Python. Curl from your laptop.
2. Create an S3 bucket. Upload a file. Make it public. Read it via HTTPS.
3. Create an RDS Postgres (free tier). Connect from your laptop.
4. Deploy a tiny Lambda + API Gateway returning JSON.
5. Lock down everything you opened. IAM least-privilege exercise.

## Money safety rules
- Set a billing alert at $1.
- Stop, don't terminate — but verify the EBS volume is also gone.
- Free tier expires after 12 months.

## Your notes
""",
    "TypeScript": """# TypeScript

> JavaScript with types. Catches bugs at compile time. Job market reality: most React jobs require it.

## Why this matters
~30% of frontend / full-stack listings explicitly require TS. The rest expect you to pick it up day one. This is the lowest-effort highest-impact skill to add given your React/Next stack.

## Core concepts
- [ ] **Type vs interface** — when to use each
- [ ] **Generics** — `function id<T>(x: T): T`
- [ ] **Union & intersection** — `string | number`, `A & B`
- [ ] **Narrowing** — `typeof`, `in`, type guards
- [ ] **Discriminated unions** — the killer pattern for state
- [ ] **Utility types** — `Partial`, `Pick`, `Omit`, `Record`, `ReturnType`
- [ ] **Strict mode** — turn it on, suffer once, never go back

## Hands-on
1. Convert one component of an existing React project to `.tsx`. Add explicit prop types.
2. Type a fetch call. Use `zod` to validate the response at runtime + infer the TS type.
3. Build a small typed Redux slice or context (e.g. todo list).
4. Refactor: replace every `any` you wrote in step 1 with a real type.

## Common gotchas
- `any` defeats the whole point. Use `unknown` if you really don't know.
- `as` casts lie. Avoid except at boundaries you know are safe.
- "TypeScript said it works, but it crashes at runtime" — because types are erased at runtime. Validate at edges.

## Your notes
""",
    "CI/CD": """# CI / CD

> Automated build, test, and deploy on every git push.

## Why this matters
Real teams ship multiple times a day. Manual deploys = no. Showing CI in your repo (green badge) signals you've worked like a professional.

## Core concepts
- [ ] **Pipeline / workflow** — YAML file describing steps
- [ ] **Stages** — typically: install → lint → test → build → deploy
- [ ] **Matrix builds** — same job, multiple Python/Node versions
- [ ] **Caching** — speed up by caching deps (huge win)
- [ ] **Secrets** — never in YAML, always in repo settings
- [ ] **Artifacts** — outputs you keep between jobs

## Hands-on with GitHub Actions
1. Add `.github/workflows/ci.yml` to the jobscraper repo.
2. Run `pytest` on every push and PR. Fail the build if tests fail.
3. Add `ruff` lint as a separate job. Parallel.
4. Cache `pip` deps. Compare build times before/after.
5. Add a deploy job that pushes a Docker image to GHCR on tag.

## Common gotchas
- Local works, CI fails → almost always env var, missing system package, or path assumption.
- A flaky test in CI = a real bug, not noise. Find the race.

## Your notes
""",
    "Redis": """# Redis

> Fast in-memory key-value store. Caches, queues, rate limits, sessions, locks.

## Why this matters
Once your DB queries get slow or you need a job queue, Redis is the first answer. Cheap, simple, ubiquitous.

## Core concepts (data types matter — Redis isn't just key/value)
- [ ] **STRING** — basic value
- [ ] **HASH** — small object
- [ ] **LIST** — ordered, push/pop both ends (queue)
- [ ] **SET / SORTED SET** — unique members, optional score (leaderboard)
- [ ] **TTL / EXPIRE** — auto-expire keys
- [ ] **Pub/Sub & Streams** — message passing

## Hands-on
1. Run Redis via docker. Use `redis-cli` to play.
2. Add a cache to one slow endpoint in the jobscraper API: cache-aside pattern.
3. Cache invalidation: when do you bust it? Decide a strategy.
4. Replace HTTP retry sleep with a Redis-based rate limiter.
5. Persist Redis state between restarts with AOF.

## Common gotchas
- "Cache stampede" — many clients miss at the same time, all rebuild → DB overloaded. Mitigate with locks or jitter.
- Forgetting TTL = infinite memory growth.
- Redis is single-threaded for commands. One slow command blocks everything.

## Your notes
""",
    "GraphQL": """# GraphQL

> Query language for APIs. Client asks for exactly the fields it wants.

## Why this matters
Not every job needs it, but ~15% list it. Understanding GraphQL also clarifies *why* REST has the problems it has.

## Core concepts
- [ ] **Schema** — types + queries + mutations + subscriptions
- [ ] **Resolvers** — functions that fetch field data
- [ ] **N+1 problem** — the GraphQL trap. Solution: DataLoader / batching.
- [ ] **Fragments** — reusable selection sets on the client
- [ ] **Apollo / urql / Relay** — client libs

## Hands-on
1. Build a GraphQL endpoint over your jobs DB using `strawberry` (Python) or `graphql-yoga` (Node).
2. Query for jobs with their skills in one round-trip. Compare to REST.
3. Recreate the N+1 problem by writing a naive resolver. Fix with DataLoader.
4. Connect a Next.js page using Apollo Client.

## Your notes
""",
    "Terraform": """# Terraform

> Declarative infrastructure. Write what you want, Terraform makes it so.

## Why this matters
Manual cloud clicks don't scale. Every infra job lists Terraform. Even as a junior, knowing what `.tf` files do is enough.

## Core concepts
- [ ] **Provider** — AWS/GCP/etc plugin
- [ ] **Resource** — declared piece of infra
- [ ] **State** — Terraform's record of what exists (live in S3 + lock in DynamoDB in real teams)
- [ ] **Plan vs Apply** — preview before changing
- [ ] **Modules** — reusable groups of resources
- [ ] **Variables / outputs** — params and exposed values

## Hands-on
1. Spin up an S3 bucket with Terraform. Destroy it. Re-create.
2. Add an EC2 + security group. Output the public IP.
3. Module-ize step 2 so you can call it with different regions.
4. Move state to S3 backend with DynamoDB locking.

## Common gotchas
- Editing infra in the AWS console after Terraform created it → drift. Terraform will try to "fix" your manual changes.
- `terraform destroy` is irreversible. Read the plan.

## Your notes
""",
    "Vue": """# Vue.js

> React's main competitor. Simpler templating, single-file components.

## Why this matters
Less common than React but ~10% of frontend listings. Quick to pick up if you know React.

## Core concepts (Vue 3 + Composition API)
- [ ] **Reactivity** — `ref`, `reactive`, `computed`, `watch`
- [ ] **Single-file components** (`.vue`) — template / script / style in one file
- [ ] **Directives** — `v-if`, `v-for`, `v-model`, `v-on`
- [ ] **Props + emits** — parent/child communication
- [ ] **Pinia** — official store (Vuex's replacement)
- [ ] **Nuxt** — Vue's Next.js

## Hands-on
1. Walk the official Vue tutorial end-to-end.
2. Rebuild one of your React pages in Vue + Pinia.
3. Try Nuxt: server-rendered Vue.

## Your notes
""",
    "Go": """# Go (Golang)

> Compiled, fast, simple language. Heavy in infra, microservices, cloud-native tools.

## Why this matters
Docker, Kubernetes, Prometheus, etcd, Terraform — all Go. Backend roles list it more each year.

## Core concepts
- [ ] **Goroutines** — lightweight concurrency
- [ ] **Channels** — pass data between goroutines
- [ ] **Interfaces** — implicit, structural typing
- [ ] **Error handling** — explicit, no exceptions
- [ ] **Struct + methods** — composition over inheritance
- [ ] **Standard library** — net/http, encoding/json, database/sql
- [ ] **`go mod`** — module system

## Hands-on
1. Do "A Tour of Go" front to back (it's interactive, takes one evening).
2. Write a `/healthz` HTTP server in stdlib only. ~30 lines.
3. Rewrite one collector of the jobscraper in Go. Compare to the Python version.
4. Add goroutines + channels: scrape multiple sources in parallel.

## Your notes
""",
}


GENERIC_TEMPLATE = """# {skill}

> {category}

## Why this matters
This skill appears in real junior job listings you're targeting. Use this page to capture what you learn — concepts, gotchas, code snippets, links.

## Core concepts (fill in as you learn)
- [ ] ...
- [ ] ...
- [ ] ...

## Hands-on (the only thing that actually teaches you)
1. ...
2. ...
3. ...

## Common gotchas
- ...

## Resources
<!-- Paste good links here as you find them. -->

## Your notes
<!-- Free-form. -->
"""


def starter_template(skill: str, category: str = "skill") -> str:
    if skill in TEMPLATES:
        return TEMPLATES[skill]
    return GENERIC_TEMPLATE.format(skill=skill, category=category)


def load_note(skill: str, category: str = "skill") -> str:
    p = note_path(skill)
    if not p.exists():
        p.write_text(starter_template(skill, category), encoding="utf-8")
    return p.read_text(encoding="utf-8")


def save_note(skill: str, content: str) -> None:
    note_path(skill).write_text(content, encoding="utf-8")


def reset_note(skill: str, category: str = "skill") -> str:
    p = note_path(skill)
    p.write_text(starter_template(skill, category), encoding="utf-8")
    return p.read_text(encoding="utf-8")
