import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getCloudOrganizationMe } from "#/api/cloud/organization-service.api";
import { useActiveBackend } from "#/contexts/active-backend-context";
import type { AutomationOwnership } from "#/manifests/automation-insights";

/**
 * The "created by" filter's ownership claim: the local user owns every
 * automation, a cloud member owns the ones their `user_id` created. The
 * query shares its key with `useAutomationPermissions`, so it adds no
 * request; while the member id is still resolving there is no claim — the
 * filter's "me" side then matches nothing, like the creator escape hatch.
 */
export function useAutomationsOwnership(): AutomationOwnership {
  const { backend, orgId } = useActiveBackend();
  const isCloud = backend.kind === "cloud";

  // The query shares the key shape of useAutomationPermissions, whose
  // request likewise takes the whole backend object.
  // eslint-disable-next-line @tanstack/query/exhaustive-deps
  const { data, isLoading } = useQuery({
    queryKey: [
      "cloud-current-user",
      backend.id,
      orgId,
      backend.connectionRevision ?? 0,
    ],
    queryFn: () => getCloudOrganizationMe(orgId!, backend),
    enabled: isCloud && !!orgId,
    staleTime: 1000 * 60 * 5,
    retry: false,
    meta: { disableToast: true },
  });

  return useMemo<AutomationOwnership>(() => {
    if (!isCloud) return () => true;
    const userId = data?.userId;
    if (isLoading || !userId) return null;
    return (automation) => automation.user_id === userId;
  }, [isCloud, data?.userId, isLoading]);
}
