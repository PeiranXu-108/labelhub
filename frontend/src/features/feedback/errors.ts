import { formatLabel } from "../i18n/labels";

const defaultFallback = "操作失败，请稍后重试。";

const knownMessages: Record<string, string> = {
  INVALID_CREDENTIALS: "邮箱或密码不正确。",
  InvalidEmailOrPassword: "邮箱或密码不正确。",
  "Invalid email or password": "邮箱或密码不正确。",
  "Only draft submissions can be edited": "只有草稿状态的提交可以编辑。",
  "Only failed AI review runs can be retried": "只有失败的 AI 审核运行可以重试。",
  "Save a template draft before publishing": "请先保存模板草稿再发布。",
  TEMPLATE_DRAFT_REQUIRED: "请先保存模板草稿再发布。",
};

function extractMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  if (error && typeof error === "object") {
    const maybeError = error as {
      message?: unknown;
      code?: unknown;
      detail?: { message?: unknown; code?: unknown };
    };
    if (typeof maybeError.detail?.message === "string") {
      return maybeError.detail.message;
    }
    if (typeof maybeError.detail?.code === "string") {
      return maybeError.detail.code;
    }
    if (typeof maybeError.message === "string") {
      return maybeError.message;
    }
    if (typeof maybeError.code === "string") {
      return maybeError.code;
    }
  }
  return "";
}

function looksTechnicalOrEnglish(message: string): boolean {
  return (
    /[A-Za-z]/.test(message) ||
    /\b\d{3}\s+[A-Z]/.test(message) ||
    /https?:\/\//.test(message) ||
    /\/[A-Za-z0-9._~:/?#[\]@!$&'()*+,;=-]+/.test(message)
  );
}

export function normalizeError(error: unknown, fallback = defaultFallback): string {
  const rawMessage = extractMessage(error).trim();
  if (!rawMessage) {
    return fallback;
  }

  const directMatch = knownMessages[rawMessage];
  if (directMatch) {
    return directMatch;
  }

  const transitionMatch = rawMessage.match(/^Cannot apply ([\w-]+) to \w+ in ([\w-]+)$/);
  if (transitionMatch) {
    const [, action, status] = transitionMatch;
    const statusLabel = formatLabel(status);
    const actionLabel = formatLabel(action);
    if (action === "submit") {
      return `当前状态为${statusLabel}，不能重复提交。`;
    }
    return `当前状态为${statusLabel}，不能${actionLabel}。`;
  }

  if (looksTechnicalOrEnglish(rawMessage)) {
    return fallback;
  }

  return rawMessage;
}
