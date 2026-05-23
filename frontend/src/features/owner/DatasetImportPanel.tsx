import { Alert, Button, Input, Space, Table, Typography } from "antd";
import { useState } from "react";

import { importItems } from "./api";
import type { ItemImportEntry, TaskItemRead } from "./types";

type DatasetImportPanelProps = {
  taskId: string;
  onImported: (items: TaskItemRead[]) => void;
};

const sample = JSON.stringify(
  [
    {
      external_id: "row-1",
      payload: { text: "Paste source text here", metadata: { source: "demo" } },
    },
  ],
  null,
  2,
);

export function DatasetImportPanel({ taskId, onImported }: DatasetImportPanelProps) {
  const [value, setValue] = useState(sample);
  const [preview, setPreview] = useState<ItemImportEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function parseItems() {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new Error("Dataset must be a non-empty JSON array.");
    }
    return parsed.map((entry, index) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        throw new Error(`Item ${index + 1} must be an object.`);
      }
      const item = entry as Record<string, unknown>;
      if (!item.payload || typeof item.payload !== "object" || Array.isArray(item.payload)) {
        throw new Error(`Item ${index + 1} must include a payload object.`);
      }
      return {
        external_id: typeof item.external_id === "string" ? item.external_id : null,
        payload: item.payload as Record<string, unknown>,
      };
    });
  }

  function handlePreview() {
    try {
      const items = parseItems();
      setPreview(items);
      setError(null);
    } catch (err) {
      setPreview([]);
      setError(err instanceof Error ? err.message : "Invalid dataset JSON.");
    }
  }

  async function handleImport() {
    try {
      const items = preview.length > 0 ? preview : parseItems();
      setSubmitting(true);
      setError(null);
      const imported = await importItems(taskId, items);
      onImported(imported);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to import items.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="ops-card" aria-labelledby="dataset-import-heading">
      <Typography.Title id="dataset-import-heading" level={3}>
        Dataset import
      </Typography.Title>
      {error ? <Alert className="section-alert" message={error} type="error" /> : null}
      <label className="schema-control">
        <span>Items JSON</span>
        <Input.TextArea
          value={value}
          rows={10}
          onChange={(event) => setValue(event.target.value)}
        />
      </label>
      <Space className="section-actions">
        <Button onClick={handlePreview}>Preview import</Button>
        <Button loading={submitting} type="primary" onClick={handleImport}>
          Import dataset
        </Button>
      </Space>
      <Table
        columns={[
          { title: "External ID", dataIndex: "external_id", key: "external_id", render: (id) => id || "None" },
          {
            title: "Payload keys",
            key: "payload",
            render: (_: unknown, record: ItemImportEntry) => Object.keys(record.payload).join(", ") || "None",
          },
        ]}
        dataSource={preview}
        pagination={false}
        rowKey={(record, index) => record.external_id ?? String(index)}
        size="small"
      />
    </section>
  );
}
