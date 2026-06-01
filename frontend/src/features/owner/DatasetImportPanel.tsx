import { Alert, Button, Input, Radio, Space, Table, Tag, Typography } from "antd";
import type { RadioChangeEvent } from "antd";
import { useMemo, useState } from "react";

import { importItems, previewImportItems } from "./api";
import type {
  ExcelImportMapping,
  ImportFormat,
  ImportRowIssue,
  ItemImportPreviewRequest,
  ItemImportPreviewRow,
  TaskItemRead,
} from "./types";

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

type ImportMode = "paste" | "file";

type EditablePreviewRow = ItemImportPreviewRow & {
  key: string;
  removed: boolean;
};

const defaultExcelMapping: ExcelImportMapping = {
  external_id_column: "external_id",
  payload_column: "payload",
  payload_columns: null,
};

export function DatasetImportPanel({ taskId, onImported }: DatasetImportPanelProps) {
  const [mode, setMode] = useState<ImportMode>("paste");
  const [pasteFormat, setPasteFormat] = useState<ImportFormat>("json_array");
  const [pasteValue, setPasteValue] = useState(sample);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [excelMapping, setExcelMapping] = useState<ExcelImportMapping>(defaultExcelMapping);
  const [previewRows, setPreviewRows] = useState<EditablePreviewRow[]>([]);
  const [previewErrors, setPreviewErrors] = useState<ImportRowIssue[]>([]);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [renameFrom, setRenameFrom] = useState("");
  const [renameTo, setRenameTo] = useState("");
  const [previewing, setPreviewing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const visibleRows = previewRows.filter((row) => !row.removed);
  const validRows = visibleRows.filter((row) => row.errors.length === 0);
  const payloadKeys = useMemo(() => collectPayloadKeys(visibleRows), [visibleRows]);
  const fileFormat = selectedFile ? detectFileFormat(selectedFile.name) : null;

  async function handlePreview() {
    setPreviewing(true);
    setPreviewError(null);
    setCommitError(null);
    try {
      const request = await buildPreviewRequest();
      const response = await previewImportItems(taskId, request);
      setPreviewRows(
        response.rows.map((row, index) => ({
          ...row,
          key: `${row.row_number}-${index}`,
          removed: false,
        })),
      );
      setPreviewErrors(response.errors);
    } catch (err) {
      setPreviewRows([]);
      setPreviewErrors([]);
      setPreviewError(err instanceof Error ? err.message : "导入预览失败。");
    } finally {
      setPreviewing(false);
    }
  }

  async function handleImport() {
    if (validRows.length === 0) {
      setCommitError("没有可提交的有效行。请先生成预览，或移除/修正无效行。");
      return;
    }

    setSubmitting(true);
    setCommitError(null);
    try {
      const imported = await importItems(
        taskId,
        validRows.map((row) => ({
          external_id: normalizeExternalId(row.external_id),
          payload: row.payload,
          source_row: row.row_number,
        })),
      );
      onImported(imported);
    } catch (err) {
      setCommitError(err instanceof Error ? err.message : "导入数据项失败。");
    } finally {
      setSubmitting(false);
    }
  }

  async function buildPreviewRequest(): Promise<ItemImportPreviewRequest> {
    if (mode === "paste") {
      return {
        format: pasteFormat,
        content: pasteValue,
        is_base64: false,
        excel_mapping: excelMapping,
      };
    }

    if (!selectedFile) {
      throw new Error("请选择要上传的 .json、.jsonl 或 .xlsx 文件。");
    }

    const format = detectFileFormat(selectedFile.name);
    if (!format) {
      throw new Error("仅支持 .json、.jsonl、.xlsx 文件。");
    }

    return {
      format,
      filename: selectedFile.name,
      content: format === "xlsx" ? await readFileAsBase64(selectedFile) : await readFileAsText(selectedFile),
      is_base64: format === "xlsx",
      excel_mapping: normalizedExcelMapping(excelMapping),
    };
  }

  function updateExternalId(rowKey: string, value: string) {
    setPreviewRows((current) =>
      current.map((row) => (row.key === rowKey ? { ...row, external_id: normalizeExternalId(value) } : row)),
    );
  }

  function updatePayloadCell(rowKey: string, payloadKey: string, value: string) {
    setPreviewRows((current) =>
      current.map((row) =>
        row.key === rowKey
          ? { ...row, payload: { ...row.payload, [payloadKey]: parseCellValue(value) } }
          : row,
      ),
    );
  }

  function removeRow(rowKey: string) {
    setPreviewRows((current) =>
      current.map((row) => (row.key === rowKey ? { ...row, removed: true } : row)),
    );
  }

  function applyPayloadRename() {
    const source = renameFrom.trim();
    const target = renameTo.trim();
    if (!source || !target) {
      setPreviewError("请输入原 Payload Key 和新 Payload Key。");
      return;
    }
    setPreviewError(null);
    setPreviewRows((current) =>
      current.map((row) => {
        if (row.removed || !Object.prototype.hasOwnProperty.call(row.payload, source)) {
          return row;
        }
        const { [source]: value, ...rest } = row.payload;
        return { ...row, payload: { ...rest, [target]: value } };
      }),
    );
  }

  return (
    <section className="ops-card" aria-labelledby="dataset-import-heading">
      <Typography.Title id="dataset-import-heading" level={3}>
        数据集导入
      </Typography.Title>
      {previewError ? <Alert className="section-alert" message="解析/验证错误" description={previewError} type="error" /> : null}
      {previewErrors.length > 0 ? (
        <Alert
          className="section-alert"
          message="解析/验证错误"
          description={<IssueList issues={previewErrors} />}
          type="warning"
        />
      ) : null}
      {commitError ? <Alert className="section-alert" message="后端创建错误" description={commitError} type="error" /> : null}

      <Radio.Group
        aria-label="导入方式"
        value={mode}
        onChange={(event: RadioChangeEvent) => setMode(event.target.value as ImportMode)}
      >
        <Radio value="paste" aria-label="粘贴导入">
          粘贴导入
        </Radio>
        <Radio value="file" aria-label="文件上传">
          文件上传
        </Radio>
      </Radio.Group>

      {mode === "paste" ? (
        <>
          <Radio.Group
            aria-label="粘贴格式"
            value={pasteFormat}
            onChange={(event: RadioChangeEvent) => setPasteFormat(event.target.value as ImportFormat)}
          >
            <Radio value="json_array">JSON 数组</Radio>
            <Radio value="jsonl">JSONL</Radio>
          </Radio.Group>
          <label className="schema-control">
            <span>粘贴数据</span>
            <Input.TextArea
              value={pasteValue}
              rows={10}
              onChange={(event) => setPasteValue(event.target.value)}
            />
          </label>
        </>
      ) : (
        <div className="import-file-stack">
          <label className="schema-control">
            <span>上传数据文件</span>
            <input
              aria-label="上传数据文件"
              accept=".json,.jsonl,.xlsx"
              type="file"
              onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
            />
          </label>
          {fileFormat === "xlsx" ? (
            <div className="import-mapping-grid">
              <label className="schema-control">
                <span>外部 ID 列</span>
                <Input
                  value={excelMapping.external_id_column}
                  onChange={(event) =>
                    setExcelMapping((current) => ({ ...current, external_id_column: event.target.value }))
                  }
                />
              </label>
              <label className="schema-control">
                <span>Payload JSON 列</span>
                <Input
                  value={excelMapping.payload_column ?? ""}
                  onChange={(event) =>
                    setExcelMapping((current) => ({
                      ...current,
                      payload_column: event.target.value.trim() || null,
                    }))
                  }
                />
              </label>
              <label className="schema-control">
                <span>Payload 选择列</span>
                <Input
                  value={excelMapping.payload_columns?.join(", ") ?? ""}
                  onChange={(event) =>
                    setExcelMapping((current) => ({
                      ...current,
                      payload_columns: splitColumns(event.target.value),
                    }))
                  }
                />
              </label>
            </div>
          ) : null}
        </div>
      )}

      <Space className="section-actions">
        <Button loading={previewing} onClick={handlePreview}>生成预览</Button>
        <Button disabled={validRows.length === 0} loading={submitting} type="primary" onClick={handleImport}>
          提交有效行
        </Button>
      </Space>

      <div className="import-batch-tools">
        <Typography.Text strong>批量编辑</Typography.Text>
        <label className="schema-control compact-control">
          <span>原 Payload Key</span>
          <Input value={renameFrom} onChange={(event) => setRenameFrom(event.target.value)} />
        </label>
        <label className="schema-control compact-control">
          <span>新 Payload Key</span>
          <Input value={renameTo} onChange={(event) => setRenameTo(event.target.value)} />
        </label>
        <Button onClick={applyPayloadRename}>批量重命名</Button>
      </div>

      <Table
        columns={[
          { title: "源行", dataIndex: "row_number", key: "row_number", width: 80 },
          {
            title: "外部 ID",
            dataIndex: "external_id",
            key: "external_id",
            width: 220,
            render: (_: unknown, record: EditablePreviewRow) => (
              <Space direction="vertical" size={4}>
                <Input
                  aria-label={`第 ${record.row_number} 行 external_id`}
                  value={record.external_id ?? ""}
                  onChange={(event) => updateExternalId(record.key, event.target.value)}
                />
                <Typography.Text type="secondary">{record.external_id || "空"}</Typography.Text>
              </Space>
            ),
          },
          {
            title: "状态",
            key: "issues",
            width: 220,
            render: (_: unknown, record: EditablePreviewRow) => (
              <IssueTags errors={record.errors} warnings={record.warnings} />
            ),
          },
          ...payloadKeys.map((payloadKey) => ({
            title: `payload.${payloadKey}`,
            key: `payload.${payloadKey}`,
            width: 180,
            render: (_: unknown, record: EditablePreviewRow) => (
              <Input
                aria-label={`第 ${record.row_number} 行 payload.${payloadKey}`}
                value={cellToText(record.payload[payloadKey])}
                onChange={(event) => updatePayloadCell(record.key, payloadKey, event.target.value)}
              />
            ),
          })),
          {
            title: "操作",
            key: "actions",
            width: 90,
            render: (_: unknown, record: EditablePreviewRow) => (
              <Button aria-label={`移除第 ${record.row_number} 行`} size="small" onClick={() => removeRow(record.key)}>
                移除
              </Button>
            ),
          },
        ]}
        dataSource={visibleRows}
        pagination={false}
        rowKey="key"
        scroll={{ x: "max-content" }}
        size="small"
      />
    </section>
  );
}

function IssueList({ issues }: { issues: ImportRowIssue[] }) {
  return (
    <ul className="import-issue-list">
      {issues.map((issue, index) => (
        <li key={`${issue.row_number}-${issue.field}-${issue.code}-${index}`}>
          {formatIssue(issue)}
        </li>
      ))}
    </ul>
  );
}

function IssueTags({ errors, warnings }: { errors: ImportRowIssue[]; warnings: ImportRowIssue[] }) {
  if (errors.length === 0 && warnings.length === 0) {
    return <Tag color="green">有效</Tag>;
  }
  return (
    <Space direction="vertical" size={4}>
      {errors.map((error, index) => (
        <Tag color="red" key={`error-${index}`}>
          {error.message}
        </Tag>
      ))}
      {warnings.map((warning, index) => (
        <Tag color="gold" key={`warning-${index}`}>
          {warning.message}
        </Tag>
      ))}
    </Space>
  );
}

function formatIssue(issue: ImportRowIssue) {
  const row = issue.row_number ? `第 ${issue.row_number} 行` : "文件";
  const field = issue.field ? ` ${issue.field}` : "";
  return `${row}${field}: ${issue.message}`;
}

function detectFileFormat(fileName: string): ImportFormat | null {
  const lowerName = fileName.toLowerCase();
  if (lowerName.endsWith(".json")) {
    return "json_array";
  }
  if (lowerName.endsWith(".jsonl")) {
    return "jsonl";
  }
  if (lowerName.endsWith(".xlsx")) {
    return "xlsx";
  }
  return null;
}

function readFileAsText(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("文件读取失败。"));
    reader.readAsText(file);
  });
}

function readFileAsBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      resolve(result.includes(",") ? result.split(",")[1] : result);
    };
    reader.onerror = () => reject(new Error("文件读取失败。"));
    reader.readAsDataURL(file);
  });
}

function normalizedExcelMapping(mapping: ExcelImportMapping): ExcelImportMapping {
  return {
    external_id_column: mapping.external_id_column.trim() || "external_id",
    payload_column: mapping.payload_column?.trim() || null,
    payload_columns: mapping.payload_columns?.length ? mapping.payload_columns : null,
  };
}

function splitColumns(value: string) {
  const columns = value
    .split(",")
    .map((column) => column.trim())
    .filter(Boolean);
  return columns.length > 0 ? columns : null;
}

function collectPayloadKeys(rows: EditablePreviewRow[]) {
  const keys = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row.payload)) {
      keys.add(key);
    }
  }
  return Array.from(keys);
}

function normalizeExternalId(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized || null;
}

function parseCellValue(value: string): unknown {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return value;
  }
}

function cellToText(value: unknown) {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
}
