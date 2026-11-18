BEGIN;

LOCK TABLE "User" IN ACCESS EXCLUSIVE MODE;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "User") THEN
    RAISE EXCEPTION 'Google-only signup requires a fresh database. Keep the existing database as an archive.';
  END IF;
END $$;

DROP INDEX "User_email_key";
DROP INDEX "User_email_idx";
ALTER TABLE "User"
  ADD COLUMN "googleSubject" TEXT NOT NULL,
  DROP COLUMN "passwordHash";
CREATE UNIQUE INDEX "User_googleSubject_key" ON "User"("googleSubject");

COMMIT;
