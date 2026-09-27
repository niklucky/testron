# Push, pull, and conflicts

Push selects tests annotated publish: true. It preserves identity and publishes
source, title, description and scenario steps. Portable tests also update their
editable step projection. Complex tests are catalogue entries: helper and fixture
files remain in the repository. Spec files containing multiple tests are synchronized
whole, so source publication is not a file-level privacy boundary.

Pull without source flags refreshes generated references and the test catalogue.
Pull --test or --tests downloads source. Portable tests receive a local execution
fixture and preserve their existing file path when already linked to this repository.
Testron-authored imports initially use importDir (default tests/testron). Catalogue
source is useful for review; it is not a complete executable repository backup.
Requests without implementations become local work items rather than passing stubs.

Synchronization tracks test revisions, local file hashes and uploaded-file baselines
separately in .testron/state.json. This supports UI edits followed by pull/edit/push
without confusing the locally adapted file with the canonical Testron document.
Conflicts never authorize overwriting unrelated work. Reconcile both versions before
retrying. Partial pushes never delete other tests or reset their revisions.

Commit configuration, generated references, agent instructions and test IDs. Ignore
local state/catalog caches and credentials. Different repositories need different
repositoryIds. Checkouts of one repository share test records; conflicting updates
are rejected. Test history survives a downgrade from portable to CI catalogue.
