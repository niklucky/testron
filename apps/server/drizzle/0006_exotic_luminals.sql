ALTER TABLE "tests" ADD COLUMN "title" text;--> statement-breakpoint
UPDATE "tests"
SET "title" = "test_revisions"."content" ->> 'title'
FROM "test_revisions"
WHERE "tests"."current_revision_id" = "test_revisions"."id";--> statement-breakpoint
UPDATE "tests" SET "title" = 'Untitled test' WHERE "title" IS NULL;--> statement-breakpoint
ALTER TABLE "tests" ALTER COLUMN "title" SET NOT NULL;
