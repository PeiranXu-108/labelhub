import { Alert, Button, Checkbox, Input, Radio, Space, Table, Tag, Typography } from "antd";
import { useEffect, useState } from "react";

import { normalizeError, useOperationMessage } from "../feedback";
import { createExportJob, downloadExportJob, listExportJobs } from "../owner/api";
import { formatLabel } from "../i18n/labels";
import type { ExportFormat, ExportJobRead } from "../owner/types";

type ExportCenterProps = {
  taskId: string;
  jobs?: ExportJobRead[];
  onJobsChanged?: (jobs: ExportJobRead[]) => void;
};

const defaultMapping = JSON.stringify(
  {
    "item.external_id": "external_id",
    "item.payload.text": "text",
    "answers.sentiment": "label",
  },
  null,
  2,
);

export function ExportCenter({ taskId, jobs, onJobsChanged }: ExportCenterProps) {
  const showOperationError = useOperationMessage();
  const [format, setFormat] = useState<ExportFormat>("csv");
  const [mappingText, setMappingText] = useState(defaultMapping);
  const [includeReviewMetadata, setIncludeReviewMetadata] = useState(true);
  const [localJobs, setLocalJobs] = useState<ExportJobRead[]>(jobs ?? []);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (jobs) {
      setLocalJobs(jobs);
      return;
    }
    setLoading(true);
    listExportJobs(taskId)
      .then(setLocalJobs)
      .catch((err) => setError(normalizeError(err, "加载导出任务失败。")))
      .finally(() => setLoading(false));
  }, [jobs, taskId]);

  async function handleCreate() {
    let fieldMapping: Record<string, string>;
    try {
      const parsed = JSON.parse(mappingText || "{}") as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        setError("字段映射必须是 JSON 对象。");
        return;
      }
      fieldMapping = Object.fromEntries(
        Object.entries(parsed as Record<string, unknown>).map(([key, value]) => [key, String(value)]),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "字段映射必须是有效 JSON。");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const created = await createExportJob(taskId, {
        format,
        field_mapping: fieldMapping,
        include_review_metadata: includeReviewMetadata,
      });
      const nextJobs = [created, ...localJobs];
      setLocalJobs(nextJobs);
      onJobsChanged?.(nextJobs);
    } catch (err) {
      showOperationError(err, "创建导出任务失败。");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDownload(record: ExportJobRead) {
    setDownloadingId(record.id);
    setError(null);
    try {
      const file = await downloadExportJob(record.id);
      const objectUrl = URL.createObjectURL(file.blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = file.filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (err) {
      showOperationError(err, "下载导出文件失败。");
    } finally {
      setDownloadingId(null);
    }
  }

  return (
    <section className="ops-card" aria-labelledby="export-center-heading">
      <Typography.Title id="export-center-heading" level={3}>
        导出中心
      </Typography.Title>
      {error ? <Alert className="section-alert" message={error} type="error" /> : null}
      <div className="form-grid-2">
        <label className="schema-control">
          <span>导出格式</span>
          <Radio.Group
            optionType="button"
            options={[
              { label: "CSV", value: "csv" },
              { label: "JSON", value: "json" },
              { label: "JSONL", value: "jsonl" },
              { label: "XLSX", value: "xlsx" },
            ]}
            value={format}
            onChange={(event) => setFormat(event.target.value)}
          />
        </label>
        <Checkbox checked={includeReviewMetadata} onChange={(event) => setIncludeReviewMetadata(event.target.checked)}>
          包含审核元数据
        </Checkbox>
      </div>
      <label className="schema-control">
        <span>字段映射 JSON</span>
        <Input.TextArea rows={7} value={mappingText} onChange={(event) => setMappingText(event.target.value)} />
      </label>
      <Space className="section-actions">
        <Button loading={submitting} type="primary" onClick={handleCreate}>
          创建导出
        </Button>
      </Space>
      <Table
        columns={[
          { title: "格式", dataIndex: "format", key: "format", render: (format) => formatLabel(format) },
          { title: "状态", dataIndex: "status", key: "status", render: (status) => <Tag>{formatLabel(status)}</Tag> },
          {
            title: "创建时间",
            dataIndex: "created_at",
            key: "created_at",
            render: (value) => new Date(value).toLocaleString(),
          },
          {
            title: "下载",
            key: "download",
            render: (_: unknown, record: ExportJobRead) =>
              record.status === "succeeded" ? (
                <Button
                  loading={downloadingId === record.id}
                  size="small"
                  type="link"
                  onClick={() => void handleDownload(record)}
                >
                  下载
                </Button>
              ) : (
                <Typography.Text type="secondary">{record.error_message || "尚未就绪"}</Typography.Text>
              ),
          },
        ]}
        dataSource={localJobs}
        loading={loading}
        pagination={false}
        rowKey="id"
        scroll={{ x: "max-content" }}
        size="small"
      />
    </section>
  );
}
