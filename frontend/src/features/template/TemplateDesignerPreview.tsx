import { SchemaRenderer } from "../schema-renderer";
import type { TemplateSchemaDocument } from "../schema-renderer";

type TemplateDesignerPreviewProps = {
  schema: TemplateSchemaDocument;
};

export function TemplateDesignerPreview({ schema }: TemplateDesignerPreviewProps) {
  return (
    <div className="designer-preview">
      <SchemaRenderer
        schema={schema}
        item={{ payload: { text: "预览数据项文本", score: 4, metadata: { source: "preview" } } }}
        readOnly
      />
    </div>
  );
}
