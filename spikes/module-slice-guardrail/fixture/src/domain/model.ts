import { table } from "../infra/db";

export type Owner = { id: string; name: string };
export const owners = table("owners");
