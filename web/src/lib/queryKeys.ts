// One file for every query key; invalidate by prefix after changes.
export const qk = {
  me: ["me"] as const,
  team: ["team"] as const,
  settings: ["settings"] as const,
  departments: ["departments"] as const,
  department: (id: string) => ["departments", id] as const,
  providers: ["service-providers"] as const,
  provider: (id: string) => ["service-providers", id] as const,
  models: (q: string) => ["models", q] as const,
  model: (id: string) => ["models", "one", id] as const,
  equipmentList: (params: string) => ["equipment", "list", params] as const,
  equipment: (id: string) => ["equipment", id] as const,
  history: (id: string) => ["equipment", id, "history"] as const,
  labels: (ids: string) => ["equipment", "labels", ids] as const,
  manuals: (q: string) => ["manuals", q] as const,
  pms: (filter: string) => ["pms", filter] as const,
  breakdowns: (params: string) => ["breakdowns", "list", params] as const,
  breakdown: (id: string) => ["breakdowns", id] as const,
  recipientOptions: (id: string) => ["breakdowns", id, "recipients"] as const,
  home: ["home"] as const,
  report: (qr: string) => ["report", qr] as const,
  myReports: ["my-reports"] as const,
  push: ["push"] as const,
};

/** Everything that may change after an equipment, breakdown, PMS or move change. */
export const registerKeys = [["equipment"], ["departments"], ["service-providers"], ["breakdowns"], ["pms"], ["home"], ["manuals"], ["models"]];
