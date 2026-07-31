import { readFile, rm } from 'node:fs/promises'
import { resolve } from 'node:path'

import libCoverage from 'istanbul-lib-coverage'
import libReport from 'istanbul-lib-report'
import reports from 'istanbul-reports'

const projectRoot = process.cwd()
const coverageMap = libCoverage.createCoverageMap({})
const inputReports = [
  resolve(projectRoot, 'coverage/parts/unit/coverage-final.json'),
  resolve(projectRoot, 'coverage/parts/firebase/coverage-final.json'),
  resolve(projectRoot, 'push-worker/coverage/coverage-final.json'),
]

for (const inputReport of inputReports) {
  const contents = await readFile(inputReport, 'utf8')
  coverageMap.merge(JSON.parse(contents))
}

const outputDirectory = resolve(projectRoot, 'coverage/all')
await rm(outputDirectory, { recursive: true, force: true })

const context = libReport.createContext({
  coverageMap,
  dir: outputDirectory,
})

for (const reporter of ['text', 'html', 'json', 'json-summary']) {
  reports.create(reporter).execute(context)
}
