import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { useAuthMock, useConvexMock, updateProfileMock } = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
  useConvexMock: vi.fn(),
  updateProfileMock: vi.fn(() => Promise.resolve(undefined)),
}));

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock("convex/react", () => ({
  useConvex: () => useConvexMock(),
  useMutation: () => updateProfileMock,
}));

import AuthPage from "./Auth";

function renderAuth(initialEntry = "/auth") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <AuthPage redirectAfterAuth="/dashboard" />
    </MemoryRouter>,
  );
}

const baseAuth = {
  isLoading: false,
  isAuthenticated: false,
  user: null,
  signIn: vi.fn(() => Promise.resolve(undefined)),
  signOut: vi.fn(),
};

describe("Auth page", () => {
  beforeEach(() => {
    useAuthMock.mockReturnValue(baseAuth);
    useConvexMock.mockReturnValue({ query: vi.fn(() => Promise.resolve(false)) });
    baseAuth.signIn.mockClear();
  });

  it("sign-in mode welcomes the user back", () => {
    renderAuth();
    expect(screen.getByText("Welcome back")).toBeInTheDocument();
    expect(
      screen.getByText("Sign in to continue to VCollab — we'll send a sign-in code"),
    ).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Full name")).not.toBeInTheDocument();
  });

  it("register mode collects a full name and email", () => {
    renderAuth("/auth?mode=register");
    expect(screen.getByText("Create your account")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Full name")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("name@example.com")).toBeInTheDocument();
  });

  it("submits the email to the real OTP sign-in and shows the code step", async () => {
    const user = userEvent.setup();
    renderAuth();

    await user.type(
      screen.getByPlaceholderText("name@example.com"),
      "me@example.com",
    );
    await user.click(screen.getByRole("button", { name: /^continue$/i }));

    await waitFor(() => {
      expect(baseAuth.signIn).toHaveBeenCalledWith("email-otp", expect.any(FormData));
    });
    expect(screen.getByText("Check your email")).toBeInTheDocument();
  });

  it("blocks registration with a duplicate-account message and Sign-in-instead CTA", async () => {
    const user = userEvent.setup();
    useConvexMock.mockReturnValue({
      query: vi.fn(() => Promise.resolve(true)),
    });
    renderAuth("/auth?mode=register");

    await user.type(screen.getByPlaceholderText("Full name"), "Alice Example");
    await user.type(
      screen.getByPlaceholderText("name@example.com"),
      "alice@example.com",
    );

    // The debounced backend check flips the UI once it resolves.
    await waitFor(() => {
      expect(
        screen.getByText(/An account with this email already exists/i),
      ).toBeInTheDocument();
    });

    const signInInstead = screen.getByRole("button", { name: /sign in instead/i });
    expect(signInInstead).toBeInTheDocument();

    // Submission is blocked while the duplicate warning is shown.
    expect(screen.getByRole("button", { name: /^continue$/i })).toBeDisabled();
    await user.click(signInInstead);
    expect(screen.getByText("Welcome back")).toBeInTheDocument();
  });

  it("starts the GitHub OAuth flow with the intended redirect destination", async () => {
    const user = userEvent.setup();
    renderAuth();

    const githubButton = screen.getByRole("button", { name: /continue with github/i });
    expect(githubButton).toBeInTheDocument();
    await user.click(githubButton);

    expect(baseAuth.signIn).toHaveBeenCalledWith("github", {
      redirectTo: "/dashboard",
    });
  });

  it("persists the entered name via the real profile mutation after the code is verified", async () => {
    const user = userEvent.setup();
    const { container } = renderAuth("/auth?mode=register");

    await user.type(screen.getByPlaceholderText("Full name"), "Alice Example");
    await user.type(
      screen.getByPlaceholderText("name@example.com"),
      "alice@example.com",
    );
    await user.click(screen.getByRole("button", { name: /^continue$/i }));

    // OTP step carries the name through the form as a hidden field.
    await waitFor(() => {
      expect(screen.getByText("Check your email")).toBeInTheDocument();
    });
    expect(container.querySelector('input[name="name"]')).toHaveValue(
      "Alice Example",
    );

    // Enter a full code and verify — the name is saved via updateProfile.
    await user.type(screen.getByRole("textbox"), "123456");
    await user.click(screen.getByRole("button", { name: /verify code/i }));

    await waitFor(() => {
      expect(updateProfileMock).toHaveBeenCalledWith({ name: "Alice Example" });
    });
  });
});
