import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge Tailwind class names, letting later conditional classes win over
 * earlier ones. The standard clsx + tailwind-merge pairing (MIT licences).
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}