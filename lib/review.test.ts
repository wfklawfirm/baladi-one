import { describe, it, expect } from "vitest";
import { actionsFor } from "./review";
describe("review actions", () => {
  it("only admin can submit a draft", () => { expect(actionsFor("draft", ["admin"]).map((a) => a.to)).toEqual(["in_review"]); expect(actionsFor("draft", ["mayor"])).toEqual([]); });
  it("mayor can approve or reject", () => { expect(actionsFor("in_review", ["mayor"]).map((a) => a.to)).toEqual(["approved", "draft"]); });
  it("staff and archived get nothing", () => { expect(actionsFor("in_review", ["staff"])).toEqual([]); expect(actionsFor("archived", ["admin"])).toEqual([]); });
});
