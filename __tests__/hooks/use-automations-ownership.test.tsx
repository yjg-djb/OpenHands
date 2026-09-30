import { describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useAutomationsOwnership } from "#/hooks/use-automations-ownership";
import { useActiveBackend } from "#/contexts/active-backend-context";
import { getCloudOrganizationMe } from "#/api/cloud/organization-service.api";
import type { Backend } from "#/api/backend-registry/types";
import type { Automation } from "#/types/automation";

vi.mock("#/contexts/active-backend-context", () => ({
  useActiveBackend: vi.fn(),
}));

vi.mock("#/api/cloud/organization-service.api", () => ({
  getCloudOrganizationMe: vi.fn(),
}));

const localBackend: Backend = {
  id: "local-1",
  name: "Local",
  host: "http://localhost:8000",
  apiKey: "session-key",
  kind: "local",
};

const cloudBackend: Backend = {
  id: "cloud-1",
  name: "Cloud",
  host: "https://app.all-hands.dev",
  apiKey: "org-key",
  kind: "cloud",
};

const mine: Automation = {
  id: "mine",
  name: "Mine",
  trigger: { type: "cron", schedule: "0 9 * * *" },
  enabled: true,
  prompt: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  user_id: "user-a",
};

function setActive(kind: "local" | "cloud") {
  const backend = kind === "cloud" ? cloudBackend : localBackend;
  vi.mocked(useActiveBackend).mockReturnValue({
    backend,
    orgId: kind === "cloud" ? "org-1" : null,
  });
  return backend;
}

function renderOwnershipHook() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return renderHook(() => useAutomationsOwnership(), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
}

describe("useAutomationsOwnership", () => {
  it("claims every automation on a local backend", () => {
    // Arrange — the local user owns everything there is.
    setActive("local");

    // Act
    const { result } = renderOwnershipHook();

    // Assert
    expect(result.current?.(mine)).toBe(true);
    expect(result.current?.({ ...mine, user_id: "someone-else" })).toBe(true);
  });

  it("claims only the member's own automations on a cloud backend", async () => {
    // Arrange
    setActive("cloud");
    vi.mocked(getCloudOrganizationMe).mockResolvedValue({
      userId: "user-a",
    } as Awaited<ReturnType<typeof getCloudOrganizationMe>>);

    // Act
    const { result } = renderOwnershipHook();

    // Assert
    await waitFor(() => {
      expect(result.current?.(mine)).toBe(true);
    });
    expect(result.current?.({ ...mine, user_id: "user-b" })).toBe(false);
    expect(result.current?.({ ...mine, user_id: undefined })).toBe(false);
  });

  it("holds no claim while the member id is still resolving", async () => {
    // Arrange — the /me request never settles.
    setActive("cloud");
    vi.mocked(getCloudOrganizationMe).mockReturnValue(new Promise(() => {}));

    // Act
    const { result } = renderOwnershipHook();

    // Assert — no ownership claim yet, so "me" matches nothing.
    await waitFor(() => {
      expect(vi.mocked(getCloudOrganizationMe)).toHaveBeenCalled();
    });
    expect(result.current).toBeNull();
  });
});
