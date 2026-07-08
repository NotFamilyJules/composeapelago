// The cursor tool switch: what a click on the staff does.
//   Select - move the cursor onto a note
//   Write  - place / replace notes (the default)
//   Delete - remove notes

import type { CursorTool } from "./ScoreView";

interface ToolSelectProps {
  tool: CursorTool;
  onSetTool: (tool: CursorTool) => void;
}

const TOOLS: { id: CursorTool; icon: string; label: string }[] = [
  { id: "select", icon: "➤", label: "Select - click a note to move the cursor onto it" },
  { id: "write", icon: "✏️", label: "Write - click the staff to place notes" },
  { id: "delete", icon: "🗑️", label: "Delete - click a note to remove it" },
];

export function ToolSelect(props: ToolSelectProps) {
  return (
    <div className="tool-select">
      {TOOLS.map((tool) => (
        <button
          key={tool.id}
          className={`palette-button tool-button${props.tool === tool.id ? " selected" : ""}`}
          title={tool.label}
          onClick={() => props.onSetTool(tool.id)}
        >
          <span className="tool-icon">{tool.icon}</span>
          <span className="hotkey">{tool.id}</span>
        </button>
      ))}
    </div>
  );
}
