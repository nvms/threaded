import {
  readFileSync,
  writeFileSync,
  unlinkSync,
  readdirSync,
  statSync,
} from "fs";
import { resolve, join } from "path";
import { execSync } from "child_process";
import fg from "fast-glob";
import { z } from "zod";

let nextTaskId = 1;
const tasks = [];

export const read_file = {
  name: "read_file",
  description:
    "Read contents of a file, optionally specifying line range. 1-based, inclusive.",
  schema: z.object({
    path: z.string().describe("Path to the file"),
    start_line: z
      .number()
      .optional()
      .describe(
        "Starting line number (1-indexed). Omit to read from beginning.",
      ),
    end_line: z
      .number()
      .optional()
      .describe("Ending line number (1-indexed). Omit to read to end of file."),
  }),
  execute: ({ path, start_line, end_line }) => {
    try {
      const fullPath = resolve(process.cwd(), path);
      const content = readFileSync(fullPath, "utf-8");
      const lines = content.split("\n");

      const start = start_line ? start_line - 1 : 0;
      const end = end_line ? end_line : lines.length;

      const selectedLines = lines.slice(start, end);

      return selectedLines
        .map((line, idx) => `${start + idx + 1}: ${line}`)
        .join("\n");
    } catch (error) {
      return `Error reading file: ${error.message}`;
    }
  },
};

export const write_file = {
  name: "write_file",
  description:
    "Write content to a file, creating it if it doesn't exist or overwriting if it does",
  schema: z.object({
    path: z.string().describe("Path to the file"),
    content: z.string().describe("Content to write to the file"),
  }),
  execute: ({ path, content }) => {
    try {
      const fullPath = resolve(process.cwd(), path);
      writeFileSync(fullPath, content, "utf-8");
      return `Successfully wrote to ${path}`;
    } catch (error) {
      return `Error writing file: ${error.message}`;
    }
  },
};

export const edit_file = {
  name: "edit_file",
  description:
    "Edit a file by replacing a specific line range with new content",
  schema: z.object({
    path: z.string().describe("Path to the file"),
    start_line: z.number().describe("First line to replace (1-indexed)"),
    end_line: z.number().describe("Last line to replace (1-indexed)"),
    new_content: z.string().describe("New content to replace the line range"),
  }),
  execute: ({ path, start_line, end_line, new_content }) => {
    const fullPath = resolve(process.cwd(), path);
    let content;

    try {
      content = readFileSync(fullPath, "utf-8");
    } catch (error) {
      throw new Error(`Failed to read file: ${error.message}`);
    }

    const lines = content.split("\n");

    if (start_line < 1 || start_line > lines.length) {
      throw new Error(
        `start_line ${start_line} is out of range. File has ${lines.length} lines.`,
      );
    }

    if (end_line < start_line || end_line > lines.length) {
      throw new Error(
        `end_line ${end_line} is invalid. Must be >= start_line (${start_line}) and <= ${lines.length}.`,
      );
    }

    const before = lines.slice(0, start_line - 1);
    const after = lines.slice(end_line);

    const originalLine = lines[start_line - 1];
    const indentMatch = originalLine.match(/^\s*/);
    const indent = indentMatch ? indentMatch[0] : "";

    const processedContent = new_content.includes("\n")
      ? new_content
      : new_content.startsWith(indent)
        ? new_content
        : indent + new_content.trimStart();

    const result = [...before, processedContent, ...after].join("\n");

    try {
      writeFileSync(fullPath, result, "utf-8");
      const lineCount = end_line - start_line + 1;
      return `Successfully edited ${path} (replaced ${lineCount} line${lineCount > 1 ? "s" : ""})`;
    } catch (error) {
      throw new Error(`Failed to write file: ${error.message}`);
    }
  },
};

export const delete_file = {
  name: "delete_file",
  description: "Delete a file from the filesystem",
  schema: z.object({
    path: z.string().describe("Path to the file to delete"),
  }),
  execute: ({ path }) => {
    try {
      const fullPath = resolve(process.cwd(), path);
      unlinkSync(fullPath);
      return `Successfully deleted ${path}`;
    } catch (error) {
      return `Error deleting file: ${error.message}`;
    }
  },
};

export const list_directory = {
  name: "list_directory",
  description: "List contents of a directory (non-recursive)",
  schema: z.object({
    path: z.string().describe("Absolute path to the directory"),
  }),
  execute: ({ path }) => {
    try {
      const entries = readdirSync(path);
      const details = entries.map((entry) => {
        const fullPath = join(path, entry);
        const stats = statSync(fullPath);
        return `${stats.isDirectory() ? "[DIR]" : "[FILE]"} ${entry}`;
      });
      return details.join("\n");
    } catch (error) {
      return `Error listing directory: ${error.message}`;
    }
  },
};

export const task_add = {
  name: "task_add",
  description: "Add a new task to the queue",
  schema: z.object({
    description: z.string().describe("What needs to be done"),
    priority: z.enum(["high", "normal"]).optional().describe("Task priority"),
  }),
  execute: ({ description, priority = "normal" }) => {
    const task = {
      id: nextTaskId++,
      description,
      status: "pending",
      created: Date.now(),
    };

    if (priority === "high") {
      tasks.unshift(task);
    } else {
      tasks.push(task);
    }

    return `Added task ${task.id}: ${description}`;
  },
};

export const task_remove = {
  name: "task_remove",
  description: "Remove a task from the queue",
  schema: z.object({
    id: z.number().describe("Task ID to remove"),
  }),
  execute: ({ id }) => {
    tasks = tasks.filter((t) => t.id !== id);
    return `Removed task ${id}`;
  },
};

export const task_start = {
  name: "task_start",
  description: "Mark the current task as in-progress",
  schema: z.object({
    id: z.number().describe("Task ID to start"),
  }),
  execute: ({ id }) => {
    const task = tasks.find((t) => t.id === id);
    if (task) {
      task.status = "in-progress";
      return `Started task ${id}: ${task.description}`;
    }
    return `Task ${id} not found`;
  },
};

export const task_complete = {
  name: "task_complete",
  description: "Mark the current task as completed",
  schema: z.object({
    id: z.number().describe("Task ID to complete"),
    summary: z.string().describe("Brief summary of what was accomplished"),
  }),
  execute: ({ id, summary }) => {
    const task = tasks.find((t) => t.id === id);
    if (task) {
      task.status = "completed";
      return `Completed task ${id}: ${summary}`;
    }
    return `Task ${id} not found`;
  },
};

export const glob = {
  name: "glob",
  description: "Fast file pattern matching using glob patterns",
  schema: z.object({
    pattern: z
      .string()
      .describe(
        "Glob pattern to match files against (e.g., **/*.js, src/**/*.ts)",
      ),
    path: z
      .string()
      .optional()
      .describe(
        "Directory to search in. Omit to use current working directory.",
      ),
  }),
  execute: ({ pattern, path }) => {
    try {
      const cwd = path ? resolve(process.cwd(), path) : process.cwd();
      const files = fg.sync(pattern, { cwd, dot: true });
      return files.length > 0
        ? files.join("\n")
        : "No files matched the pattern";
    } catch (error) {
      return `Error matching pattern: ${error.message}`;
    }
  },
};

export const grep = {
  name: "grep",
  description:
    "Search for patterns in files using regex. Uses ripgrep (rg) if available, falls back to grep.",
  schema: z.object({
    pattern: z.string().describe("Regular expression pattern to search for"),
    path: z
      .string()
      .optional()
      .describe(
        "File or directory to search in. Defaults to current working directory.",
      ),
    output_mode: z
      .enum(["content", "files_with_matches", "count"])
      .optional()
      .describe(
        "Output mode: 'content' shows matching lines, 'files_with_matches' shows file paths, 'count' shows match counts. Defaults to 'files_with_matches'.",
      ),
    glob: z
      .string()
      .optional()
      .describe("Glob pattern to filter files (e.g., *.js, *.{ts,tsx})"),
    type: z
      .string()
      .optional()
      .describe("File type to search (e.g., js, py, rust, go)"),
    i: z.boolean().optional().describe("Case insensitive search"),
    n: z
      .boolean()
      .optional()
      .describe("Show line numbers (requires output_mode: 'content')"),
    A: z
      .number()
      .optional()
      .describe(
        "Lines to show after each match (requires output_mode: 'content')",
      ),
    B: z
      .number()
      .optional()
      .describe(
        "Lines to show before each match (requires output_mode: 'content')",
      ),
    C: z
      .number()
      .optional()
      .describe(
        "Lines to show before and after each match (requires output_mode: 'content')",
      ),
    head_limit: z
      .number()
      .optional()
      .describe("Limit output to first N lines/entries"),
    multiline: z
      .boolean()
      .optional()
      .describe("Enable multiline mode where . matches newlines"),
  }),
  execute: (params) => {
    try {
      const {
        pattern,
        path = ".",
        output_mode = "files_with_matches",
      } = params;

      let cmd;
      try {
        execSync("which rg", { stdio: "ignore" });
        cmd = "rg";
      } catch {
        cmd = "grep";
      }

      const args = [];

      if (cmd === "rg") {
        if (output_mode === "files_with_matches") args.push("-l");
        if (output_mode === "count") args.push("-c");
        if (params.i) args.push("-i");
        if (params.n && output_mode === "content") args.push("-n");
        if (params.A && output_mode === "content") args.push(`-A ${params.A}`);
        if (params.B && output_mode === "content") args.push(`-B ${params.B}`);
        if (params.C && output_mode === "content") args.push(`-C ${params.C}`);
        if (params.glob) args.push(`--glob '${params.glob}'`);
        if (params.type) args.push(`--type ${params.type}`);
        if (params.multiline) args.push("-U --multiline-dotall");
      } else {
        args.push("-r");
        if (output_mode === "files_with_matches") args.push("-l");
        if (output_mode === "count") args.push("-c");
        if (params.i) args.push("-i");
        if (params.n && output_mode === "content") args.push("-n");
        if (params.A && output_mode === "content") args.push(`-A ${params.A}`);
        if (params.B && output_mode === "content") args.push(`-B ${params.B}`);
        if (params.C && output_mode === "content") args.push(`-C ${params.C}`);
      }

      const fullCmd = `${cmd} ${args.join(" ")} '${pattern}' ${path}`;
      let result = execSync(fullCmd, {
        encoding: "utf-8",
        maxBuffer: 10 * 1024 * 1024,
      });

      if (params.head_limit) {
        const lines = result.trim().split("\n");
        result = lines.slice(0, params.head_limit).join("\n");
      }

      return result.trim() || "No matches found";
    } catch (error) {
      if (error.status === 1) return "No matches found";
      return `Error searching: ${error.message}`;
    }
  },
};

export const bash = {
  name: "bash",
  description: "Execute a bash command",
  schema: z.object({
    command: z.string().describe("The command to execute"),
    description: z
      .string()
      .optional()
      .describe(
        "Clear, concise description of what this command does in 5-10 words, in active voice",
      ),
    timeout: z
      .number()
      .optional()
      .describe(
        "Optional timeout in milliseconds (max 120000). Defaults to 120000.",
      ),
  }),
  execute: ({ command, timeout = 120000 }) => {
    try {
      const result = execSync(command, {
        encoding: "utf-8",
        timeout: Math.min(timeout, 120000),
        maxBuffer: 10 * 1024 * 1024,
      });
      return result.trim() || "Command executed successfully (no output)";
    } catch (error) {
      return `Error executing command: ${error.message}\n${error.stderr || ""}`.trim();
    }
  },
};
