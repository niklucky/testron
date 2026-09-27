import { readFile } from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';
import { parsePlaywright } from '@testron/domain/codegen/parse-playwright';
import { presentStep } from '@testron/domain/steps/present';
import { declaration, executionMode, type DiscoveredTest } from './discovery';

// This is source adaptation, not a test linter. Agents review portability using SKILL.md.
export async function publicationSource(root: string, test: DiscoveredTest) {
  const source = await readFile(path.join(root, test.file), 'utf8');
  const ast = ts.createSourceFile(test.file, source, ts.ScriptTarget.Latest, true);
  const call = declaration(ast, test);
  const callback = call?.arguments.at(-1);
  const imports = ast.statements.filter(ts.isImportDeclaration);
  const hasDependencies = imports.some((item) => {
    const name = ts.isStringLiteral(item.moduleSpecifier) ? item.moduleSpecifier.text : '';
    return (
      name !== '@playwright/test' &&
      !/(^|\/)testron\.(generated|fixture)(\.[cm]?[jt]s)?$/.test(name)
    );
  });
  const metadata = (name: string) =>
    test.annotations.filter((item) => item.type === `testron.${name}`).at(-1)?.description;
  // Keep top-level helpers and hooks in portable source. The existing runner reports
  // unsupported execution rather than silently dropping setup or custom behavior.
  const extra = ast.statements.filter(
    (item) =>
      !ts.isImportDeclaration(item) &&
      item !== call?.parent &&
      !(
        ts.isExpressionStatement(item) &&
        ts.isCallExpression(item.expression) &&
        /^(test|test\.describe)$/.test(item.expression.expression.getText(ast))
      ),
  );
  const complex =
    hasDependencies ||
    !call ||
    !ast.statements.includes(call.parent as ts.Statement) ||
    ast.statements.filter(
      (item) =>
        ts.isExpressionStatement(item) &&
        ts.isCallExpression(item.expression) &&
        item.expression.expression.getText(ast) === 'test',
    ).length !== 1 ||
    extra.some(
      (item) =>
        !(
          ts.isVariableStatement(item) &&
          item.declarationList.declarations.every(
            (declaration) => declaration.name.getText(ast) === 'requiredEnv',
          )
        ),
    );
  const portable = executionMode(test) === 'ci-and-testron' && !complex;
  const document = callback
    ? `import { test, expect } from '@playwright/test';\n${extra.map((item) => item.getText(ast)).join('\n')}\ntest(${JSON.stringify(test.title)}, ${callback.getText(ast)});\n`
    : source;
  const parsed = parsePlaywright(document);
  const humanSteps = metadata('steps')
    ? (JSON.parse(metadata('steps')!) as string[])
    : parsed.steps.map(({ step }) => presentStep(step));
  return {
    kind: portable ? ('portable' as const) : ('catalogue' as const),
    execution: portable ? ('ci-and-testron' as const) : ('ci-only' as const),
    source: portable ? document : (call?.getText(ast) ?? source),
    description: metadata('description') ?? test.title,
    humanSteps,
    downgrade: executionMode(test) === 'ci-and-testron' && complex,
  };
}
