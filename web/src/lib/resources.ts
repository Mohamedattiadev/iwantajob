// Curated free learning resources per skill. Hand-picked, not exhaustive.
// Add to this list as you discover good material.

export type Resource = { title: string; url: string; kind: "docs" | "course" | "video" | "book" | "project" };

export const RESOURCES: Record<string, Resource[]> = {
  Docker: [
    { title: "Docker official docs — Get Started", url: "https://docs.docker.com/get-started/", kind: "docs" },
    { title: "Docker Curriculum (free)", url: "https://docker-curriculum.com/", kind: "course" },
    { title: "Patrick Loeber — Docker in 10 min", url: "https://www.youtube.com/watch?v=pTFZFxd4hOI", kind: "video" },
    { title: "Build: Dockerize the scraper itself", url: "/jobs?q=docker", kind: "project" },
  ],
  Kubernetes: [
    { title: "Kubernetes official tutorial", url: "https://kubernetes.io/docs/tutorials/", kind: "docs" },
    { title: "kubernetes-the-hard-way", url: "https://github.com/kelseyhightower/kubernetes-the-hard-way", kind: "project" },
    { title: "TechWorld with Nana — K8s in 1h", url: "https://www.youtube.com/watch?v=X48VuDVv0do", kind: "video" },
  ],
  AWS: [
    { title: "AWS Free Tier", url: "https://aws.amazon.com/free/", kind: "docs" },
    { title: "AWS Cloud Practitioner Essentials (free)", url: "https://skillbuilder.aws/", kind: "course" },
    { title: "FreeCodeCamp — AWS Certified Cloud Practitioner", url: "https://www.youtube.com/watch?v=SOTamWNgDKc", kind: "video" },
  ],
  TypeScript: [
    { title: "TS Handbook", url: "https://www.typescriptlang.org/docs/handbook/intro.html", kind: "docs" },
    { title: "Total TypeScript Beginners (free)", url: "https://www.totaltypescript.com/tutorials", kind: "course" },
    { title: "Project: convert one of your React apps to TS", url: "/jobs?skill=TypeScript", kind: "project" },
  ],
  GraphQL: [
    { title: "How to GraphQL", url: "https://www.howtographql.com/", kind: "course" },
    { title: "Apollo docs", url: "https://www.apollographql.com/docs/", kind: "docs" },
  ],
  Redis: [
    { title: "Redis University (free)", url: "https://university.redis.com/", kind: "course" },
    { title: "Redis docs — data types", url: "https://redis.io/docs/data-types/", kind: "docs" },
    { title: "Add Redis cache to the scraper", url: "/jobs?skill=Redis", kind: "project" },
  ],
  Terraform: [
    { title: "Terraform tutorials by HashiCorp", url: "https://developer.hashicorp.com/terraform/tutorials", kind: "course" },
  ],
  "CI/CD": [
    { title: "GitHub Actions docs", url: "https://docs.github.com/en/actions/learn-github-actions", kind: "docs" },
    { title: "Add CI to the scraper repo (lint + tests)", url: "https://docs.github.com/en/actions", kind: "project" },
  ],
  Go: [
    { title: "A Tour of Go", url: "https://go.dev/tour/welcome/1", kind: "course" },
    { title: "Effective Go", url: "https://go.dev/doc/effective_go", kind: "docs" },
  ],
  Vue: [
    { title: "Vue official tutorial", url: "https://vuejs.org/tutorial/", kind: "course" },
  ],
  Angular: [
    { title: "Angular Tour of Heroes", url: "https://angular.dev/tutorials/learn-angular", kind: "course" },
  ],
  MongoDB: [
    { title: "MongoDB University (free)", url: "https://learn.mongodb.com/", kind: "course" },
  ],
  Ansible: [
    { title: "Ansible Getting Started", url: "https://docs.ansible.com/ansible/latest/getting_started/index.html", kind: "docs" },
  ],
  GCP: [
    { title: "Google Cloud Skills Boost (free credits)", url: "https://www.cloudskillsboost.google/", kind: "course" },
  ],
  "Machine Learning": [
    { title: "Andrew Ng — Machine Learning Specialization", url: "https://www.coursera.org/specializations/machine-learning-introduction", kind: "course" },
    { title: "scikit-learn user guide", url: "https://scikit-learn.org/stable/user_guide.html", kind: "docs" },
  ],
  Rails: [
    { title: "Getting Started with Rails", url: "https://guides.rubyonrails.org/getting_started.html", kind: "docs" },
  ],
  Ruby: [
    { title: "The Odin Project — Ruby", url: "https://www.theodinproject.com/paths/full-stack-ruby-on-rails/courses/ruby", kind: "course" },
  ],
  Redux: [
    { title: "Redux Toolkit Essentials", url: "https://redux.js.org/tutorials/essentials/part-1-overview-concepts", kind: "docs" },
  ],
  Django: [
    { title: "Django docs tutorial", url: "https://docs.djangoproject.com/en/stable/intro/tutorial01/", kind: "docs" },
  ],
  Microservices: [
    { title: "microservices.io patterns", url: "https://microservices.io/patterns/index.html", kind: "docs" },
  ],
  Communication: [
    { title: "Write the Docs — Documentation guide", url: "https://www.writethedocs.org/guide/", kind: "docs" },
  ],
  "Problem Solving": [
    { title: "NeetCode 150", url: "https://neetcode.io/practice", kind: "course" },
    { title: "LeetCode patterns", url: "https://seanprashad.com/leetcode-patterns/", kind: "docs" },
  ],
};

export function resourcesFor(skill: string): Resource[] {
  return RESOURCES[skill] ?? [];
}
