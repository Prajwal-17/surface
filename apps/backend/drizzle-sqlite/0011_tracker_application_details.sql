ALTER TABLE tracker_applications ADD COLUMN description TEXT NOT NULL DEFAULT '';
ALTER TABLE tracker_applications ADD COLUMN location TEXT NOT NULL DEFAULT '';
ALTER TABLE tracker_applications ADD COLUMN employment_type TEXT NOT NULL DEFAULT '';
ALTER TABLE tracker_applications ADD COLUMN work_mode TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE tracker_applications ADD COLUMN compensation TEXT NOT NULL DEFAULT '';
ALTER TABLE tracker_applications ADD COLUMN applied_on TEXT;
ALTER TABLE tracker_applications ADD COLUMN follow_up_on TEXT;
ALTER TABLE tracker_applications ADD COLUMN contact_name TEXT NOT NULL DEFAULT '';
ALTER TABLE tracker_applications ADD COLUMN contact_email TEXT NOT NULL DEFAULT '';

-- Carry the richer details forward where a tracker row matches a saved
-- application. Existing tracker values always win over legacy values.
CREATE TEMP TABLE tracker_legacy_application_details AS
SELECT tracker_id, location, employment_type, work_mode, compensation,
       source_url, applied_on, contacted_on, follow_up_on, contact_name,
       contact_email, outcome, notes, description
FROM (
  SELECT
    tracker.id AS tracker_id,
    legacy.location AS location,
    legacy.employment_type AS employment_type,
    legacy.work_mode AS work_mode,
    legacy.compensation AS compensation,
    legacy.source_url AS source_url,
    legacy.applied_on AS applied_on,
    legacy.contacted_on AS contacted_on,
    legacy.follow_up_on AS follow_up_on,
    legacy.contact_name AS contact_name,
    legacy.contact_email AS contact_email,
    legacy.outcome AS outcome,
    legacy.notes AS notes,
    COALESCE(job.description, '') AS description,
    ROW_NUMBER() OVER (
      PARTITION BY tracker.id
      ORDER BY
        CASE WHEN legacy.source_url = tracker.source_url THEN 0 ELSE 1 END,
        legacy.updated_at DESC,
        legacy.id
    ) AS match_rank
  FROM tracker_applications AS tracker
  JOIN tracker_companies AS company ON company.id = tracker.company_id
  JOIN applications AS legacy
    ON lower(trim(legacy.title)) = lower(trim(tracker.title))
   AND lower(trim(legacy.company_name)) = lower(trim(company.name))
  LEFT JOIN jobs AS job ON job.id = legacy.job_id
)
WHERE match_rank = 1;

UPDATE tracker_applications
SET description = COALESCE(NULLIF(description, ''), (
      SELECT description FROM tracker_legacy_application_details
      WHERE tracker_id = tracker_applications.id
    ), ''),
    location = COALESCE(NULLIF(location, ''), (
      SELECT location FROM tracker_legacy_application_details
      WHERE tracker_id = tracker_applications.id
    ), ''),
    employment_type = COALESCE(NULLIF(employment_type, ''), (
      SELECT employment_type FROM tracker_legacy_application_details
      WHERE tracker_id = tracker_applications.id
    ), ''),
    work_mode = CASE WHEN work_mode = 'unknown' THEN COALESCE((
      SELECT work_mode FROM tracker_legacy_application_details
      WHERE tracker_id = tracker_applications.id
    ), 'unknown') ELSE work_mode END,
    compensation = COALESCE(NULLIF(compensation, ''), (
      SELECT compensation FROM tracker_legacy_application_details
      WHERE tracker_id = tracker_applications.id
    ), ''),
    source_url = COALESCE(NULLIF(source_url, ''), (
      SELECT source_url FROM tracker_legacy_application_details
      WHERE tracker_id = tracker_applications.id
    ), ''),
    applied_on = COALESCE(applied_on, (
      SELECT applied_on FROM tracker_legacy_application_details
      WHERE tracker_id = tracker_applications.id
    )),
    contacted_on = COALESCE(contacted_on, (
      SELECT contacted_on FROM tracker_legacy_application_details
      WHERE tracker_id = tracker_applications.id
    )),
    follow_up_on = COALESCE(follow_up_on, (
      SELECT follow_up_on FROM tracker_legacy_application_details
      WHERE tracker_id = tracker_applications.id
    )),
    contact_name = COALESCE(NULLIF(contact_name, ''), (
      SELECT contact_name FROM tracker_legacy_application_details
      WHERE tracker_id = tracker_applications.id
    ), ''),
    contact_email = COALESCE(NULLIF(contact_email, ''), (
      SELECT contact_email FROM tracker_legacy_application_details
      WHERE tracker_id = tracker_applications.id
    ), ''),
    outcome = COALESCE(NULLIF(outcome, ''), (
      SELECT outcome FROM tracker_legacy_application_details
      WHERE tracker_id = tracker_applications.id
    ), ''),
    notes = COALESCE(NULLIF(notes, ''), (
      SELECT notes FROM tracker_legacy_application_details
      WHERE tracker_id = tracker_applications.id
    ), '');

DROP TABLE tracker_legacy_application_details;
