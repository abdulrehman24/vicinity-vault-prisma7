"use client";

import SafeIcon from "@/src/common/SafeIcon";

export default function ConfirmDialog({
  open,
  title = "Are you sure?",
  description = "",
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  confirmingLabel = null,
  isConfirming = false,
  onCancel,
  onConfirm
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl">
      <div className="w-full max-w-md bg-[#3d4a55] rounded-[2rem] border border-white/10 shadow-[0_40px_90px_rgba(0,0,0,0.6)] p-8">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center shrink-0">
            <SafeIcon name="AlertTriangle" className="text-red-300 text-xl" />
          </div>
          <div className="text-left">
            <h3 className="text-2xl font-bold text-white tracking-tight">{title}</h3>
            {description && <p className="text-sm text-vicinity-peach/60 mt-2 leading-relaxed">{description}</p>}
          </div>
        </div>

        <div className="mt-8 flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={isConfirming}
            className="flex-1 px-5 py-4 rounded-2xl bg-white/10 text-white/70 font-black uppercase tracking-widest text-xs disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isConfirming}
            className="flex-1 px-5 py-4 rounded-2xl bg-red-500 text-white font-black uppercase tracking-widest text-xs hover:bg-red-400 disabled:opacity-60"
          >
            {isConfirming ? confirmingLabel || "Deleting..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
