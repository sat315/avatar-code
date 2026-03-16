import { Wrench, Check, X } from "lucide-react";

/** ツール承認リクエスト */
export interface PermissionRequest {
  toolUseId: string;
  toolName: string;
  input: unknown;
}

interface ToolApprovalBarProps {
  requests: PermissionRequest[];
  onApprove: (toolUseId: string) => void;
  onReject: (toolUseId: string) => void;
}

/** ツール承認バー（チャット下部に表示） */
export function ToolApprovalBar({ requests, onApprove, onReject }: ToolApprovalBarProps) {
  if (requests.length === 0) return null;

  return (
    <div className="border-t border-yellow-300 bg-yellow-50 px-2 py-2 sm:px-4">
      <div className="mx-auto max-w-3xl space-y-2">
        {requests.map((req) => (
          <div key={req.toolUseId} className="rounded-xl border border-yellow-200 bg-white p-3">
            <div className="mb-2 flex items-center gap-2">
              <Wrench size={14} />
              <span className="text-sm font-semibold text-yellow-800">{req.toolName}</span>
            </div>
            <p className="mb-3 line-clamp-2 text-xs text-yellow-600 break-all">
              {JSON.stringify(req.input).slice(0, 200)}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => onApprove(req.toolUseId)}
                className="flex-1 rounded-lg bg-green-500 py-2 text-sm font-semibold text-white transition hover:bg-green-600 active:scale-[0.98]"
              >
                <Check size={14} className="inline" /> 許可
              </button>
              <button
                onClick={() => onReject(req.toolUseId)}
                className="flex-1 rounded-lg bg-red-500 py-2 text-sm font-semibold text-white transition hover:bg-red-600 active:scale-[0.98]"
              >
                <X size={14} className="inline" /> 拒否
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
