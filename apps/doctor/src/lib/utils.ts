import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

export function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${basePath}${path}`, init);
}
