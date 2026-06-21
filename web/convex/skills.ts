// Curated skill dictionary. Mirrors scraper/jobscraper/skills.py:SKILLS so
// the Convex side can detect market-demanded skills inside job text without
// needing a Python service. Aliases are lowercase; matching is word-bound
// against the lowercased job text.

export type SkillEntry = { canonical: string; category: string; aliases: string[] };

export const SKILLS: SkillEntry[] = [
  // Languages
  { canonical: "Python", category: "lang", aliases: ["python"] },
  { canonical: "JavaScript", category: "lang", aliases: ["javascript", "js"] },
  { canonical: "TypeScript", category: "lang", aliases: ["typescript", "ts"] },
  { canonical: "Java", category: "lang", aliases: ["java"] },
  { canonical: "C++", category: "lang", aliases: ["c\\+\\+", "cpp"] },
  { canonical: "C#", category: "lang", aliases: ["c#", "csharp"] },
  { canonical: "Go", category: "lang", aliases: ["golang"] },
  { canonical: "Rust", category: "lang", aliases: ["rust"] },
  { canonical: "Ruby", category: "lang", aliases: ["ruby"] },
  { canonical: "PHP", category: "lang", aliases: ["php"] },
  { canonical: "Kotlin", category: "lang", aliases: ["kotlin"] },
  { canonical: "Swift", category: "lang", aliases: ["swift"] },
  { canonical: "Scala", category: "lang", aliases: ["scala"] },
  { canonical: "SQL", category: "lang", aliases: ["sql"] },
  { canonical: "Bash", category: "lang", aliases: ["bash", "shell scripting"] },

  // Frameworks (backend)
  { canonical: "FastAPI", category: "framework", aliases: ["fastapi"] },
  { canonical: "Django", category: "framework", aliases: ["django"] },
  { canonical: "Flask", category: "framework", aliases: ["flask"] },
  { canonical: "Node.js", category: "framework", aliases: ["node\\.js", "nodejs", "node js"] },
  { canonical: "Express", category: "framework", aliases: ["express\\.js", "expressjs", "express"] },
  { canonical: "NestJS", category: "framework", aliases: ["nestjs", "nest\\.js"] },
  { canonical: "Spring", category: "framework", aliases: ["spring boot", "spring"] },
  { canonical: "Rails", category: "framework", aliases: ["ruby on rails", "rails"] },
  { canonical: "Laravel", category: "framework", aliases: ["laravel"] },
  { canonical: "ASP.NET", category: "framework", aliases: ["asp\\.net", "\\.net core", "\\.net"] },
  { canonical: "GraphQL", category: "framework", aliases: ["graphql"] },
  { canonical: "gRPC", category: "framework", aliases: ["grpc"] },
  { canonical: "REST", category: "framework", aliases: ["rest api", "restful"] },

  // Frontend
  { canonical: "React", category: "frontend", aliases: ["react\\.js", "reactjs", "react"] },
  { canonical: "Next.js", category: "frontend", aliases: ["next\\.js", "nextjs"] },
  { canonical: "Vue", category: "frontend", aliases: ["vue\\.js", "vuejs", "vue"] },
  { canonical: "Nuxt", category: "frontend", aliases: ["nuxt"] },
  { canonical: "Angular", category: "frontend", aliases: ["angular"] },
  { canonical: "Svelte", category: "frontend", aliases: ["svelte", "sveltekit"] },
  { canonical: "HTML", category: "frontend", aliases: ["html5?"] },
  { canonical: "CSS", category: "frontend", aliases: ["css3?"] },
  { canonical: "Tailwind", category: "frontend", aliases: ["tailwind"] },
  { canonical: "Sass", category: "frontend", aliases: ["sass", "scss"] },
  { canonical: "Redux", category: "frontend", aliases: ["redux"] },
  { canonical: "Vite", category: "frontend", aliases: ["vite"] },
  { canonical: "Webpack", category: "frontend", aliases: ["webpack"] },

  // Databases
  { canonical: "PostgreSQL", category: "db", aliases: ["postgresql", "postgres"] },
  { canonical: "MySQL", category: "db", aliases: ["mysql", "mariadb"] },
  { canonical: "SQLite", category: "db", aliases: ["sqlite"] },
  { canonical: "MongoDB", category: "db", aliases: ["mongodb", "mongo"] },
  { canonical: "Redis", category: "db", aliases: ["redis"] },
  { canonical: "Elasticsearch", category: "db", aliases: ["elasticsearch", "elastic search"] },
  { canonical: "Cassandra", category: "db", aliases: ["cassandra"] },
  { canonical: "DynamoDB", category: "db", aliases: ["dynamodb"] },
  { canonical: "SQL Server", category: "db", aliases: ["sql server", "mssql"] },

  // Cloud
  { canonical: "AWS", category: "cloud", aliases: ["aws", "amazon web services"] },
  { canonical: "GCP", category: "cloud", aliases: ["gcp", "google cloud"] },
  { canonical: "Azure", category: "cloud", aliases: ["azure"] },
  { canonical: "Cloudflare", category: "cloud", aliases: ["cloudflare"] },
  { canonical: "Vercel", category: "cloud", aliases: ["vercel"] },
  { canonical: "Heroku", category: "cloud", aliases: ["heroku"] },

  // DevOps
  { canonical: "Docker", category: "devops", aliases: ["docker"] },
  { canonical: "Kubernetes", category: "devops", aliases: ["kubernetes", "k8s"] },
  { canonical: "Terraform", category: "devops", aliases: ["terraform"] },
  { canonical: "Ansible", category: "devops", aliases: ["ansible"] },
  { canonical: "Jenkins", category: "devops", aliases: ["jenkins"] },
  { canonical: "GitHub Actions", category: "devops", aliases: ["github actions"] },
  { canonical: "GitLab CI", category: "devops", aliases: ["gitlab ci", "gitlab-ci"] },
  { canonical: "Linux", category: "devops", aliases: ["linux"] },
  { canonical: "Nginx", category: "devops", aliases: ["nginx"] },
  { canonical: "CI/CD", category: "devops", aliases: ["ci/cd", "continuous integration"] },

  // Data / AI
  { canonical: "Pandas", category: "data", aliases: ["pandas"] },
  { canonical: "NumPy", category: "data", aliases: ["numpy"] },
  { canonical: "Spark", category: "data", aliases: ["apache spark", "pyspark", "spark"] },
  { canonical: "Kafka", category: "data", aliases: ["kafka"] },
  { canonical: "Airflow", category: "data", aliases: ["airflow"] },
  { canonical: "Snowflake", category: "data", aliases: ["snowflake"] },
  { canonical: "BigQuery", category: "data", aliases: ["bigquery"] },
  { canonical: "ETL", category: "data", aliases: ["etl", "elt"] },
  { canonical: "TensorFlow", category: "ai", aliases: ["tensorflow"] },
  { canonical: "PyTorch", category: "ai", aliases: ["pytorch"] },
  { canonical: "scikit-learn", category: "ai", aliases: ["scikit-learn", "sklearn"] },
  { canonical: "LangChain", category: "ai", aliases: ["langchain"] },
  { canonical: "Machine Learning", category: "ai", aliases: ["machine learning"] },
  { canonical: "Deep Learning", category: "ai", aliases: ["deep learning"] },
  { canonical: "NLP", category: "ai", aliases: ["nlp", "natural language processing"] },

  // Mobile
  { canonical: "React Native", category: "mobile", aliases: ["react native"] },
  { canonical: "Flutter", category: "mobile", aliases: ["flutter"] },
  { canonical: "Android", category: "mobile", aliases: ["android"] },

  // Tools / methodology
  { canonical: "Git", category: "tools", aliases: ["git"] },
  { canonical: "GitHub", category: "tools", aliases: ["github"] },
  { canonical: "GitLab", category: "tools", aliases: ["gitlab"] },
  { canonical: "Jira", category: "tools", aliases: ["jira"] },
  { canonical: "Figma", category: "tools", aliases: ["figma"] },
  { canonical: "Agile", category: "methodology", aliases: ["agile"] },
  { canonical: "Scrum", category: "methodology", aliases: ["scrum"] },
  { canonical: "TDD", category: "methodology", aliases: ["tdd", "test-driven", "test driven"] },
  { canonical: "Microservices", category: "methodology", aliases: ["microservices", "micro-services"] },
];

// Pre-compile regexes once. Word-bound on lowercased text.
const COMPILED: Array<{ canonical: string; category: string; pattern: RegExp }> = SKILLS.map((s) => ({
  canonical: s.canonical,
  category: s.category,
  pattern: new RegExp(`(?<![a-z0-9_])(?:${s.aliases.join("|")})(?![a-z0-9_])`, "i"),
}));

export function extractSkills(text: string): Array<{ skill: string; category: string }> {
  if (!text) return [];
  const out: Array<{ skill: string; category: string }> = [];
  for (const { canonical, category, pattern } of COMPILED) {
    if (pattern.test(text)) out.push({ skill: canonical, category });
  }
  return out;
}
