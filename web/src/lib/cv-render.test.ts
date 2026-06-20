import { describe, expect, test } from "vitest";
import { renderMarkdown } from "./cv-render";

describe("renderMarkdown", () => {
  test("name + contact + skills above minLevel", () => {
    const md = renderMarkdown(
      {
        personal: {
          name: "Mo",
          email: "mo@example.com",
          links: { github: "https://gh/mo" },
        },
        skills: { React: 4, Python: 5, Foo: 1 },
      },
      3,
    );
    expect(md).toContain("# Mo");
    expect(md).toContain("mo@example.com");
    expect(md).toContain("[GitHub](https://gh/mo)");
    expect(md).toContain("## Skills");
    expect(md).toContain("Python");
    expect(md).toContain("React");
    expect(md).not.toContain("Foo");
  });

  test("experience: raw with bullet glyphs becomes header + bullets", () => {
    const md = renderMarkdown({
      experience: [{ raw: "Eng (Acme) 2024 ● built X ● shipped Y" }],
    });
    expect(md).toContain("**Eng (Acme) 2024**");
    expect(md).toContain("- built X");
    expect(md).toContain("- shipped Y");
  });

  test("structured experience: role/company/period/bullets", () => {
    const md = renderMarkdown({
      experience: [
        {
          role: "SWE",
          company: "Acme",
          start: "2023",
          end: "2024",
          bullets: ["did stuff"],
        },
      ],
    });
    expect(md).toContain("**SWE — Acme** _2023 2024_");
    expect(md).toContain("- did stuff");
  });

  test("empty profile renders just default name", () => {
    const md = renderMarkdown({});
    expect(md.trim()).toBe("# Your Name");
  });
});
