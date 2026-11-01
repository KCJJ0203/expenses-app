const test = require("node:test");
const assert = require("node:assert/strict");
const V = require("./vault.js");

test("defaultsFromHost derives the owner from a github.io host", () => {
  assert.deepEqual(V.defaultsFromHost("alice.github.io"), { owner: "alice", repo: "expenses-vault" });
  assert.deepEqual(V.defaultsFromHost("Alice-Dev.GitHub.io"), { owner: "alice-dev", repo: "expenses-vault" });
});

test("defaultsFromHost leaves owner empty for localhost, IPs and custom domains", () => {
  for (const h of ["localhost", "127.0.0.1", "money.example.com", "", undefined])
    assert.deepEqual(V.defaultsFromHost(h), { owner: "", repo: "expenses-vault" });
});

test("contentsUrl builds the GitHub contents API URL", () => {
  assert.equal(V.contentsUrl({ owner: "a", repo: "b" }, "x.json"), "https://api.github.com/repos/a/b/contents/x.json");
  assert.equal(V.contentsUrl({ owner: "a", repo: "b" }, "captures/1.json"), "https://api.github.com/repos/a/b/contents/captures/1.json");
});

test("isConfigured needs both owner and repo", () => {
  assert.equal(V.isConfigured({ owner: "", repo: "expenses-vault" }), false);
  assert.equal(V.isConfigured({ owner: "a", repo: "" }), false);
  assert.equal(V.isConfigured({ owner: "a", repo: "b" }), true);
  assert.equal(V.isConfigured(null), false);
});

test("seedFiles lists README.md and CLAUDE.md with non-empty text", () => {
  const files = V.seedFiles();
  assert.deepEqual(files.map((f) => f.path), ["README.md", "CLAUDE.md"]);
  for (const f of files) assert.ok(f.text.length > 20, f.path + " has text");
});

test("seedFiles match the authoritative copies in vault-seed/", () => {
  const fs = require("node:fs"), path = require("node:path");
  for (const f of V.seedFiles()) {
    const disk = fs.readFileSync(path.join(__dirname, "..", "vault-seed", f.path), "utf8").replace(/\r\n/g, "\n");
    assert.equal(f.text, disk, f.path + " drifted from vault-seed/");
  }
});

test("the template author's own vault is never used", () => {
  assert.deepEqual(V.defaultsFromHost("kcjj0203.github.io"), { owner: "", repo: "expenses-vault" });
  assert.equal(V.isBlocked({ owner: "KCJJ0203", repo: "expenses-vault" }), true);
  assert.equal(V.isBlocked({ owner: " kcjj0203 ", repo: "x" }), true);
  assert.equal(V.isBlocked({ owner: "alice", repo: "expenses-vault" }), false);
  assert.equal(V.isConfigured({ owner: "KCJJ0203", repo: "expenses-vault" }), false);
  assert.throws(() => V.contentsUrl({ owner: "KCJJ0203", repo: "expenses-vault" }, "expenses-data.json"), /not allowed/);
});
