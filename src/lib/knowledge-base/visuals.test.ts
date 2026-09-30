import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { KB_CONFIG } from "./config";
import { alphaFor, sizeFor } from "./visuals";

const DAY_MS = 24 * 60 * 60 * 1000;

describe("sizeFor", () => {
  it("spans the configured range", () => {
    assert.equal(sizeFor(0, 25).width, KB_CONFIG.MIN_NODE_WIDTH);
    assert.equal(sizeFor(25, 25).width, KB_CONFIG.MAX_NODE_WIDTH);
    assert.equal(sizeFor(25, 25).titleFontPx, KB_CONFIG.MAX_TITLE_FONT_PX);
  });

  it("grows with evidence and never exceeds the maximum", () => {
    assert.ok(sizeFor(4, 25).width > sizeFor(1, 25).width);
    assert.equal(sizeFor(100, 25).width, KB_CONFIG.MAX_NODE_WIDTH);
  });
});

describe("alphaFor", () => {
  const now = Date.parse("2026-09-29T00:00:00Z");

  it("is fully opaque for fresh topics", () => {
    assert.equal(alphaFor(new Date(now).toISOString(), now), 1);
  });

  it("halves the fade after one half-life", () => {
    const at = new Date(now - KB_CONFIG.RECENCY_HALF_LIFE_DAYS * DAY_MS).toISOString();
    const expected = KB_CONFIG.MIN_NODE_ALPHA + (1 - KB_CONFIG.MIN_NODE_ALPHA) / 2;
    assert.ok(Math.abs(alphaFor(at, now) - expected) < 1e-9);
  });

  it("never drops below the floor", () => {
    const ancient = new Date(now - 10_000 * DAY_MS).toISOString();
    assert.ok(alphaFor(ancient, now) >= KB_CONFIG.MIN_NODE_ALPHA);
    assert.equal(alphaFor("not a date", now), KB_CONFIG.MIN_NODE_ALPHA);
  });
});
