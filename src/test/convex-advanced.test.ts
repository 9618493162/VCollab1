import { describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api";
import { insertUser, makeTestClient, type TestClient } from "./convex-test-client";

async function hostRoom(t: TestClient) {
  const hostId = await insertUser(t, "host@example.com", "Host");
  const host = t.withIdentity({ subject: hostId });
  const code = await host.mutation(api.rooms.createRoom);
  return { hostId, host, code };
}

describe("polls (Phase 30)", () => {
  it("requires the host to create and launch polls", async () => {
    const t = makeTestClient();
    const otherId = await insertUser(t, "other@example.com", "Other");
    const other = t.withIdentity({ subject: otherId });
    const { code } = await hostRoom(t);

    await expect(
      other.mutation(api.polls.createPoll, {
        code,
        title: "Which stack?",
        type: "single",
        options: ["A", "B"],
      }),
    ).rejects.toThrow("Only the host can manage polls.");
  });

  it("creates a draft poll and lets participants vote once per choice", async () => {
    const t = makeTestClient();
    const { host, code } = await hostRoom(t);

    await host.mutation(api.polls.createPoll, {
      code,
      title: "  Which stack?  ",
      type: "single",
      options: ["React", "Vue", ""],
    });

    const draft = await t.query(api.polls.listPolls, { code, viewer: "c1" });
    expect(draft).toHaveLength(1);
    expect(draft[0].title).toBe("Which stack?");
    expect(draft[0].options).toEqual(["React", "Vue"]);
    expect(draft[0].launched).toBe(false);
    expect(draft[0].totals).toEqual([0, 0]);

    // can't vote on a draft
    await expect(
      t.mutation(api.polls.setPollVote, {
        code,
        pollId: draft[0]._id,
        voter: "c1",
        choice: 0,
        vote: true,
      }),
    ).rejects.toThrow("hasn't started");

    await host.mutation(api.polls.launchPoll, { code, pollId: draft[0]._id });

    await t.mutation(api.polls.setPollVote, {
      code,
      pollId: draft[0]._id,
      voter: "c1",
      choice: 0,
      vote: true,
    });
    // single-choice: voting again replaces the old vote
    await t.mutation(api.polls.setPollVote, {
      code,
      pollId: draft[0]._id,
      voter: "c1",
      choice: 1,
      vote: true,
    });
    await t.mutation(api.polls.setPollVote, {
      code,
      pollId: draft[0]._id,
      voter: "c2",
      choice: 0,
      vote: true,
    });

    const live = await t.query(api.polls.listPolls, { code, viewer: "c1" });
    expect(live[0].totals).toEqual([1, 1]);
    expect(live[0].myChoices).toEqual([1]);
    expect(live[0].voterCount).toBe(2);

    // close it: no more votes, results stay visible
    await host.mutation(api.polls.closePoll, { code, pollId: draft[0]._id });
    await expect(
      t.mutation(api.polls.setPollVote, {
        code,
        pollId: draft[0]._id,
        voter: "c3",
        choice: 0,
        vote: true,
      }),
    ).rejects.toThrow("closed");
  });

  it("multiple-choice polls let one voter pick several options", async () => {
    const t = makeTestClient();
    const { host, code } = await hostRoom(t);
    await host.mutation(api.polls.createPoll, {
      code,
      title: "Pick topics",
      type: "multiple",
      options: ["A", "B", "C"],
    });
    const poll = (await t.query(api.polls.listPolls, { code }))[0];
    await host.mutation(api.polls.launchPoll, { code, pollId: poll._id });

    await t.mutation(api.polls.setPollVote, {
      code,
      pollId: poll._id,
      voter: "c1",
      choice: 0,
      vote: true,
    });
    await t.mutation(api.polls.setPollVote, {
      code,
      pollId: poll._id,
      voter: "c1",
      choice: 2,
      vote: true,
    });
    const live = await t.query(api.polls.listPolls, { code, viewer: "c1" });
    expect(live[0].totals).toEqual([1, 0, 1]);
    expect(live[0].myChoices).toEqual([0, 2]);

    // toggle one off again
    await t.mutation(api.polls.setPollVote, {
      code,
      pollId: poll._id,
      voter: "c1",
      choice: 0,
      vote: false,
    });
    expect((await t.query(api.polls.listPolls, { code, viewer: "c1" }))[0].totals).toEqual([
      0, 0, 1,
    ]);
  });

  it("host can delete a poll along with its votes", async () => {
    const t = makeTestClient();
    const { host, code } = await hostRoom(t);
    await host.mutation(api.polls.createPoll, {
      code,
      title: "Temp",
      type: "single",
      options: ["A", "B"],
    });
    const poll = (await t.query(api.polls.listPolls, { code }))[0];
    await host.mutation(api.polls.launchPoll, { code, pollId: poll._id });
    await t.mutation(api.polls.setPollVote, {
      code,
      pollId: poll._id,
      voter: "c1",
      choice: 0,
      vote: true,
    });
    await host.mutation(api.polls.deletePoll, { code, pollId: poll._id });
    expect(await t.query(api.polls.listPolls, { code })).toHaveLength(0);
  });
});

describe("Q&A (Phase 31)", () => {
  it("anyone can ask and upvote; upvotes toggle", async () => {
    const t = makeTestClient();
    const { code } = await hostRoom(t);

    await t.mutation(api.qa.askQuestion, {
      code,
      clientId: "c1",
      authorName: "Alice",
      text: "  What's the timeline?  ",
    });

    const list = await t.query(api.qa.listQuestions, { code });
    expect(list).toHaveLength(1);
    expect(list[0].text).toBe("What's the timeline?");
    expect(list[0].upvotes).toBe(0);

    await t.mutation(api.qa.toggleUpvote, { code, questionId: list[0]._id, clientId: "c2" });
    await t.mutation(api.qa.toggleUpvote, { code, questionId: list[0]._id, clientId: "c2" });
    expect((await t.query(api.qa.listQuestions, { code }))[0].upvotes).toBe(0);

    await t.mutation(api.qa.toggleUpvote, { code, questionId: list[0]._id, clientId: "c2" });
    expect((await t.query(api.qa.listQuestions, { code }))[0].upvotes).toBe(1);
  });

  it("only the author or the host can remove a question", async () => {
    const t = makeTestClient();
    const { code } = await hostRoom(t);
    await t.mutation(api.qa.askQuestion, {
      code,
      clientId: "c1",
      authorName: "Alice",
      text: "Budget?",
    });
    const q = (await t.query(api.qa.listQuestions, { code }))[0];

    await expect(
      t.mutation(api.qa.removeQuestion, { code, questionId: q._id, clientId: "c9" }),
    ).rejects.toThrow("Only the author or the host");

    await t.mutation(api.qa.removeQuestion, { code, questionId: q._id, clientId: "c1" });
    expect(await t.query(api.qa.listQuestions, { code })).toHaveLength(0);
  });

  it("host answers, pins, and deletes questions", async () => {
    const t = makeTestClient();
    const { host, code } = await hostRoom(t);
    await t.mutation(api.qa.askQuestion, {
      code,
      clientId: "c1",
      authorName: "Alice",
      text: "Deploy date?",
    });
    await t.mutation(api.qa.askQuestion, {
      code,
      clientId: "c2",
      authorName: "Bob",
      text: "Design review?",
    });

    const q1 = (await t.query(api.qa.listQuestions, { code }))[1];

    await host.mutation(api.qa.answerQuestion, { code, questionId: q1._id, answer: "Friday" });
    let list = await t.query(api.qa.listQuestions, { code });
    expect(list[1].answered).toBe(true);
    expect(list[1].answer).toBe("Friday");

    await host.mutation(api.qa.togglePin, { code, questionId: q1._id });
    list = await t.query(api.qa.listQuestions, { code });
    expect(list[0].pinned).toBe(true); // pinned floats to the top

    await host.mutation(api.qa.deleteQuestion, { code, questionId: q1._id });
    expect(await t.query(api.qa.listQuestions, { code })).toHaveLength(1);
  });
});

describe("agenda (Phase 38)", () => {
  it("host adds ordered items; only the host can edit", async () => {
    const t = makeTestClient();
    const otherId = await insertUser(t, "other@example.com", "Other");
    const other = t.withIdentity({ subject: otherId });
    const { host, code } = await hostRoom(t);

    await expect(
      other.mutation(api.agenda.addAgendaItem, { code, title: "Hijack" }),
    ).rejects.toThrow("Only the host can edit the agenda.");

    await host.mutation(api.agenda.addAgendaItem, {
      code,
      title: "Intro",
      presenter: "Host",
      durationMinutes: 5,
    });
    await host.mutation(api.agenda.addAgendaItem, {
      code,
      title: "Roadmap",
      presenter: "Alice",
    });

    const list = await t.query(api.agenda.listAgenda, { code });
    expect(list.map((i) => i.title)).toEqual(["Intro", "Roadmap"]);
    expect(list[0].position).toBe(1);
    expect(list[0].durationMinutes).toBe(5);
    expect(list[1].status).toBe("pending");
  });

  it("activating one item demotes the previously active one", async () => {
    const t = makeTestClient();
    const { host, code } = await hostRoom(t);
    await host.mutation(api.agenda.addAgendaItem, { code, title: "One" });
    await host.mutation(api.agenda.addAgendaItem, { code, title: "Two" });
    const [a, b] = await t.query(api.agenda.listAgenda, { code });

    await host.mutation(api.agenda.setAgendaStatus, {
      code,
      itemId: a._id,
      status: "active",
    });
    await host.mutation(api.agenda.setAgendaStatus, {
      code,
      itemId: b._id,
      status: "active",
    });
    const list = await t.query(api.agenda.listAgenda, { code });
    expect(list.find((i) => i._id === a._id)?.status).toBe("pending");
    expect(list.find((i) => i._id === b._id)?.status).toBe("active");

    await host.mutation(api.agenda.setAgendaStatus, {
      code,
      itemId: b._id,
      status: "done",
    });
    expect((await t.query(api.agenda.listAgenda, { code }))[1].status).toBe("done");
  });
});
