import type { DragEvent } from "react";

import type { TemplateField, TemplateFieldType } from "../schema-renderer";
import { FIELD_INDEX_DRAG_DATA, FIELD_TYPE_DRAG_DATA } from "./templateDesignerModel";

type TemplateDesignerCanvasProps = {
  fields: TemplateField[];
  selectedIndex: number | null;
  onAddField: (type: TemplateFieldType, index?: number) => void;
  onDeleteField: (index: number) => void;
  onDuplicateField: (index: number) => void;
  onMoveField: (fromIndex: number, toIndex: number) => void;
  onSelectField: (index: number) => void;
};

export function TemplateDesignerCanvas({
  fields,
  selectedIndex,
  onAddField,
  onDeleteField,
  onDuplicateField,
  onMoveField,
  onSelectField,
}: TemplateDesignerCanvasProps) {
  function handleDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    applyDrop(event);
  }

  function handleDropAt(event: DragEvent<HTMLElement>, index: number) {
    event.preventDefault();
    event.stopPropagation();
    applyDrop(event, index);
  }

  function applyDrop(event: DragEvent<HTMLElement>, index = fields.length) {
    const fieldType = event.dataTransfer.getData(FIELD_TYPE_DRAG_DATA) as TemplateFieldType;
    if (fieldType) {
      onAddField(fieldType, index);
      return;
    }
    const sourceIndexPayload = event.dataTransfer.getData(FIELD_INDEX_DRAG_DATA);
    if (!/^\d+$/.test(sourceIndexPayload)) {
      return;
    }
    const sourceIndex = Number(sourceIndexPayload);
    if (Number.isInteger(sourceIndex)) {
      onMoveField(sourceIndex, Math.min(index, fields.length - 1));
    }
  }

  return (
    <main
      aria-label="字段画布"
      className="designer-canvas"
      onDragOver={(event) => event.preventDefault()}
      onDrop={handleDrop}
    >
      <div className="canvas-header">
        <h4 className="designer-panel-title">字段</h4>
        <span>{fields.length}</span>
      </div>
      {fields.length === 0 ? (
        <p className="canvas-empty">暂无字段</p>
      ) : (
        <div className="field-list">
          {fields.map((field, index) => (
            <TemplateFieldCard
              field={field}
              index={index}
              isSelected={index === selectedIndex}
              isFirst={index === 0}
              isLast={index === fields.length - 1}
              key={`${field.id}-${index}`}
              onDelete={() => onDeleteField(index)}
              onDuplicate={() => onDuplicateField(index)}
              onDropAt={(event) => handleDropAt(event, index)}
              onMoveDown={() => onMoveField(index, index + 1)}
              onMoveUp={() => onMoveField(index, index - 1)}
              onSelect={() => onSelectField(index)}
            />
          ))}
        </div>
      )}
    </main>
  );
}

type TemplateFieldCardProps = {
  field: TemplateField;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  isSelected: boolean;
  onDelete: () => void;
  onDuplicate: () => void;
  onDropAt: (event: DragEvent<HTMLElement>) => void;
  onMoveDown: () => void;
  onMoveUp: () => void;
  onSelect: () => void;
};

function TemplateFieldCard({
  field,
  index,
  isFirst,
  isLast,
  isSelected,
  onDelete,
  onDuplicate,
  onDropAt,
  onMoveDown,
  onMoveUp,
  onSelect,
}: TemplateFieldCardProps) {
  function handleDragStart(event: DragEvent<HTMLElement>) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData(FIELD_INDEX_DRAG_DATA, String(index));
  }

  return (
    <article
      className={isSelected ? "field-card active" : "field-card"}
      draggable
      onDragOver={(event) => event.preventDefault()}
      onDragStart={handleDragStart}
      onDrop={onDropAt}
    >
      <button
        aria-pressed={isSelected}
        className="field-card-main"
        onClick={onSelect}
        type="button"
      >
        <span>{field.label}</span>
        <code>{field.id}</code>
      </button>
      <div className="field-card-actions" aria-label={`${field.label} 操作`}>
        <button aria-label={`上移 ${field.label}`} disabled={isFirst} onClick={onMoveUp} type="button">
          ↑
        </button>
        <button aria-label={`下移 ${field.label}`} disabled={isLast} onClick={onMoveDown} type="button">
          ↓
        </button>
        <button aria-label={`复制 ${field.label}`} onClick={onDuplicate} type="button">
          ⧉
        </button>
        <button aria-label={`删除 ${field.label}`} onClick={onDelete} type="button">
          ×
        </button>
      </div>
    </article>
  );
}
