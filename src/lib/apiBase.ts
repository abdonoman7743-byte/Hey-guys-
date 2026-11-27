// Base URL of the Express/Socket.IO backend (Railway). Empty string = same origin.
export const API_BASE_URL: string = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '');
