export const metadata = {
  "id": "safe-patch-verification-fail-fixture",
  "title": "Safe Patch Verification Fail Fixture",
  "version": "1.0.0",
  "permissions": ["safePatch"],
  "safe_patch_policy": {
    "mode": "patch",
    "allowed_paths": ["src/generated/**"],
    "forbidden_paths": [".env", ".git", ".git/**"],
    "verification_commands": ["test -f src/generated/missing.js"]
  }
};

export default async function workflow(cwf) {
  const result = await cwf.safePatch.apply({
    patch: "diff --git a/src/generated/value.js b/src/generated/value.js\nnew file mode 100644\nindex 0000000..42d3b06\n--- /dev/null\n+++ b/src/generated/value.js\n@@ -0,0 +1 @@\n+export const value = 42;\n",
    write_policy: {
      mode: "patch",
      allowed_paths: ["src/generated/**"],
      forbidden_paths: [".env", ".git", ".git/**"],
      verification_commands: ["test -f src/generated/missing.js"]
    }
  });
  return {
    template: "safe-patch-verification-fail-fixture",
    safe_patch: result
  };
}
