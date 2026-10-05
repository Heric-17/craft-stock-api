#!/usr/bin/env node
/**
 * Unit and e2e cover different layers by design (see jest.config.js and
 * test/jest-e2e.config.js): domain/application via unit tests with fakes,
 * infrastructure/presentation via e2e tests against a real Postgres.
 * Publishing the two coverage runs separately would make each look like a
 * misleadingly partial picture of the project. This merges both raw
 * Istanbul coverage maps into one report that reflects the whole system.
 *
 * Missing an input is tolerated (not an error) so this step still produces
 * a partial report when an earlier CI step failed before writing its
 * coverage-final.json — the point of `if: always()` on this step is to
 * leave behind something to debug.
 */
const fs = require('node:fs');
const path = require('node:path');

const libCoverage = require('istanbul-lib-coverage');
const libReport = require('istanbul-lib-report');
const reports = require('istanbul-reports');

const ROOT = path.join(__dirname, '..');
const INPUTS = [
  path.join(ROOT, 'coverage', 'unit', 'coverage-final.json'),
  path.join(ROOT, 'coverage', 'e2e', 'coverage-final.json'),
];
const OUTPUT_DIR = path.join(ROOT, 'coverage', 'merged');

function main() {
  const map = libCoverage.createCoverageMap({});
  let mergedAny = false;

  for (const file of INPUTS) {
    if (!fs.existsSync(file)) {
      console.warn(`merge-coverage: skipping missing ${path.relative(ROOT, file)}`);
      continue;
    }

    map.merge(JSON.parse(fs.readFileSync(file, 'utf8')));
    mergedAny = true;
  }

  if (!mergedAny) {
    console.error('merge-coverage: no coverage-final.json found in coverage/unit or coverage/e2e');
    process.exitCode = 1;
    return;
  }

  const context = libReport.createContext({ dir: OUTPUT_DIR, coverageMap: map });

  for (const reporter of ['lcov', 'html', 'text-summary', 'json-summary']) {
    reports.create(reporter).execute(context);
  }
}

main();
