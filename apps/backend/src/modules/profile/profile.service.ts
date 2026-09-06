import type { JobPreferencesInput } from "../../shared/contracts";
import {
  findJobPreferences,
  upsertJobPreferences,
} from "./profile.repository";

export function getJobPreferences() {
  return findJobPreferences();
}

export function updateJobPreferences(input: JobPreferencesInput) {
  return upsertJobPreferences(input);
}
