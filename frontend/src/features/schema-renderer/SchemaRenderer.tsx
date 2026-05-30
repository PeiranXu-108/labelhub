import { Alert, Button, Checkbox, Input, InputNumber, Radio, Rate, Select, Space, Typography } from "antd";
import { type ChangeEvent, useEffect, useMemo, useState } from "react";

import { fetchWithAuth, readError } from "../auth/http";
import type {
  AnswerPayload,
  FileUploadField,
  ImageUploadField,
  OptionField,
  RendererItem,
  RichTextField,
  TemplateField,
  TemplateSchemaDocument,
  UploadAssetAnswer,
} from "./types";

export type SchemaRendererProps = {
  schema: TemplateSchemaDocument;
  item: RendererItem;
  initialAnswers?: AnswerPayload;
  readOnly?: boolean;
  uploadContext?: {
    assignmentId: string;
  };
  onChange?: (answers: AnswerPayload) => void;
  onSubmit?: (answers: AnswerPayload) => void;
};

function resolveItemPath(item: RendererItem, source: string): unknown {
  if (!source.startsWith("item.payload.")) {
    return undefined;
  }
  return source
    .slice("item.payload.".length)
    .split(".")
    .reduce<unknown>((current, segment) => {
      if (current && typeof current === "object" && segment in current) {
        return (current as Record<string, unknown>)[segment];
      }
      return undefined;
    }, item.payload);
}

function isEmpty(value: unknown): boolean {
  if (value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0)) {
    return true;
  }
  if (isRichTextAnswer(value)) {
    return !value.content.trim();
  }
  return false;
}

function displayValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (value == null) {
    return "";
  }
  return JSON.stringify(value, null, 2);
}

function plainTextFromMarkdown(markdown: string) {
  return markdown
    .replace(/[*_`>#\-[\]()!]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s+([.,;:!?])/g, "$1")
    .trim();
}

function richTextAnswer(content: string) {
  return {
    format: "markdown",
    content,
    plainText: plainTextFromMarkdown(content),
  };
}

function isRichTextAnswer(value: unknown): value is { format: "markdown"; content: string; plainText?: string } {
  return Boolean(
    value &&
      typeof value === "object" &&
      (value as { format?: unknown }).format === "markdown" &&
      typeof (value as { content?: unknown }).content === "string",
  );
}

function uploadAssets(value: unknown): UploadAssetAnswer[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(isUploadAssetAnswer);
}

function isUploadAssetAnswer(value: unknown): value is UploadAssetAnswer {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof (value as UploadAssetAnswer).assetId === "string" &&
      typeof (value as UploadAssetAnswer).filename === "string" &&
      typeof (value as UploadAssetAnswer).contentType === "string" &&
      typeof (value as UploadAssetAnswer).sizeBytes === "number" &&
      typeof (value as UploadAssetAnswer).downloadUrl === "string",
  );
}

export function validateAnswers(
  schema: TemplateSchemaDocument,
  answers: AnswerPayload,
): Record<string, string> {
  const errors: Record<string, string> = {};
  schema.fields.forEach((field) => {
    if (field.type === "show_item" || field.type === "llm_trigger") {
      return;
    }
    if (field.required && isEmpty(answers[field.id])) {
      errors[field.id] = `请填写${field.label}`;
      return;
    }
    if (field.type === "rich_text" && !isEmpty(answers[field.id])) {
      const currentAnswer = answers[field.id];
      const answer = richTextAnswer(isRichTextAnswer(currentAnswer) ? currentAnswer.content : "");
      if (field.minLength != null && answer.plainText.length < field.minLength) {
        errors[field.id] = `${field.label}至少需要 ${field.minLength} 个字符`;
      }
      if (field.maxLength != null && answer.plainText.length > field.maxLength) {
        errors[field.id] = `${field.label}不能超过 ${field.maxLength} 个字符`;
      }
    }
    if ((field.type === "image_upload" || field.type === "file_upload") && !isEmpty(answers[field.id])) {
      const assets = uploadAssets(answers[field.id]);
      if (assets.length > field.maxCount) {
        errors[field.id] = `${field.label}最多上传 ${field.maxCount} 个文件`;
      }
    }
  });
  return errors;
}

export function SchemaRenderer({
  schema,
  item,
  initialAnswers,
  readOnly = false,
  uploadContext,
  onChange,
  onSubmit,
}: SchemaRendererProps) {
  const [answers, setAnswers] = useState<AnswerPayload>(initialAnswers ?? {});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const answerableFields = useMemo(
    () => schema.fields.filter((field) => field.type !== "show_item" && field.type !== "llm_trigger"),
    [schema.fields],
  );

  function updateAnswer(fieldId: string, value: unknown) {
    setAnswers((currentAnswers) => {
      const nextAnswers = { ...currentAnswers, [fieldId]: value };
      onChange?.(nextAnswers);
      return nextAnswers;
    });
    setErrors((current) => {
      const nextErrors = { ...current };
      delete nextErrors[fieldId];
      return nextErrors;
    });
  }

  function handleSubmit() {
    const nextErrors = validateAnswers(schema, answers);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length === 0) {
      onSubmit?.(answers);
    }
  }

  return (
    <section className="schema-renderer" aria-label={schema.title}>
      <Typography.Title level={3}>{schema.title}</Typography.Title>
      <div className="schema-renderer-fields">
        {schema.fields.map((field) => (
          <div className="schema-field" key={field.id}>
            {renderField(field, item, answers, updateAnswer, readOnly, uploadContext)}
            {errors[field.id] ? <div className="field-error">{errors[field.id]}</div> : null}
          </div>
        ))}
      </div>
      {!readOnly && answerableFields.length > 0 ? (
        <Button type="primary" onClick={handleSubmit}>
          提交
        </Button>
      ) : null}
    </section>
  );
}

function renderField(
  field: TemplateField,
  item: RendererItem,
  answers: AnswerPayload,
  updateAnswer: (fieldId: string, value: unknown) => void,
  readOnly: boolean,
  uploadContext: SchemaRendererProps["uploadContext"] | undefined,
) {
  if (field.type === "show_item") {
    return (
      <>
        <Typography.Text strong>{field.label}</Typography.Text>
        <pre className="show-item-value">{displayValue(resolveItemPath(item, field.source))}</pre>
      </>
    );
  }

  if (field.type === "text") {
    return (
      <label className="schema-control">
        <span>{field.label}</span>
        <Input
          disabled={readOnly}
          placeholder={field.placeholder ?? undefined}
          value={(answers[field.id] as string | undefined) ?? ""}
          onChange={(event) => updateAnswer(field.id, event.target.value)}
        />
      </label>
    );
  }

  if (field.type === "textarea") {
    return (
      <label className="schema-control">
        <span>{field.label}</span>
        <Input.TextArea
          disabled={readOnly}
          placeholder={field.placeholder ?? undefined}
          value={(answers[field.id] as string | undefined) ?? ""}
          onChange={(event) => updateAnswer(field.id, event.target.value)}
        />
      </label>
    );
  }

  if (field.type === "rich_text") {
    const currentAnswer = answers[field.id];
    const value = isRichTextAnswer(currentAnswer) ? currentAnswer.content : "";
    if (readOnly) {
      return (
        <div className="schema-control">
          <span>{field.label}</span>
          <pre className="show-item-value">{value}</pre>
        </div>
      );
    }
    return (
      <label className="schema-control">
        <span>{field.label}</span>
        <Input.TextArea
          aria-label={field.label}
          placeholder={field.placeholder ?? undefined}
          value={value}
          onChange={(event) => updateAnswer(field.id, richTextAnswer(event.target.value))}
        />
      </label>
    );
  }

  if (field.type === "image_upload" || field.type === "file_upload") {
    return (
      <MediaUploadControl
        field={field}
        readOnly={readOnly}
        uploadContext={uploadContext}
        value={uploadAssets(answers[field.id])}
        onChange={(value) => updateAnswer(field.id, value)}
      />
    );
  }

  if (field.type === "number") {
    return (
      <label className="schema-control">
        <span>{field.label}</span>
        <InputNumber
          disabled={readOnly}
          min={field.min ?? undefined}
          max={field.max ?? undefined}
          value={answers[field.id] as number | undefined}
          onChange={(value) => updateAnswer(field.id, value)}
        />
      </label>
    );
  }

  if (field.type === "radio") {
    return (
      <div className="schema-control">
        <span>{field.label}</span>
        <Radio.Group
          disabled={readOnly}
          value={answers[field.id] as string | undefined}
          onChange={(event) => updateAnswer(field.id, event.target.value)}
        >
          <Space direction="vertical">{renderOptions(field)}</Space>
        </Radio.Group>
      </div>
    );
  }

  if (field.type === "checkbox_group") {
    return (
      <div className="schema-control">
        <span>{field.label}</span>
        <Checkbox.Group
          disabled={readOnly}
          options={field.options}
          value={(answers[field.id] as string[] | undefined) ?? []}
          onChange={(value) => updateAnswer(field.id, value)}
        />
      </div>
    );
  }

  if (field.type === "select") {
    return (
      <label className="schema-control">
        <span>{field.label}</span>
        <Select
          disabled={readOnly}
          options={field.options}
          value={answers[field.id] as string | undefined}
          onChange={(value) => updateAnswer(field.id, value)}
        />
      </label>
    );
  }

  if (field.type === "rating") {
    return (
      <div className="schema-control">
        <span>{field.label}</span>
        <Rate
          disabled={readOnly}
          count={field.max ?? 5}
          value={(answers[field.id] as number | undefined) ?? 0}
          onChange={(value) => updateAnswer(field.id, value)}
        />
      </div>
    );
  }

  if (field.type === "json") {
    return (
      <label className="schema-control">
        <span>{field.label}</span>
        <Input.TextArea
          disabled={readOnly}
          value={
            answers[field.id] === undefined
              ? ""
              : JSON.stringify(answers[field.id], null, 2)
          }
          onChange={(event) => {
            try {
              updateAnswer(field.id, JSON.parse(event.target.value));
            } catch {
              updateAnswer(field.id, event.target.value);
            }
          }}
        />
      </label>
    );
  }

  return (
    <div className="schema-control">
      <span>{field.label}</span>
      <Button disabled={readOnly}>{field.label}</Button>
    </div>
  );
}

function renderOptions(field: OptionField) {
  return field.options.map((option) => (
    <Radio key={option.value} value={option.value}>
      {option.label}
    </Radio>
  ));
}

type MediaUploadControlProps = {
  field: ImageUploadField | FileUploadField;
  readOnly: boolean;
  uploadContext: SchemaRendererProps["uploadContext"] | undefined;
  value: UploadAssetAnswer[];
  onChange: (value: UploadAssetAnswer[]) => void;
};

function MediaUploadControl({
  field,
  readOnly,
  uploadContext,
  value,
  onChange,
}: MediaUploadControlProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const accept = [...field.acceptedMimeTypes, ...(field.type === "file_upload" ? field.acceptedExtensions ?? [] : [])]
    .filter(Boolean)
    .join(",");

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!files.length || readOnly) {
      return;
    }
    if (!uploadContext) {
      setError("当前页面缺少上传上下文。");
      return;
    }
    setError(null);
    setUploading(true);
    try {
      const remainingSlots = Math.max(0, field.maxCount - value.length);
      const selectedFiles = files.slice(0, remainingSlots);
      const uploaded = await Promise.all(
        selectedFiles.map((file) => uploadAsset(uploadContext.assignmentId, field.id, file)),
      );
      onChange([...value, ...uploaded]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "上传失败。");
    } finally {
      setUploading(false);
    }
  }

  function removeAsset(assetId: string) {
    onChange(value.filter((asset) => asset.assetId !== assetId));
  }

  return (
    <div className="schema-control media-upload-control">
      <span>{field.label}</span>
      {field.helpText ? <Typography.Text type="secondary">{field.helpText}</Typography.Text> : null}
      {field.type === "image_upload" ? (
        <div className="media-preview-grid">
          {value.map((asset) => (
            <div className="media-asset" key={asset.assetId}>
              <AuthenticatedImage asset={asset} label={field.label} />
              <Typography.Text>{asset.filename}</Typography.Text>
              {!readOnly ? (
                <Button size="small" onClick={() => removeAsset(asset.assetId)}>
                  移除
                </Button>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <div className="media-file-list">
          {value.map((asset) => (
            <div className="media-file-row" key={asset.assetId}>
              <Typography.Text>{asset.filename}</Typography.Text>
              <Typography.Text type="secondary">{formatBytes(asset.sizeBytes)}</Typography.Text>
              <Button size="small" onClick={() => void downloadAsset(asset)}>
                下载 {asset.filename}
              </Button>
              {!readOnly ? (
                <Button size="small" onClick={() => removeAsset(asset.assetId)}>
                  移除
                </Button>
              ) : null}
            </div>
          ))}
        </div>
      )}
      {!readOnly && value.length < field.maxCount ? (
        <label className="media-upload-input">
          <span>上传 {field.label}</span>
          <input
            aria-label={`上传 ${field.label}`}
            accept={accept || undefined}
            disabled={uploading}
            multiple={field.maxCount > 1}
            type="file"
            onChange={(event) => void handleFileChange(event)}
          />
        </label>
      ) : null}
      {!readOnly ? (
        <Typography.Text type="secondary">
          最多 {field.maxCount} 个文件，单个不超过 {formatBytes(field.maxFileSizeBytes)}
        </Typography.Text>
      ) : null}
      {error ? <Alert message={error} type="error" /> : null}
    </div>
  );
}

function AuthenticatedImage({ asset, label }: { asset: UploadAssetAnswer; label: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    fetchWithAuth(asset.downloadUrl, { method: "GET" })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(await readError(response));
        }
        return response.blob();
      })
      .then((blob) => {
        if (!active) {
          return;
        }
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      })
      .catch(() => {
        if (active) {
          setError(true);
        }
      });
    return () => {
      active = false;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [asset.downloadUrl]);

  if (error) {
    return <Typography.Text type="secondary">图片预览不可用</Typography.Text>;
  }
  if (!src) {
    return <Typography.Text type="secondary">加载预览...</Typography.Text>;
  }
  return <img alt={`${label} preview ${asset.filename}`} className="media-image-preview" src={src} />;
}

async function uploadAsset(assignmentId: string, fieldId: string, file: File): Promise<UploadAssetAnswer> {
  const form = new FormData();
  form.append("field_id", fieldId);
  form.append("file", file);
  const response = await fetchWithAuth(`/labeler/assignments/${assignmentId}/uploads`, {
    method: "POST",
    body: form,
  });
  if (!response.ok) {
    throw new Error(await readError(response));
  }
  const payload = (await response.json()) as UploadAssetResponse;
  return {
    assetId: payload.id,
    filename: payload.filename,
    contentType: payload.content_type,
    sizeBytes: payload.size_bytes,
    downloadUrl: payload.download_url,
  };
}

async function downloadAsset(asset: UploadAssetAnswer) {
  const response = await fetchWithAuth(asset.downloadUrl, { method: "GET" });
  if (!response.ok) {
    throw new Error(await readError(response));
  }
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = asset.filename;
  anchor.click();
  URL.revokeObjectURL(objectUrl);
}

function formatBytes(sizeBytes: number) {
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  }
  if (sizeBytes < 1024 * 1024) {
    return `${(sizeBytes / 1024).toFixed(1)} KiB`;
  }
  return `${(sizeBytes / 1024 / 1024).toFixed(1)} MiB`;
}

type UploadAssetResponse = {
  id: string;
  filename: string;
  content_type: string;
  size_bytes: number;
  download_url: string;
};
