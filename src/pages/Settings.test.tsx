import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { useMutationMock } = vi.hoisted(() => ({
  useMutationMock: vi.fn(() => vi.fn(() => Promise.resolve(undefined))),
}));

vi.mock("convex/react", () => ({
  useQuery: () => undefined,
  useMutation: useMutationMock,
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
});
