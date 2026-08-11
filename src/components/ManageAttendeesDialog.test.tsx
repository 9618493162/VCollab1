import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { useMutationMock, mutationRegistry } = vi.hoisted(() => {
  const mutationRegistry: Record<string, (...args: unknown[]) => unknown> = {};
  return {
    mutationRegistry,
    // Convex function references are symbol-branded objects created fresh on
    // each `api.x.y` access, so the mock routes by their symbol name instead
    // of identity. The registry is re-wired per test.
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
  useQuery: () => undefined,
  useMutation: useMutationMock,
}));

import { ManageAttendeesDialog } from "./ManageAttendeesDialog";

const meeting = {
  code: "abc-defg-hij",
  title: "Sprint planning",
  attendees: ["alice@example.com"],
};

function wireMutations(
  addAttendees: (...args: unknown[]) => unknown,
  resendInvites: (...args: unknown[]) => unknown,
) {
  mutationRegistry["meetings:addAttendees"] = addAttendees;
  mutationRegistry["meetings:resendInvites"] = resendInvites;
}

function renderDialog({
  open = true,
  m = meeting,
  onOpenChange = vi.fn(),
}: {
  open?: boolean;
  m?: typeof meeting | null;
  onOpenChange?: (open: boolean) => void;
} = {}) {
  return render(
    <ManageAttendeesDialog open={open} meeting={m} onOpenChange={onOpenChange} />,
  );
}

describe("ManageAttendeesDialog", () => {
  beforeEach(() => {
    for (const key of Object.keys(mutationRegistry)) {
      delete mutationRegistry[key];
    }
    useMutationMock.mockClear();
  });

  it("shows the meeting title, current attendees, and a disabled add button", () => {
    renderDialog();
    expect(screen.getByText("Manage attendees")).toBeInTheDocument();
    expect(screen.getByText("Sprint planning")).toBeInTheDocument();
    expect(screen.getByText("alice@example.com")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Add & invite/i }),
    ).toBeDisabled();
  });

  it("adds a typed email through addAttendees and closes on success", async () => {
    const user = userEvent.setup();
    const addAttendees = vi.fn(() => Promise.resolve(1));
    const resendInvites = vi.fn(() => Promise.resolve(1));
    wireMutations(addAttendees, resendInvites);
    const onOpenChange = vi.fn();

    renderDialog({ onOpenChange });

    await user.type(
      screen.getByPlaceholderText("Search people or type an email…"),
      "bob@example.com{Enter}",
    );

    // The picked person becomes a chip and enables the submit button.
    expect(screen.getByText("bob@example.com")).toBeInTheDocument();
    const addButton = screen.getByRole("button", { name: /Add & invite/i });
    expect(addButton).toBeEnabled();

    await user.click(addButton);

    expect(addAttendees).toHaveBeenCalledWith({
      code: "abc-defg-hij",
      emails: ["bob@example.com"],
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("re-sends invites through resendInvites", async () => {
    const user = userEvent.setup();
    const addAttendees = vi.fn(() => Promise.resolve(1));
    const resendInvites = vi.fn(() => Promise.resolve(2));
    wireMutations(addAttendees, resendInvites);
    const onOpenChange = vi.fn();

    renderDialog({ onOpenChange });
    await user.click(screen.getByRole("button", { name: /Re-send invites/i }));

    expect(resendInvites).toHaveBeenCalledWith({ code: "abc-defg-hij" });
    expect(addAttendees).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("clears picks from a previous session when switching meetings", async () => {
    const user = userEvent.setup();
    const { rerender } = renderDialog();

    await user.type(
      screen.getByPlaceholderText("Search people or type an email…"),
      "bob@example.com{Enter}",
    );
    expect(screen.getByText("bob@example.com")).toBeInTheDocument();

    // The dialog stays mounted; switching to another meeting must reset it.
    rerender(
      <ManageAttendeesDialog
        open
        meeting={{ code: "xyz-1234-abc", title: "Design review", attendees: [] }}
        onOpenChange={vi.fn()}
      />,
    );

    expect(screen.queryByText("bob@example.com")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Add & invite/i }),
    ).toBeDisabled();
  });
});
