import { describe, expect, it } from "vitest";
import { formatSize } from "./FileSharingPanel";

describe("formatSize", () => {
  it("formats bytes without decimals", () => {
    expect(formatSize(0)).toBe("0 B");
    expect(formatSize(512)).toBe("512 B");
    expect(formatSize(1023)).toBe("1023 B");
  });

  it("formats kilobytes with one decimal", () => {
    expect(formatSize(1024)).toBe("1.0 KB");
    expect(formatSize(1536)).toBe("1.5 KB");
  });

  it("formats megabytes with one decimal", () => {
    expect(formatSize(5 * 1024 * 1024)).toBe("5.0 MB");
    expect(formatSize(10.25 * 1024 * 1024)).toBe("10.3 MB");
  });
});
