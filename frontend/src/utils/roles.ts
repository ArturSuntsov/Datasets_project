import { Role } from "../types";

export function isCustomerRole(role?: Role | null): boolean {
  return role === "customer" || role === "admin";
}

export function isAnnotatorRole(role?: Role | null): boolean {
  return role === "annotator";
}
