export default async function workflow(cwf) {
  const files = await cwf.git.changedFiles();
  const reviews = await cwf.map(
    files,
    async (file, index) =>
      cwf.agent.run({
        id: `review-${index}`,
        role: "reviewer",
        prompt: `Review ${file} for correctness and test risk.`,
        permissions: "read-only",
      }),
    { concurrency: 2 },
  );
  await cwf.artifacts.write({
    name: "fixture-note.md",
    content: "Dynamic fixture wrote this artifact through parent CWF JSON-RPC.\n",
  });
  return cwf.report.summarize(reviews);
}
