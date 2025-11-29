import { describe, expect, test } from "bun:test";
import { parseDiff } from "../DiffView";

describe("parseDiff", () => {
  test("parses empty diff", () => {
    const result = parseDiff("");
    expect(result).toEqual([]);
  });

  test("parses single file diff with additions", () => {
    const diff = `diff --git a/test.txt b/test.txt
--- a/test.txt
+++ b/test.txt
@@ -1,3 +1,4 @@
 line 1
 line 2
+new line
 line 3`;

    const result = parseDiff(diff);

    expect(result).toHaveLength(1);
    expect(result[0].oldPath).toBe("test.txt");
    expect(result[0].newPath).toBe("test.txt");
    expect(result[0].hunks).toHaveLength(1);
    expect(result[0].hunks[0].oldStart).toBe(1);
    expect(result[0].hunks[0].oldCount).toBe(3);
    expect(result[0].hunks[0].newStart).toBe(1);
    expect(result[0].hunks[0].newCount).toBe(4);
    expect(result[0].hunks[0].lines).toHaveLength(4);

    const lines = result[0].hunks[0].lines;
    expect(lines[0].type).toBe("context");
    expect(lines[0].content).toBe("line 1");
    expect(lines[1].type).toBe("context");
    expect(lines[1].content).toBe("line 2");
    expect(lines[2].type).toBe("addition");
    expect(lines[2].content).toBe("new line");
    expect(lines[3].type).toBe("context");
    expect(lines[3].content).toBe("line 3");
  });

  test("parses single file diff with deletions", () => {
    const diff = `diff --git a/test.txt b/test.txt
--- a/test.txt
+++ b/test.txt
@@ -1,4 +1,3 @@
 line 1
-deleted line
 line 2
 line 3`;

    const result = parseDiff(diff);

    expect(result).toHaveLength(1);
    const lines = result[0].hunks[0].lines;
    expect(lines[0].type).toBe("context");
    expect(lines[1].type).toBe("deletion");
    expect(lines[1].content).toBe("deleted line");
    expect(lines[2].type).toBe("context");
    expect(lines[3].type).toBe("context");
  });

  test("parses multiple file diff", () => {
    const diff = `diff --git a/file1.txt b/file1.txt
--- a/file1.txt
+++ b/file1.txt
@@ -1,2 +1,3 @@
 line 1
+added
 line 2
diff --git a/file2.txt b/file2.txt
--- a/file2.txt
+++ b/file2.txt
@@ -1,3 +1,2 @@
 line 1
-removed
 line 2`;

    const result = parseDiff(diff);

    expect(result).toHaveLength(2);
    expect(result[0].newPath).toBe("file1.txt");
    expect(result[1].newPath).toBe("file2.txt");
  });

  test("parses new file diff", () => {
    const diff = `diff --git a/newfile.txt b/newfile.txt
--- /dev/null
+++ b/newfile.txt
@@ -0,0 +1,3 @@
+line 1
+line 2
+line 3`;

    const result = parseDiff(diff);

    expect(result).toHaveLength(1);
    expect(result[0].oldPath).toBe("/dev/null");
    expect(result[0].newPath).toBe("newfile.txt");
    expect(result[0].hunks[0].lines).toHaveLength(3);
    expect(result[0].hunks[0].lines.every((l) => l.type === "addition")).toBe(
      true,
    );
  });

  test("parses deleted file diff", () => {
    const diff = `diff --git a/deleted.txt b/deleted.txt
--- a/deleted.txt
+++ /dev/null
@@ -1,2 +0,0 @@
-line 1
-line 2`;

    const result = parseDiff(diff);

    expect(result).toHaveLength(1);
    expect(result[0].oldPath).toBe("deleted.txt");
    expect(result[0].newPath).toBe("/dev/null");
    expect(result[0].hunks[0].lines).toHaveLength(2);
    expect(result[0].hunks[0].lines.every((l) => l.type === "deletion")).toBe(
      true,
    );
  });

  test("tracks line numbers correctly", () => {
    const diff = `diff --git a/test.txt b/test.txt
--- a/test.txt
+++ b/test.txt
@@ -5,4 +5,5 @@
 context line
-deleted line
+added line 1
+added line 2
 another context`;

    const result = parseDiff(diff);
    const lines = result[0].hunks[0].lines;

    // Context line
    expect(lines[0].oldLineNumber).toBe(5);
    expect(lines[0].newLineNumber).toBe(5);

    // Deleted line
    expect(lines[1].oldLineNumber).toBe(6);
    expect(lines[1].newLineNumber).toBeUndefined();

    // Added lines
    expect(lines[2].oldLineNumber).toBeUndefined();
    expect(lines[2].newLineNumber).toBe(6);
    expect(lines[3].oldLineNumber).toBeUndefined();
    expect(lines[3].newLineNumber).toBe(7);

    // Final context line
    expect(lines[4].oldLineNumber).toBe(7);
    expect(lines[4].newLineNumber).toBe(8);
  });

  test("parses multiple hunks in single file", () => {
    const diff = `diff --git a/test.txt b/test.txt
--- a/test.txt
+++ b/test.txt
@@ -1,3 +1,4 @@
 line 1
+added at top
 line 2
 line 3
@@ -10,3 +11,4 @@
 line 10
 line 11
+added at bottom
 line 12`;

    const result = parseDiff(diff);

    expect(result).toHaveLength(1);
    expect(result[0].hunks).toHaveLength(2);
    expect(result[0].hunks[0].oldStart).toBe(1);
    expect(result[0].hunks[1].oldStart).toBe(10);
  });

  test("generates unique IDs for hunks and lines", () => {
    const diff = `diff --git a/test.txt b/test.txt
--- a/test.txt
+++ b/test.txt
@@ -1,2 +1,3 @@
 line 1
+added
 line 2`;

    const result = parseDiff(diff);

    expect(result[0].hunks[0].id).toBe("hunk-1-1");
    expect(result[0].hunks[0].lines[0].id).toBe("line-1-1-1");
    expect(result[0].hunks[0].lines[1].id).toBe("line-1-1-2");
    expect(result[0].hunks[0].lines[2].id).toBe("line-1-1-3");
  });
});

describe("DiffView rendering", () => {
  test("diff types are correctly identified", () => {
    const diff = `diff --git a/test.txt b/test.txt
--- a/test.txt
+++ b/test.txt
@@ -1,3 +1,3 @@
 unchanged
-old
+new
 unchanged`;

    const result = parseDiff(diff);
    const lines = result[0].hunks[0].lines;

    expect(lines.filter((l) => l.type === "context")).toHaveLength(2);
    expect(lines.filter((l) => l.type === "deletion")).toHaveLength(1);
    expect(lines.filter((l) => l.type === "addition")).toHaveLength(1);
  });
});
