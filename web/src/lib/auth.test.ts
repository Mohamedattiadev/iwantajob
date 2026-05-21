import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  readSketchToken, setSketchToken, clearSketchToken,
  appendTokenToUrl, authHeaders,
} from "./auth";

describe("auth helpers", () => {
  const origLocation = window.location;
  beforeEach(() => { localStorage.clear(); });
  afterEach(() => {
    // restore in case a test replaced location
    Object.defineProperty(window, "location", { value: origLocation, configurable: true });
  });

  const setLocation = (href: string) => {
    Object.defineProperty(window, "location", {
      value: new URL(href),
      configurable: true,
    });
  };

  describe("readSketchToken", () => {
    it("returns empty string when nothing is set", () => {
      setLocation("http://localhost:3000/sketch/foo");
      expect(readSketchToken()).toBe("");
    });

    it("picks up `?t=` from the URL and stashes it in localStorage", () => {
      setLocation("http://localhost:3000/sketch/foo?t=abc123");
      expect(readSketchToken()).toBe("abc123");
      expect(localStorage.getItem("sketchToken")).toBe("abc123");
    });

    it("falls back to localStorage when URL has no `t=` param", () => {
      localStorage.setItem("sketchToken", "stored-token");
      setLocation("http://localhost:3000/sketch/foo");
      expect(readSketchToken()).toBe("stored-token");
    });

    it("URL `t=` overrides any prior localStorage value", () => {
      localStorage.setItem("sketchToken", "old");
      setLocation("http://localhost:3000/sketch/foo?t=new");
      expect(readSketchToken()).toBe("new");
      expect(localStorage.getItem("sketchToken")).toBe("new");
    });
  });

  describe("setSketchToken / clearSketchToken", () => {
    it("setSketchToken writes to localStorage", () => {
      setSketchToken("hello");
      expect(localStorage.getItem("sketchToken")).toBe("hello");
    });
    it("clearSketchToken removes the entry", () => {
      localStorage.setItem("sketchToken", "x");
      clearSketchToken();
      expect(localStorage.getItem("sketchToken")).toBeNull();
    });
  });

  describe("appendTokenToUrl", () => {
    it("no-ops when token is empty", () => {
      setLocation("http://localhost:3000/");
      expect(appendTokenToUrl("/sketch/foo", "")).toBe("/sketch/foo");
    });
    it("appends with `?` when no query exists", () => {
      expect(appendTokenToUrl("/sketch/foo", "abc")).toBe("/sketch/foo?t=abc");
    });
    it("appends with `&` when a query already exists", () => {
      expect(appendTokenToUrl("/sketch/foo?mode=edit", "abc")).toBe("/sketch/foo?mode=edit&t=abc");
    });
    it("encodes special chars in the token", () => {
      expect(appendTokenToUrl("/sketch/foo", "a/b+c=d"))
        .toBe(`/sketch/foo?t=${encodeURIComponent("a/b+c=d")}`);
    });
  });

  describe("authHeaders", () => {
    it("returns empty object when no token", () => {
      setLocation("http://localhost:3000/");
      expect(authHeaders("")).toEqual({});
    });
    it("returns the X-Auth-Token header when token present", () => {
      expect(authHeaders("abc")).toEqual({ "X-Auth-Token": "abc" });
    });
  });
});
