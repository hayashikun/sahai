interface DiffViewProps {
  diff: string;
}

interface FileDiff {
  oldPath: string;
  newPath: string;
  hunks: DiffHunk[];
}

interface DiffHunk {
  id: string;
  header: string;
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: DiffLine[];
}

interface DiffLine {
  id: string;
  type: "context" | "addition" | "deletion" | "header";
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

export function DiffView({ diff }: DiffViewProps) {
  if (!diff || diff.trim() === "") {
    return (
      <div
        style={{
          padding: "24px",
          textAlign: "center",
          color: "#6b7280",
          border: "1px solid #e5e7eb",
          borderRadius: "8px",
        }}
      >
        No changes to display
      </div>
    );
  }

  const files = parseDiff(diff);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {files.map((file, index) => (
        <FileSection key={`${file.newPath}-${index}`} file={file} />
      ))}
    </div>
  );
}

function FileSection({ file }: { file: FileDiff }) {
  const fileName = file.newPath !== "/dev/null" ? file.newPath : file.oldPath;
  const isNewFile = file.oldPath === "/dev/null";
  const isDeletedFile = file.newPath === "/dev/null";

  return (
    <div
      style={{
        border: "1px solid #d1d5db",
        borderRadius: "8px",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          backgroundColor: "#f3f4f6",
          padding: "8px 12px",
          borderBottom: "1px solid #d1d5db",
          display: "flex",
          alignItems: "center",
          gap: "8px",
        }}
      >
        <span style={{ fontFamily: "monospace", fontWeight: 600 }}>
          {fileName}
        </span>
        {isNewFile && (
          <span
            style={{
              backgroundColor: "#dcfce7",
              color: "#166534",
              padding: "2px 8px",
              borderRadius: "4px",
              fontSize: "12px",
            }}
          >
            New
          </span>
        )}
        {isDeletedFile && (
          <span
            style={{
              backgroundColor: "#fee2e2",
              color: "#991b1b",
              padding: "2px 8px",
              borderRadius: "4px",
              fontSize: "12px",
            }}
          >
            Deleted
          </span>
        )}
      </div>
      <div style={{ overflow: "auto" }}>
        {file.hunks.map((hunk) => (
          <HunkSection key={hunk.id} hunk={hunk} />
        ))}
      </div>
    </div>
  );
}

function HunkSection({ hunk }: { hunk: DiffHunk }) {
  return (
    <div>
      <div
        style={{
          backgroundColor: "#f0f9ff",
          color: "#0369a1",
          padding: "4px 12px",
          fontFamily: "monospace",
          fontSize: "12px",
          borderBottom: "1px solid #e5e7eb",
        }}
      >
        {hunk.header}
      </div>
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontFamily: "monospace",
          fontSize: "13px",
        }}
      >
        <tbody>
          {hunk.lines.map((line) => (
            <DiffLineRow key={line.id} line={line} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DiffLineRow({ line }: { line: DiffLine }) {
  const getLineStyle = () => {
    switch (line.type) {
      case "addition":
        return { backgroundColor: "#dcfce7", color: "#166534" };
      case "deletion":
        return { backgroundColor: "#fee2e2", color: "#991b1b" };
      case "header":
        return { backgroundColor: "#f0f9ff", color: "#0369a1" };
      default:
        return { backgroundColor: "transparent", color: "#374151" };
    }
  };

  const lineNumberStyle = {
    width: "50px",
    minWidth: "50px",
    padding: "0 8px",
    textAlign: "right" as const,
    color: "#9ca3af",
    backgroundColor:
      line.type === "addition"
        ? "#bbf7d0"
        : line.type === "deletion"
          ? "#fecaca"
          : "#f9fafb",
    borderRight: "1px solid #e5e7eb",
    userSelect: "none" as const,
    fontSize: "12px",
  };

  const style = getLineStyle();

  return (
    <tr>
      <td style={lineNumberStyle}>
        {line.type !== "addition" ? (line.oldLineNumber ?? "") : ""}
      </td>
      <td style={lineNumberStyle}>
        {line.type !== "deletion" ? (line.newLineNumber ?? "") : ""}
      </td>
      <td
        style={{
          padding: "0 12px",
          whiteSpace: "pre",
          ...style,
        }}
      >
        <span style={{ marginRight: "8px", fontWeight: 600 }}>
          {line.type === "addition"
            ? "+"
            : line.type === "deletion"
              ? "-"
              : " "}
        </span>
        {line.content}
      </td>
    </tr>
  );
}

export function parseDiff(diff: string): FileDiff[] {
  const files: FileDiff[] = [];
  const lines = diff.split("\n");
  let currentFile: FileDiff | null = null;
  let currentHunk: DiffHunk | null = null;
  let oldLineNumber = 0;
  let newLineNumber = 0;
  let fileIndex = 0;
  let hunkIndex = 0;
  let lineIndex = 0;

  for (const line of lines) {
    // Start of a new file diff
    if (line.startsWith("diff --git")) {
      if (currentFile) {
        files.push(currentFile);
      }
      currentFile = {
        oldPath: "",
        newPath: "",
        hunks: [],
      };
      currentHunk = null;
      fileIndex++;
      hunkIndex = 0;
      continue;
    }

    if (!currentFile) {
      continue;
    }

    // Old file path
    if (line.startsWith("--- ")) {
      const path = line.substring(4);
      currentFile.oldPath = path.startsWith("a/") ? path.substring(2) : path;
      continue;
    }

    // New file path
    if (line.startsWith("+++ ")) {
      const path = line.substring(4);
      currentFile.newPath = path.startsWith("b/") ? path.substring(2) : path;
      continue;
    }

    // Hunk header
    const hunkMatch = line.match(
      /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/,
    );
    if (hunkMatch) {
      hunkIndex++;
      lineIndex = 0;
      currentHunk = {
        id: `hunk-${fileIndex}-${hunkIndex}`,
        header: line,
        oldStart: Number.parseInt(hunkMatch[1], 10),
        oldCount: hunkMatch[2] ? Number.parseInt(hunkMatch[2], 10) : 1,
        newStart: Number.parseInt(hunkMatch[3], 10),
        newCount: hunkMatch[4] ? Number.parseInt(hunkMatch[4], 10) : 1,
        lines: [],
      };
      oldLineNumber = currentHunk.oldStart;
      newLineNumber = currentHunk.newStart;
      currentFile.hunks.push(currentHunk);
      continue;
    }

    if (!currentHunk) {
      continue;
    }

    lineIndex++;

    // Diff lines
    if (line.startsWith("+")) {
      currentHunk.lines.push({
        id: `line-${fileIndex}-${hunkIndex}-${lineIndex}`,
        type: "addition",
        content: line.substring(1),
        newLineNumber: newLineNumber++,
      });
    } else if (line.startsWith("-")) {
      currentHunk.lines.push({
        id: `line-${fileIndex}-${hunkIndex}-${lineIndex}`,
        type: "deletion",
        content: line.substring(1),
        oldLineNumber: oldLineNumber++,
      });
    } else if (line.startsWith(" ") || line === "") {
      currentHunk.lines.push({
        id: `line-${fileIndex}-${hunkIndex}-${lineIndex}`,
        type: "context",
        content: line.substring(1) || "",
        oldLineNumber: oldLineNumber++,
        newLineNumber: newLineNumber++,
      });
    }
  }

  if (currentFile) {
    files.push(currentFile);
  }

  return files;
}
