import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../standalone-labs/", import.meta.url);
async function solution(id) {
  const text = await readFile(new URL(`${id}/README.md`, root), "utf8");
  return text.split("## Solution")[1].split("## ")[0];
}

const contracts = {
  "11-jwt-validation": [/fixtures \| keys\[\]/, /\/fixed/, /jq .*results/, /\/matrix/, /\/remediation/],
  "14-object-authorization": [/vulnerable\/tickets/, /fixed\/tickets/, /-X PATCH/, /jq .*observations/, /\/report/],
  "15-role-enforcement": [/for role in/, /read -r name method route/, /unauthenticated/, /unlisted/, /jq .*matrix/, /\/report/],
  "16-session-replay": [/password-change/, /mode=vulnerable/, /mode=hardened/, /successor/, /jq .*observations/, /\/timeline/, /printf .*timeline.*\| jq \./, /\/remediation/],
  "17-authorization-capstone": [/tampered/, /mismatched-cookie/, /duplicate/, /printf .*correlated.*\| jq \./, /jq .*results/, /\/controls/],
};

test("authorization walkthroughs execute and derive every submitted observation", async () => {
  for (const [id, patterns] of Object.entries(contracts)) {
    const text = await solution(id);
    for (const pattern of patterns) assert.match(text, pattern, `${id}: missing ${pattern}`);
    assert.doesNotMatch(text, /(?:results|matrix|observations)='\{[^}]/u, `${id}: must not submit a hard-coded answer object`);
  }
});
