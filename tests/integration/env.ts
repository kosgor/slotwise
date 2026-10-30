try {
  process.loadEnvFile(".env.local");
} catch {
  // CI provides the variables directly.
}
