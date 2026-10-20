import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(".github/workflows/ci.yml", "utf8");

const pinnedActions = (source: string) => {
  const uses = [...source.matchAll(/^\s*(?:-\s*)?uses:\s+(\S+)/gm)];
  for (const [, reference] of uses) {
    if (!reference.startsWith("./")) {
      expect(reference).toMatch(/^[^@\s]+@[0-9a-f]{40}$/);
    }
  }
  return uses.map(([, reference]) => reference.split("@")[0]);
};

describe("CI workflow", () => {
  it("pins both actions to full commit SHAs", () => {
    expect(pinnedActions(workflow)).toEqual([
      "actions/checkout",
      "actions/setup-node",
    ]);
  });

  it("checks third-party actions and references without revisions", () => {
    expect(() => pinnedActions("- uses: vendor/action@v1")).toThrow();
    expect(() => pinnedActions("- uses: vendor/action")).toThrow();
  });

  it("requires build and test scripts", () => {
    expect(workflow).toMatch(/^\s*- run: npm run build$/m);
    expect(workflow).toMatch(/^\s*- run: npm test$/m);
  });

  it("does not persist checkout credentials", () => {
    expect(workflow).toMatch(
      /- uses: actions\/checkout@[0-9a-f]{40}[^\n]*\n\s+with:\n\s+persist-credentials: false(?:\n|$)/,
    );
  });
});
