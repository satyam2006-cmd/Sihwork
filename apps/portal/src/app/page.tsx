import { Stethoscope, User } from "lucide-react";

const doctorUrl = process.env.NEXT_PUBLIC_DOCTOR_URL || "http://localhost:3002";
const patientUrl = process.env.NEXT_PUBLIC_PATIENT_URL || "http://localhost:3000";

export default function PortalPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold tracking-tight text-foreground">
          Second Opinion AI
        </h1>
        <p className="mt-3 text-lg text-muted-foreground">
          AI-powered medical second opinion platform
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 w-full max-w-2xl">
        <a
          href={doctorUrl}
          className="group flex flex-col items-center gap-4 rounded-xl border border-border bg-card p-8 shadow-sm transition-all hover:shadow-md hover:border-primary/40 hover:-translate-y-0.5"
        >
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary transition-colors group-hover:bg-primary/20">
            <Stethoscope className="h-8 w-8" />
          </div>
          <div className="text-center">
            <h2 className="text-xl font-semibold text-card-foreground">
              I am a Doctor
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Review patient sessions, clinical notes, and manage care plans
            </p>
          </div>
        </a>

        <a
          href={patientUrl}
          className="group flex flex-col items-center gap-4 rounded-xl border border-border bg-card p-8 shadow-sm transition-all hover:shadow-md hover:border-primary/40 hover:-translate-y-0.5"
        >
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary transition-colors group-hover:bg-primary/20">
            <User className="h-8 w-8" />
          </div>
          <div className="text-center">
            <h2 className="text-xl font-semibold text-card-foreground">
              I am a Patient
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Start a consultation, upload documents, and get AI-powered insights
            </p>
          </div>
        </a>
      </div>
    </div>
  );
}
