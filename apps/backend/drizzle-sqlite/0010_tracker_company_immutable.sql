CREATE TRIGGER tracker_application_company_immutable
BEFORE UPDATE OF company_id ON tracker_applications
WHEN OLD.company_id <> NEW.company_id
BEGIN
  SELECT RAISE(ABORT, 'application company cannot be changed');
END;
