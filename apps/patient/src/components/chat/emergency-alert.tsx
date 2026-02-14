interface EmergencyAlertProps {
  details: string | null;
}

export function EmergencyAlert({ details }: EmergencyAlertProps) {
  return (
    <div className="mb-4 rounded-lg border-2 border-red-500 bg-red-50 p-4 animate-pulse">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-2xl">🚨</span>
        <h3 className="text-lg font-bold text-red-800">Emergency Detected</h3>
      </div>
      <p className="text-sm text-red-700 mb-2">
        Based on your symptoms, this may require immediate medical attention.
        Please call emergency services or go to the nearest emergency room.
      </p>
      {details && (
        <p className="text-xs text-red-600 mt-2">{details}</p>
      )}
      <div className="mt-3 flex gap-2">
        <a
          href="tel:911"
          className="inline-flex items-center rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
        >
          Call Emergency (911)
        </a>
        <a
          href="tel:112"
          className="inline-flex items-center rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
        >
          Call Emergency (112)
        </a>
      </div>
    </div>
  );
}
