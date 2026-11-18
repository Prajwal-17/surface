CREATE TABLE tracker_companies (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL CHECK(length(trim(name)) > 0),
  website TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Listed' CHECK(status IN ('Listed','To research','Outreach','Archived')),
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX tracker_companies_status_idx ON tracker_companies(status);
CREATE INDEX tracker_companies_updated_idx ON tracker_companies(updated_at);
CREATE TABLE tracker_applications (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL CHECK(length(trim(title)) > 0),
  company_id TEXT NOT NULL REFERENCES tracker_companies(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'To apply' CHECK(status IN ('To apply','Applied','In conversation','Closed')),
  type TEXT CHECK(type IS NULL OR type IN ('Job','Intern')),
  source_url TEXT NOT NULL DEFAULT '',
  contacted_on TEXT,
  outcome TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX tracker_applications_company_idx ON tracker_applications(company_id);
CREATE INDEX tracker_applications_status_idx ON tracker_applications(status);
CREATE INDEX tracker_applications_updated_idx ON tracker_applications(updated_at);
