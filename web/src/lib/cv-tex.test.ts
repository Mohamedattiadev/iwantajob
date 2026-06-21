import { describe, it, expect } from "vitest";
import { renderTex } from "@/lib/cv-tex";
import type { Profile } from "@/lib/api";

const p: Profile = {
  personal: {name:"Test User",email:"a@b.com",phone:"+1234",location:"Cairo",links:{github:"https://github.com/x",linkedin:"https://linkedin.com/in/x"},summary:""},
  skills: {Python:4,React:3,Docker:3,AWS:3,TypeScript:4},
  experience: [{raw:"Engineer at X 2024-now ● shipped ● fixed bugs"}],
  projects: [{raw:"Proj ● did"}],
  education: [{raw:"BSc CS, Univ, 2020-2024"}],
  languages: [{name:"English",level:"Native"}],
  certifications: [],
};

describe("renderTex", () => {
  it("emits a complete document for classic", () => {
    const tex = renderTex(p, 3, "classic");
    expect(tex).toContain("\\documentclass[10pt,a4paper]{article}");
    expect(tex).toContain("\\begin{document}");
    expect(tex).toContain("\\end{document}");
    expect(tex).toContain("Test User");
    expect(tex).toContain("Engineer at X 2024-now");
    expect(tex).toContain("Python");
  });
  it("emits tcolorbox header for banner", () => {
    const tex = renderTex(p, 3, "banner");
    expect(tex).toContain("\\begin{tcolorbox}");
    expect(tex).toContain("bannerbg");
  });
  it("escapes special chars", () => {
    const px: Profile = {...p, personal: {...p.personal, name: "A & B $5 50%"}};
    const tex = renderTex(px);
    expect(tex).toContain("A \\& B \\$5 50\\%");
  });
});
