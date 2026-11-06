import assert from "node:assert/strict";

globalThis.fetch = async () => {
  throw new Error("Network unavailable");
};
const { homeContent, products, productDetail, categories } =
  await import("../../../apps/web/lib/catalog.ts");
assert.deepEqual(await homeContent(), { value: null, error: true });
assert.deepEqual(await products({ page: 1, pageSize: 12 }), {
  value: null,
  error: true,
});
assert.deepEqual(await productDetail("00000000-0000-0000-0000-000000000001"), {
  value: null,
  missing: false,
  error: true,
});
assert.deepEqual(await categories(), { value: null, error: true });
console.log("Catalog and home API failure states passed.");
