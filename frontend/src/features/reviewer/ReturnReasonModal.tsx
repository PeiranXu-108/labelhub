import { Alert, Button, Input, Modal, Space } from "antd";
import { useEffect, useState } from "react";

type ReturnReasonModalProps = {
  open: boolean;
  title: string;
  loading?: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
};

export function ReturnReasonModal({
  open,
  title,
  loading = false,
  onCancel,
  onConfirm,
}: ReturnReasonModalProps) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setReason("");
      setError(null);
    }
  }, [open]);

  function confirm() {
    const trimmed = reason.trim();
    if (!trimmed) {
      setError("必须填写退回原因");
      return;
    }
    onConfirm(trimmed);
  }

  return (
    <Modal footer={null} open={open} title={title} onCancel={onCancel}>
      <Space className="modal-stack" direction="vertical">
        {error ? <Alert message={error} type="error" /> : null}
        <Input.TextArea
          aria-label="退回原因"
          autoSize={{ minRows: 4 }}
          placeholder="说明标注员需要修正的内容"
          value={reason}
          onChange={(event) => {
            setReason(event.target.value);
            setError(null);
          }}
        />
        <div className="drawer-actions">
          <Button onClick={onCancel}>取消</Button>
          <Button danger loading={loading} type="primary" onClick={confirm}>
            退回
          </Button>
        </div>
      </Space>
    </Modal>
  );
}
