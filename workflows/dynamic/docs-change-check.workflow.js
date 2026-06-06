export const metadata = {
  "id": "docs-change-check",
  "title": "Docs Change Check",
  "version": "1.0.0",
  "permissions": ["read-only"]
};

export default async function workflow(cwf) {
  const changedFiles = await cwf.git.changedFiles();
  const diff = await cwf.git.diff();
  let docsFiles = 0;
  for (const file of changedFiles) {
    if (String(file).startsWith("docs/") || file === "README.md" || file === "README.zh-CN.md") {
      docsFiles += 1;
    }
  }
  await cwf.artifacts.write({
    name: "docs-change-check.md",
    content: "# Docs Change Check\n\nChanged files JSON:\n\n```json\n" + JSON.stringify(changedFiles, null, 2) + "\n```\n\nDocs-like files: " + docsFiles + "\n\nDiff bytes: " + diff.length + "\n"
  });
  return {
    template: "docs-change-check",
    docs_file_count: docsFiles,
    changed_file_count: changedFiles.length
  };
}
