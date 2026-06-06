export const metadata = {
  "id": "change-summary",
  "title": "Change Summary",
  "version": "1.0.0",
  "permissions": ["read-only"]
};

export default async function workflow(cwf) {
  const changedFiles = await cwf.git.changedFiles();
  const diff = await cwf.git.diff();
  await cwf.artifacts.write({
    name: "change-summary.md",
    content: "# Change Summary\n\nChanged files JSON:\n\n```json\n" + JSON.stringify(changedFiles, null, 2) + "\n```\n\nDiff bytes: " + diff.length + "\n"
  });
  return {
    template: "change-summary",
    changed_file_count: changedFiles.length,
    diff_bytes: diff.length
  };
}
