UPDATE "test_revisions"
SET "content" = ("content" - 'environmentId') || jsonb_build_object(
  'environmentIds',
  jsonb_build_array("content" -> 'environmentId')
)
WHERE "content" ? 'environmentId'
  AND NOT ("content" ? 'environmentIds');
