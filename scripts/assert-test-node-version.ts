const REQUIRED_NODE_MAJOR = 24

export function assertTestNodeVersion(): void {
  const actualVersion = process.versions.node
  const actualMajor = Number.parseInt(actualVersion.split('.')[0] ?? '', 10)

  if (actualMajor !== REQUIRED_NODE_MAJOR) {
    throw new Error(
      `Tests require Node.js ${REQUIRED_NODE_MAJOR}.x, but Node.js ${actualVersion} is running. Run "nvm use ${REQUIRED_NODE_MAJOR}" and retry.`,
    )
  }
}
