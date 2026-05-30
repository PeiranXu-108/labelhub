import { App as AntdApp, message as staticMessage } from "antd";
import { useCallback } from "react";

import { normalizeError } from "./errors";

export function useOperationMessage() {
  const { message } = AntdApp.useApp();

  return useCallback(
    (error: unknown, fallback: string) => {
      const content = normalizeError(error, fallback);
      const messageApi = message ?? staticMessage;
      void messageApi.error({ content });
      return content;
    },
    [message],
  );
}
