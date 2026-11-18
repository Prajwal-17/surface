/**
 * SQLite schema used only by the desktop/embedded database and by
 * drizzle-kit generation. The PostgreSQL schema remains in `schema.ts`;
 * historical PostgreSQL migrations are not shared with this baseline.
 */
export {
  sqliteDiscoveryRuns,
  sqliteDiscoverySourceRuns,
} from "../../modules/discovery/discovery.tables";
export { sqliteJobs, sqliteJobSources } from "../../modules/jobs/jobs.tables";
export {
  sqliteJobPreferences,
  sqliteProfileRevisions,
} from "../../modules/profile/profile.tables";
export {
  sqliteCompanies,
  sqliteConfiguredSources,
} from "../../modules/workspace/workspace.tables";
export {
  sqliteDuplicateDecisions,
  sqliteJobVersions,
  sqliteObservations,
  sqliteResources,
  sqliteSnapshots,
} from "../../modules/collection/collection.tables";
export {
  sqliteCoordinationLocks,
  sqliteExecutorLease,
  sqliteRunItems,
  sqliteRuns,
  sqliteSavedSearches,
  sqliteWorkItems,
} from "../../modules/work/work.tables";
export {
  sqliteAnalysisSettings,
  sqliteAssessments,
} from "../../modules/analysis/analysis.tables";
export {
  sqliteCompanyLinkReviews,
  sqliteResearchEvents,
  sqliteResearchMessages,
  sqliteResearchReports,
  sqliteResearchRuns,
  sqliteResearchSources,
} from "../../modules/research/research.tables";
export {
  sqliteCompanyActions,
  sqliteCompanyContacts,
  sqliteCompanyDiscoverySearches,
  sqliteCompanySearchMatches,
  sqliteCompanySignals,
} from "../../modules/company-discovery/tables";

export { sqliteApplications } from "../../modules/applications/applications.tables";
