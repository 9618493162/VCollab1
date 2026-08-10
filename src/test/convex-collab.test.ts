import { describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api";
import { insertUser, makeTestClient } from "./convex-test-client";

const CODE = "abc-defg-hij";

describe("collaboration notes", () => {
  it("requires auth to save, but notes are readable by anyone", async () => {
    const t = makeTestClient();
    expect(await t.query(api.collab.getNotes, { code: CODE })).toBeNull();

    await expect(
      t.mutation(api.collab.saveNotes, { code: CODE, title: "x", content: "y" }),
    ).rejects.toThrow("Sign in to save notes");

    const userId = await insertUser(t, "dev@example.com", "Dev");
    const authed = t.withIdentity({ subject: userId });
    await authed.mutation(api.collab.saveNotes, {
      code: "  ABC-DEFG-HIJ ",
      title: "  Ideas  ",
      content: "Ship it",
    });

    const notes = await t.query(api.collab.getNotes, { code: CODE });
    expect(notes?.title).toBe("Ideas");
    expect(notes?.content).toBe("Ship it");
    expect(notes?.updatedBy).toBe(userId);
  });
});

describe("kanban board", () => {
  it("adds, validates, and moves cards", async () => {
    const t = makeTestClient();
    const userId = await insertUser(t, "dev@example.com", "Dev");
    const authed = t.withIdentity({ subject: userId });

    await expect(
      authed.mutation(api.collab.addCard, {
        code: CODE,
        column: "bogus",
        title: "x",
      }),
    ).rejects.toThrow("Invalid column.");

    await authed.mutation(api.collab.addCard, {
      code: CODE,
      column: "todo",
      title: "  Fix flaky test  ",
      labels: ["bug", "  bug  "],
    });

    let cards = await t.query(api.collab.getCards, { code: CODE });
    expect(cards).toHaveLength(1);
    expect(cards[0].title).toBe("Fix flaky test");
    expect(cards[0].column).toBe("todo");
    // labels are trimmed but not deduped
    expect(cards[0].labels).toEqual(["bug", "bug"]);

    await authed.mutation(api.collab.moveCard, { cardId: cards[0]._id, column: "done" });
    cards = await t.query(api.collab.getCards, { code: CODE });
    expect(cards[0].column).toBe("done");
  });
});
