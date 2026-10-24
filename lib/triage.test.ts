import { describe, expect, it } from "vitest";
import { TRIAGE_JSON_SCHEMA } from "./schema";
import { parseTriage } from "./triage";

const valid = {
  category: "billing",
  priority: "high",
  summary: "Customer was charged twice for the Business plan.",
  suggested_action: "Refund the duplicate charge.",
};
const validJson = JSON.stringify(valid);

describe("parseTriage", () => {
  it("accepts valid JSON", () => {
    expect(parseTriage(validJson)).toEqual({ ok: true, data: valid });
  });

  it("accepts JSON in a ```json fence", () => {
    expect(parseTriage("```json\n" + validJson + "\n```")).toEqual({ ok: true, data: valid });
  });

  it("accepts JSON in a fence without a language tag", () => {
    expect(parseTriage("```\n" + validJson + "\n```")).toEqual({ ok: true, data: valid });
  });

  it("rejects a missing field", () => {
    const { suggested_action: _omit, ...missing } = valid;
    const result = parseTriage(JSON.stringify(missing));
    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toBe("schema_mismatch");
    expect(!result.ok && result.issues?.[0].path).toEqual(["suggested_action"]);
  });

  it("rejects a wrong enum value", () => {
    const result = parseTriage(JSON.stringify({ ...valid, priority: "urgent" }));
    expect(result.ok).toBe(false);
    expect(!result.ok && result.issues?.[0].path).toEqual(["priority"]);
  });

  it("rejects an extra field", () => {
    const result = parseTriage(JSON.stringify({ ...valid, confidence: 0.9 }));
    expect(result.ok).toBe(false);
    expect(!result.ok && result.issues?.[0].code).toBe("unrecognized_keys");
  });

  it("rejects non-JSON text", () => {
    expect(parseTriage("Category: billing. Priority: high.")).toEqual({
      ok: false,
      reason: "invalid_json",
    });
  });
});

describe("TRIAGE_JSON_SCHEMA", () => {
  it("is strict: no extra keys and every field required", () => {
    expect(TRIAGE_JSON_SCHEMA.additionalProperties).toBe(false);
    expect(TRIAGE_JSON_SCHEMA.required).toEqual([
      "category",
      "priority",
      "summary",
      "suggested_action",
    ]);
  });
});
