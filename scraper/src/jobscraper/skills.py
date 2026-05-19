"""Curated skill dictionary. Each entry: canonical_name -> (category, aliases).

Categories: lang, framework, frontend, db, cloud, devops, data, ai, mobile,
tools, methodology, soft.

Aliases must be lowercase. Matching uses word boundaries on lowercased
description text.
"""
from __future__ import annotations

SKILLS: dict[str, tuple[str, list[str]]] = {
    # Languages
    "Python": ("lang", ["python"]),
    "JavaScript": ("lang", ["javascript", "js"]),
    "TypeScript": ("lang", ["typescript", "ts"]),
    "Java": ("lang", ["java"]),
    "C": ("lang", ["c programming", " c "]),
    "C++": ("lang", ["c\\+\\+", "cpp"]),
    "C#": ("lang", ["c#", "csharp"]),
    "Go": ("lang", ["golang", " go "]),
    "Rust": ("lang", ["rust"]),
    "Ruby": ("lang", ["ruby"]),
    "PHP": ("lang", ["php"]),
    "Kotlin": ("lang", ["kotlin"]),
    "Swift": ("lang", ["swift"]),
    "Scala": ("lang", ["scala"]),
    "SQL": ("lang", ["sql"]),
    "Bash": ("lang", ["bash", "shell scripting"]),
    "R": ("lang", [" r ,"]),

    # Frameworks (backend)
    "FastAPI": ("framework", ["fastapi"]),
    "Django": ("framework", ["django"]),
    "Flask": ("framework", ["flask"]),
    "Node.js": ("framework", ["node\\.js", "nodejs", "node js"]),
    "Express": ("framework", ["express\\.js", "expressjs", "express"]),
    "NestJS": ("framework", ["nestjs", "nest\\.js"]),
    "Spring": ("framework", ["spring boot", "spring"]),
    "Rails": ("framework", ["ruby on rails", "rails"]),
    "Laravel": ("framework", ["laravel"]),
    "ASP.NET": ("framework", ["asp\\.net", "\\.net core", "\\.net"]),
    "GraphQL": ("framework", ["graphql"]),
    "gRPC": ("framework", ["grpc"]),
    "REST": ("framework", ["rest api", "restful"]),

    # Frontend
    "React": ("frontend", ["react\\.js", "reactjs", "react"]),
    "Next.js": ("frontend", ["next\\.js", "nextjs"]),
    "Vue": ("frontend", ["vue\\.js", "vuejs", "vue"]),
    "Nuxt": ("frontend", ["nuxt"]),
    "Angular": ("frontend", ["angular"]),
    "Svelte": ("frontend", ["svelte", "sveltekit"]),
    "HTML": ("frontend", ["html5?"]),
    "CSS": ("frontend", ["css3?"]),
    "Tailwind": ("frontend", ["tailwind"]),
    "Sass": ("frontend", ["sass", "scss"]),
    "Redux": ("frontend", ["redux"]),
    "Vite": ("frontend", ["vite"]),
    "Webpack": ("frontend", ["webpack"]),

    # Databases
    "PostgreSQL": ("db", ["postgresql", "postgres"]),
    "MySQL": ("db", ["mysql", "mariadb"]),
    "SQLite": ("db", ["sqlite"]),
    "MongoDB": ("db", ["mongodb", "mongo"]),
    "Redis": ("db", ["redis"]),
    "Elasticsearch": ("db", ["elasticsearch", "elastic search"]),
    "Cassandra": ("db", ["cassandra"]),
    "DynamoDB": ("db", ["dynamodb"]),
    "SQL Server": ("db", ["sql server", "mssql"]),
    "Oracle DB": ("db", ["oracle db", "oracle database"]),

    # Cloud
    "AWS": ("cloud", ["aws", "amazon web services"]),
    "GCP": ("cloud", ["gcp", "google cloud"]),
    "Azure": ("cloud", ["azure"]),
    "S3": ("cloud", ["s3"]),
    "EC2": ("cloud", ["ec2"]),
    "Lambda": ("cloud", ["aws lambda", "lambda function"]),
    "Cloudflare": ("cloud", ["cloudflare"]),
    "Vercel": ("cloud", ["vercel"]),
    "Heroku": ("cloud", ["heroku"]),
    "DigitalOcean": ("cloud", ["digitalocean", "digital ocean"]),

    # DevOps
    "Docker": ("devops", ["docker"]),
    "Kubernetes": ("devops", ["kubernetes", "k8s"]),
    "Terraform": ("devops", ["terraform"]),
    "Ansible": ("devops", ["ansible"]),
    "Jenkins": ("devops", ["jenkins"]),
    "GitHub Actions": ("devops", ["github actions"]),
    "GitLab CI": ("devops", ["gitlab ci", "gitlab-ci"]),
    "CircleCI": ("devops", ["circleci", "circle ci"]),
    "Linux": ("devops", ["linux"]),
    "Nginx": ("devops", ["nginx"]),
    "Prometheus": ("devops", ["prometheus"]),
    "Grafana": ("devops", ["grafana"]),
    "CI/CD": ("devops", ["ci/cd", "ci / cd", "continuous integration"]),

    # Data / AI
    "Pandas": ("data", ["pandas"]),
    "NumPy": ("data", ["numpy"]),
    "Spark": ("data", ["apache spark", "pyspark", "spark"]),
    "Kafka": ("data", ["kafka"]),
    "Airflow": ("data", ["airflow"]),
    "dbt": ("data", ["dbt"]),
    "Snowflake": ("data", ["snowflake"]),
    "BigQuery": ("data", ["bigquery"]),
    "ETL": ("data", ["etl", "elt"]),
    "TensorFlow": ("ai", ["tensorflow"]),
    "PyTorch": ("ai", ["pytorch"]),
    "scikit-learn": ("ai", ["scikit-learn", "sklearn"]),
    "LangChain": ("ai", ["langchain"]),
    "LLM": ("ai", ["llm", "large language model"]),
    "Machine Learning": ("ai", ["machine learning"]),
    "Deep Learning": ("ai", ["deep learning"]),
    "NLP": ("ai", ["nlp", "natural language processing"]),

    # Mobile
    "React Native": ("mobile", ["react native"]),
    "Flutter": ("mobile", ["flutter"]),
    "Android": ("mobile", ["android"]),
    "iOS": ("mobile", ["ios development", " ios "]),

    # Tools / methodology
    "Git": ("tools", ["git"]),
    "GitHub": ("tools", ["github"]),
    "GitLab": ("tools", ["gitlab"]),
    "Jira": ("tools", ["jira"]),
    "Figma": ("tools", ["figma"]),
    "Agile": ("methodology", ["agile"]),
    "Scrum": ("methodology", ["scrum"]),
    "Kanban": ("methodology", ["kanban"]),
    "TDD": ("methodology", ["tdd", "test-driven", "test driven"]),
    "DDD": ("methodology", ["domain-driven", "ddd"]),
    "Microservices": ("methodology", ["microservices", "micro-services"]),
    "OOP": ("methodology", ["object-oriented", "oop"]),
    "Functional Programming": ("methodology", ["functional programming"]),
    "Design Patterns": ("methodology", ["design patterns"]),
    "Unit Testing": ("methodology", ["unit test", "unit testing"]),

    # Soft
    "English": ("soft", ["english (b2|c1|c2|fluent|proficient|advanced)", "fluent english"]),
    "Communication": ("soft", ["communication skills"]),
    "Teamwork": ("soft", ["teamwork", "team player"]),
    "Problem Solving": ("soft", ["problem[- ]solving"]),
}


SENIORITY_PATTERNS = {
    "intern": [r"\bintern\b", r"\binternship\b", r"\bstajyer\b", r"\bstaj\b"],
    "junior": [r"\bjunior\b", r"\bjr\.?\b", r"\bentry[- ]level\b", r"\bgraduate\b", r"\bnew grad\b", r"0[-+ ]?[12]\s*years?", r"\bjr\b"],
    "mid": [r"\bmid[- ]level\b", r"\bintermediate\b", r"[2-5]\s*[-+]?\s*years?"],
    "senior": [r"\bsenior\b", r"\bsr\.?\b", r"\blead\b", r"\bstaff\b", r"\bprincipal\b", r"[5-9]\+?\s*years?", r"10\+?\s*years?"],
}
