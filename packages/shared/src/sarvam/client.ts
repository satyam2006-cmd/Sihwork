const SARVAM_BASE_URL = 'https://api.sarvam.ai';

export function getSarvamConfig() {
  return {
    baseUrl: SARVAM_BASE_URL,
    apiKey: process.env.SARVAM_API_KEY!,
    headers: {
      'api-subscription-key': process.env.SARVAM_API_KEY!,
      'Content-Type': 'application/json',
    },
  };
}
