import { describe, expect, test } from "vitest";
import { defaultHighlightHex } from "../src/ui/highlight-colors";

describe("default highlight colors", () => {
	test("each theme has its own Notion fill at 0% intensity", () => {
		expect(defaultHighlightHex("yellow", "light", 0)).toBe("#f4f1e5");
		expect(defaultHighlightHex("yellow", "dark", 0)).toBe("#4a3e2c");
	});

	test("intensity mixes toward the color's tone, like the CSS color-mix", () => {
		expect(defaultHighlightHex("red", "light", 100)).toBe("#d34c47");
		expect(defaultHighlightHex("gray", "light", 50)).toBe("#b5b4b2");
	});
});
