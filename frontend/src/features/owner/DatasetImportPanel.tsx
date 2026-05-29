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
      payload: { text: "在这里粘贴源文本", metadata: { source: "demo" } },
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
      throw new Error("数据集必须是非空 JSON 数组。");
    }
    return parsed.map((entry, index) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        throw new Error(`第 ${index + 1} 个数据项必须是对象。`);
      }
      const item = entry as Record<string, unknown>;
      if (!item.payload || typeof item.payload !== "object" || Array.isArray(item.payload)) {
        throw new Error(`第 ${index + 1} 个数据项必须包含 payload 对象。`);
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
      setError(err instanceof Error ? err.message : "数据集 JSON 无效。");
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
      setError(err instanceof Error ? err.message : "导入数据项失败。");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="ops-card" aria-labelledby="dataset-import-heading">
      <Typography.Title id="dataset-import-heading" level={3}>
        数据集导入
      </Typography.Title>
      {error ? <Alert className="section-alert" message={error} type="error" /> : null}
      <label className="schema-control">
        <span>数据项 JSON</span>
        <Input.TextArea
          value={value}
          rows={10}
          onChange={(event) => setValue(event.target.value)}
        />
      </label>
      <Space className="section-actions">
        <Button onClick={handlePreview}>预览导入</Button>
        <Button loading={submitting} type="primary" onClick={handleImport}>
          导入数据集
        </Button>
      </Space>
      <Table
        columns={[
          { title: "外部 ID", dataIndex: "external_id", key: "external_id", render: (id) => id || "无" },
          {
            title: "Payload 字段",
            key: "payload",
            render: (_: unknown, record: ItemImportEntry) => Object.keys(record.payload).join(", ") || "无",
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
