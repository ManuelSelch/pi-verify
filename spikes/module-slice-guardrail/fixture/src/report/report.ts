import type { Owner } from "../domain/model";

export function report(owner: Owner): string {
  return owner.name;
}
