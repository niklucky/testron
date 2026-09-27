# Push, pull, and conflicts

Push uploads a source snapshot, preserving each test's UUID, suite, title, and
source location. The server validates the whole selected upload before committing
it in one transaction. Partial pushes never delete other tests. Removing a local
test does not automatically delete its Testron record.

The upload includes selected specs, their statically resolvable local imports,
Playwright configuration, available package/lock/TypeScript configuration files,
and explicit supportFiles. Node modules, .env files, and known authentication-state
paths are excluded or rejected. Review source before publishing: code can contain
hardcoded credentials. Dynamically loaded assets must be listed in supportFiles.
This is a source snapshot, not an executable deployment bundle.

Pull without source flags refreshes the suite map and test catalog. It does not
advance source baselines. Pull --tests or --test downloads available source context.
A test in a shared file is downloaded with the complete file and its stored support
files. Requests without source become local work items, not empty passing tests.
Recorder tests are exported as standalone annotated specs under tests/testron.

Synchronization stores local baselines in .testron/state.json. If only the remote
source changed, pull updates the local file. If only local source changed, it stays
local. If both changed, or an existing file has no baseline and differs from the
remote copy, pull reports PULL_CONFLICT before writing source files.

Push compares test revisions and file hashes. A conflict means another checkout or
the UI changed the synchronized version. Inspect both versions and reconcile them;
there is no implicit force overwrite. To adopt a remote version, preserve your local
edits elsewhere and put the reviewed remote content in place, then pull to establish
the common baseline. An exact match can safely establish a baseline after a lost
response or on a fresh checkout.

Commit configuration, generated references, .testron/AGENT.md, and test IDs. Ignore local state and
catalog caches. Different repositories need different repositoryIds. Feature branches
currently share the same remote test records, so their conflicting pushes are rejected;
separate branch previews are not part of this release.
