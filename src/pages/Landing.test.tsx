import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";

const { useAuthMock } = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
}));

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => useAuthMock(),
}));

import Landing from "./Landing";

describe("Landing (first page for logged-out users)", () => {
  it("renders the hero and both auth CTAs for signed-out users", () => {
    useAuthMock.mockReturnValue({
      isLoading: false,
      isAuthenticated: false,
    });
    render(
      <MemoryRouter>
        <Landing />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Connect.",
    );

    // Get started must lead to the real registration route.
    const getStarted = screen.getAllByRole("link", { name: /get started/i });
    expect(getStarted.length).toBeGreaterThan(0);
    expect(
      getStarted.some((link) => link.getAttribute("href") === "/auth?mode=register"),
    ).toBe(true);

    // Sign in must lead to the real sign-in route.
    const signIn = screen.getAllByRole("link", { name: /sign in/i });
    expect(signIn.length).toBeGreaterThan(0);
    expect(
      signIn.some((link) => link.getAttribute("href") === "/auth?mode=signin"),
    ).toBe(true);
  });

  it("redirects authenticated users straight to the dashboard", () => {
    useAuthMock.mockReturnValue({
      isLoading: false,
      isAuthenticated: true,
    });
    render(
      <MemoryRouter>
        <Landing />
      </MemoryRouter>,
    );

    // The landing content must not render — the user is sent to /dashboard.
    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /get started/i })).not.toBeInTheDocument();
  });
});
