import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeCacheTtl,
  resolveBalanceInfo,
  formatCurrency,
  trimTrailingSlash,
} from "../src/utils.js";

test("normalizeCacheTtl returns defaults and clamps negatives", () => {
  assert.equal(normalizeCacheTtl(undefined), 60 * 60 * 1000);
  assert.equal(normalizeCacheTtl("900000"), 900000);
  assert.equal(normalizeCacheTtl(-5), 0);
  assert.equal(normalizeCacheTtl("oops"), 60 * 60 * 1000);
});

test("resolveBalanceInfo prefers available balance and defaults currency", () => {
  const info = resolveBalanceInfo({
    id: "acct-1",
    "available-balance": "123.45",
    balance: "200.00",
  });
  assert.deepEqual(info, { amount: 123.45, currency: "USD" });
});

test("formatCurrency formats when possible and falls back gracefully", () => {
  assert.equal(formatCurrency(12.5, "USD"), "$12.50");
  assert.equal(formatCurrency(NaN, "USD"), "NaN USD");
});

test("trimTrailingSlash tolerates falsy values", () => {
  assert.equal(
    trimTrailingSlash("http://example.com///"),
    "http://example.com",
  );
  assert.equal(trimTrailingSlash(), "");
});
