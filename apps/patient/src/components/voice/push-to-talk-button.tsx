interface PushToTalkButtonProps {
  onStart: () => void;
  onEnd: () => void;
  isRecording: boolean;
  disabled: boolean;
}

export function PushToTalkButton({
  onStart,
  onEnd,
  isRecording,
  disabled,
}: PushToTalkButtonProps) {
  return (
    <button
      onPointerDown={(e) => {
        e.preventDefault();
        if (!disabled) onStart();
      }}
      onPointerUp={(e) => {
        e.preventDefault();
        if (isRecording) onEnd();
      }}
      onPointerLeave={() => {
        if (isRecording) onEnd();
      }}
      disabled={disabled}
      className={`
        w-20 h-20 rounded-full flex items-center justify-center
        transition-all duration-200 select-none touch-none
        ${
          isRecording
            ? "bg-red-500 scale-110 shadow-lg shadow-red-200"
            : disabled
            ? "bg-gray-300 cursor-not-allowed"
            : "bg-blue-600 hover:bg-blue-700 active:scale-95 shadow-md"
        }
      `}
    >
      <span className="text-white text-3xl">
        {isRecording ? "⏹" : "🎤"}
      </span>
    </button>
  );
}
