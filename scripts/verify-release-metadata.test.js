"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { collectMetadata } = require("./verify-release-metadata");

test("operational package and Homebrew versions agree", () => {
  const metadata = collectMetadata();
  assert.equal(metadata.errors.length, 0);
  assert.equal(metadata.packageVersion, metadata.caskVersion);
  assert.equal(metadata.packageVersion, metadata.lockVersion);
  assert.equal(metadata.caskSha256, metadata.artifactSha256);
  assert.match(metadata.artifactName, /^Codex-side-by-side-mac-x64-\d+\.\d+\.\d+\.dmg$/);
});
