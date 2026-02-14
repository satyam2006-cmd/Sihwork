interface AudioVisualizerProps {
  level: number; // 0-1
  isActive: boolean;
}

export function AudioVisualizer({ level, isActive }: AudioVisualizerProps) {
  const size = 120 + level * 40;
  const opacity = isActive ? 0.3 + level * 0.5 : 0.1;

  return (
    <div className="relative flex items-center justify-center" style={{ width: 160, height: 80 }}>
      {/* Pulsing ring */}
      <div
        className="absolute rounded-full transition-all duration-100"
        style={{
          width: size,
          height: size,
          backgroundColor: isActive
            ? `rgba(59, 130, 246, ${opacity})`
            : "rgba(156, 163, 175, 0.1)",
          transform: "translate(-50%, -50%)",
          left: "50%",
          top: "50%",
        }}
      />
      {isActive && (
        <div
          className="absolute rounded-full animate-ping"
          style={{
            width: 60,
            height: 60,
            backgroundColor: "rgba(59, 130, 246, 0.2)",
            transform: "translate(-50%, -50%)",
            left: "50%",
            top: "50%",
          }}
        />
      )}
    </div>
  );
}
