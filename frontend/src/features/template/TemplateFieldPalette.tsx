import type { DragEvent } from "react";

import type { TemplateFieldType } from "../schema-renderer";
import { FIELD_TYPE_DRAG_DATA, fieldPalette } from "./templateDesignerModel";

type TemplateFieldPaletteProps = {
  onAddField: (type: TemplateFieldType) => void;
};

export function TemplateFieldPalette({ onAddField }: TemplateFieldPaletteProps) {
  function handleDragStart(event: DragEvent<HTMLButtonElement>, type: TemplateFieldType) {
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData(FIELD_TYPE_DRAG_DATA, type);
  }

  return (
    <aside className="designer-panel" aria-label="组件面板">
      <h4 className="designer-panel-title">组件面板</h4>
      <div className="palette-buttons">
        {fieldPalette.map((item) => (
          <button
            aria-label={`添加${item.label}`}
            className="palette-item"
            draggable
            key={item.type}
            onClick={() => onAddField(item.type)}
            onDragStart={(event) => handleDragStart(event, item.type)}
            type="button"
          >
            <span>{item.label}</span>
            <code>{item.type}</code>
          </button>
        ))}
      </div>
    </aside>
  );
}
