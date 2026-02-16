import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    const doctorUrl = process.env.DOCTOR_APP_URL || "http://localhost:3002";
    const patientUrl = process.env.PATIENT_APP_URL || "http://localhost:3000";

    return [
      {
        source: "/doctor/:path*",
        destination: `${doctorUrl}/doctor/:path*`,
      },
      {
        source: "/patient/:path*",
        destination: `${patientUrl}/patient/:path*`,
      },
    ];
  },
};

export default nextConfig;
