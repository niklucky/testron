import { writeFileSync } from 'node:fs';
import type { FullConfig, Reporter, Suite, TestError } from '@playwright/test/reporter';

class DiscoveryReporter implements Reporter {
  private errors: string[] = [];
  private tests: unknown[] = [];
  onBegin(_config: FullConfig, suite: Suite) {
    this.tests = suite.allTests().map((test) => ({
      title: test.title,
      titlePath: test.titlePath().slice(3),
      file: test.location.file,
      line: test.location.line,
      column: test.location.column,
      annotations: test.annotations,
      project: test.parent.project()?.name ?? '',
    }));
  }
  onError(error: TestError) {
    this.errors.push(error.message ?? 'Playwright discovery failed.');
  }
  onEnd() {
    writeFileSync(
      process.env.TESTRON_DISCOVERY_FILE!,
      JSON.stringify({ tests: this.tests, errors: this.errors }),
    );
  }
}
export default DiscoveryReporter;
