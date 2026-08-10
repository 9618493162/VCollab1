import { describe, expect, it } from "vitest";
import { cn } from "@/lib/utils";

describe("cn", () => {
  it("joins class strings and drops falsy values", () => {
    expect(cn("a", "b", false && "c", undefined, null, 0, "d")).toBe("a b d");
  });

  it("merges conflicting Tailwind classes with the last one winning", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
    expect(cn("text-red-500", "bg-red-500", "text-blue-600")).toBe(
      "bg-red-500 text-blue-600",
    );
  });

  it("returns an empty string when given nothing", () => {
    expect(cn()).toBe("");
  });
});
