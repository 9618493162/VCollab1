import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { useMutationMock, useActionMock } = vi.hoisted(() => ({
  useMutationMock: vi.fn(() => vi.fn(() => Promise.resolve(undefined))),
  // The mock implementation receives the api reference passed to `useAction`
  // (see the GitHub test), so it must accept an argument.
  useActionMock: vi.fn((_arg: unknown) => vi.fn()),
}));

vi.mock("convex/react", () => ({
  useQuery: () => undefined,
  useMutation: useMutationMock,
  useAction: useActionMock,
}));

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    user: {
      name: "Alice",
      email: "alice@example.com",
      image: null,
      isAnonymous: false,
    },
  }),
}));

vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "dark", setTheme: vi.fn() }),
}));

import SettingsPage from "./Settings";
import { getFunctionName } from "convex/server";

describe("Settings page", () => {
  beforeEach(() => {
    useMutationMock.mockReturnValue(vi.fn(() => Promise.resolve(undefined)));
  });

  it("renders every preference section", () => {
    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { name: "Settings" })).toBeInTheDocument();
    expect(screen.getByText("Profile")).toBeInTheDocument();
    expect(screen.getByText("Appearance")).toBeInTheDocument();
    expect(screen.getByText("Notifications")).toBeInTheDocument();
    expect(screen.getByText("Meeting")).toBeInTheDocument();
    expect(screen.getByText("Language & region")).toBeInTheDocument();
  });

  it("saves a preference when a toggle is flipped", async () => {
    const user = userEvent.setup();
    const updateSettings = vi.fn(() => Promise.resolve(undefined));
    useMutationMock.mockReturnValue(updateSettings);

    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>,
    );

    await user.click(
      screen.getByRole("switch", { name: "Meeting reminders" }),
    );

    expect(updateSettings).toHaveBeenCalledWith({ notifyReminders: false });
  });

  it("shows the connected GitHub account and creates an issue", async () => {
    const user = userEvent.setup();
    const getProfile = vi.fn(() =>
      Promise.resolve({
        login: "octocat",
        name: "Octo Cat",
        avatarUrl: null,
        htmlUrl: "https://github.com/octocat",
        bio: null,
        publicRepos: 12,
      }),
    );
    const listRepos = vi.fn(() =>
      Promise.resolve([
        { fullName: "octocat/hello-world", isPrivate: false, description: null },
      ]),
    );
    const createIssue = vi.fn(() =>
      Promise.resolve({ number: 42, htmlUrl: "https://github.com/octocat/hello-world/issues/42" }),
    );
    // `useAction` is called on every render, so queue-based mockReturnValueOnce
    // values get consumed by re-renders and later hooks end up with the wrong
    // (fallback) function. The real hook memoizes by `getFunctionName(reference)`
    // — key the mock the same way for stable per-hook identities.
    useActionMock.mockImplementation((fn: unknown) => {
      const name = getFunctionName(fn as never);
      if (name === "github:getProfile") return getProfile;
      if (name === "github:listRepos") return listRepos;
      if (name === "github:createIssue") return createIssue;
      return vi.fn(() => Promise.resolve(undefined));
    });

    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("@octocat · 12 public repos")).toBeInTheDocument();

    const githubSection =
      screen.getByRole("heading", { name: "GitHub" }).closest("section")!;
    await user.click(within(githubSection).getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "octocat/hello-world" }));
    await user.type(within(githubSection).getByLabelText("Title"), "Follow up on the meeting");
    await user.click(
      within(githubSection).getByRole("button", { name: "Create issue" }),
    );

    await waitFor(() => {
      expect(createIssue).toHaveBeenCalledWith({
        repo: "octocat/hello-world",
        title: "Follow up on the meeting",
        body: undefined,
      });
    });
  });

  it("shows the unconfigured state when GitHub isn't connected", async () => {
    useActionMock.mockReturnValue(
      vi.fn(() =>
        Promise.reject(
          new Error("GitHub isn't connected — add GITHUB_TOKEN in the project Keys tab."),
        ),
      ),
    );

    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>,
    );

    expect(
      await screen.findByText(/GitHub isn't connected yet/i),
    ).toBeInTheDocument();
  });
});
