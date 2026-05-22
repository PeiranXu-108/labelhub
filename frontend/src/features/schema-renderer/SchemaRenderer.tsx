import { Button, Checkbox, Input, InputNumber, Radio, Rate, Select, Space, Typography } from "antd";
import { useMemo, useState } from "react";

import type {
  AnswerPayload,
  OptionField,
  RendererItem,
  TemplateField,
  TemplateSchemaDocument,
} from "./types";

export type SchemaRendererProps = {
  schema: TemplateSchemaDocument;
  item: RendererItem;
  initialAnswers?: AnswerPayload;
  readOnly?: boolean;
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
  return value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0);
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
      errors[field.id] = `${field.label} is required`;
    }
  });
  return errors;
}

export function SchemaRenderer({
  schema,
  item,
  initialAnswers,
  readOnly = false,
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
    const nextAnswers = { ...answers, [fieldId]: value };
    setAnswers(nextAnswers);
    setErrors((current) => {
      const nextErrors = { ...current };
      delete nextErrors[fieldId];
      return nextErrors;
    });
    onChange?.(nextAnswers);
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
            {renderField(field, item, answers, updateAnswer, readOnly)}
            {errors[field.id] ? <div className="field-error">{errors[field.id]}</div> : null}
          </div>
        ))}
      </div>
      {!readOnly && answerableFields.length > 0 ? (
        <Button type="primary" onClick={handleSubmit}>
          Submit
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
