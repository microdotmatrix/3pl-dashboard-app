export type AdminActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Record<string, string>;
  inviteUrl?: string;
};

export const INITIAL_ADMIN_ACTION_STATE: AdminActionState = { status: "idle" };
