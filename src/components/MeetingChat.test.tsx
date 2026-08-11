import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { useQueryMock, mutationRegistry, useMutationMock } = vi.hoisted(() => {
  const mutationRegistry: Record<string, (...args: unknown[]) => unknown> = {};
  return {
    mutationRegistry,
    useQueryMock: vi.fn(),
    // Convex function references are symbol-branded objects created fresh on
    // each `api.x.y` access, so the mock routes by their symbol name instead
    // of identity (same convention as ManageAttendeesDialog.test.tsx).
    useMutationMock: vi.fn<(fn: unknown) => (...args: unknown[]) => unknown>(
      (fn) => {
        const fnName =
          (fn as Record<symbol, string | undefined>)[
            Symbol.for("functionName")
          ] ?? "";
        return mutationRegistry[fnName] ?? (() => Promise.resolve(undefined));
      },
    ),
  };
});

vi.mock("convex/react", () => ({
  useQuery: useQueryMock,
  useMutation: useMutationMock,
}));

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    user: { _id: "user-1", name: "You" },
    isAuthenticated: true,
    isLoading: false,
    signIn: vi.fn(),
    signOut: vi.fn(),
  }),
}));

import { MeetingChat } from "./MeetingChat";

const messages = [
  {
    _id: "m1",
    code: "abc-defg-hij",
    from: "client-1",
    name: "Alice",
    text: "Hey everyone!",
    createdAt: 1_000,
  },
  {
    _id: "m2",
    code: "abc-defg-hij",
    from: "user-1",
    name: "You",
    text: "Hi Alice, adding you to the board",
    createdAt: 2_000,
  },
];

function renderChat(props: { readOnly?: boolean } = {}) {
  return render(
    <MemoryRouter>
      <MeetingChat code="abc-defg-hij" {...props} />
    </MemoryRouter>,
  );
}

describe("MeetingChat", () => {
  beforeEach(() => {
    for (const key of Object.keys(mutationRegistry)) {
      delete mutationRegistry[key];
    }
    useMutationMock.mockClear();
    useQueryMock.mockReset();
  });

  it("renders every message with the sender's name and marks your own", () => {
    useQueryMock.mockReturnValue(messages);
    renderChat();

    expect(screen.getByText("Hey everyone!")).toBeInTheDocument();
    expect(screen.getByText("Hi Alice, adding you to the board")).toBeInTheDocument();
    expect(screen.getByText("Alice")).toBeInTheDocument();
    // The message from user-1 is labelled "You".
    expect(screen.getByText("You")).toBeInTheDocument();
  });

  it("shows an empty state when there are no messages", () => {
    useQueryMock.mockReturnValue([]);
    renderChat();
    expect(
      screen.getByText("No messages yet. Start the conversation."),
    ).toBeInTheDocument();
  });

  it("sends a message through call.sendMessage with the signed-in identity", async () => {
    const user = userEvent.setup();
    useQueryMock.mockReturnValue([]);
    const sendMessage = vi.fn(() => Promise.resolve(undefined));
    mutationRegistry["call:sendMessage"] = sendMessage;

    renderChat();

    await user.type(
      screen.getByPlaceholderText("Message the meeting…"),
      "Let's wrap up by Friday",
    );
    await user.click(screen.getByRole("button", { name: /Send message/i }));

    expect(sendMessage).toHaveBeenCalledWith({
      code: "abc-defg-hij",
      from: "user-1",
      name: "You",
      text: "Let's wrap up by Friday",
    });
  });

  it("does not send empty messages", async () => {
    const user = userEvent.setup();
    useQueryMock.mockReturnValue([]);
    const sendMessage = vi.fn(() => Promise.resolve(undefined));
    mutationRegistry["call:sendMessage"] = sendMessage;

    renderChat();

    const sendButton = screen.getByRole("button", { name: /Send message/i });
    expect(sendButton).toBeDisabled();

    await user.type(
      screen.getByPlaceholderText("Message the meeting…"),
      "   ",
    );
    expect(sendButton).toBeDisabled();
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("readOnly hides the composer and links to the meeting page", () => {
    useQueryMock.mockReturnValue(messages);
    renderChat({ readOnly: true });

    expect(
      screen.queryByPlaceholderText("Message the meeting…"),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Send message/i })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /meeting page/i })).toHaveAttribute(
      "href",
      "/collab/abc-defg-hij",
    );
  });
});
