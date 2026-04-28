import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("task-7004 オフライン運用対応", () => {
  it("client styles do not import fonts from external domains", () => {
    const globalCss = readFileSync(resolve("src/client/styles/global.css"), "utf8");
    const tokensCss = readFileSync(resolve("src/client/styles/tokens.css"), "utf8");
    const css = `${globalCss}\n${tokensCss}`;

    expect(css).not.toMatch(/@import\s+url\(["']?https?:\/\//u);
    expect(css).not.toMatch(/googleapis\.com|gstatic\.com/u);
  });
});
