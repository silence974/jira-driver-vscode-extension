import { strict as assert } from "node:assert";

import { buildBasicAuthorizationHeader } from "../auth/basic";

describe("buildBasicAuthorizationHeader", () => {
  it("builds a valid basic auth header from email and api token", () => {
    const header = buildBasicAuthorizationHeader("dev@example.com", "token-123");
    assert.equal(
      header,
      `Basic ${Buffer.from("dev@example.com:token-123", "utf8").toString("base64")}`,
    );
  });
});
