import axios from 'axios';

const api = axios.create({ baseURL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/v1' });

// Extract server-side validation messages instead of the generic axios error string
api.interceptors.response.use(
  res => res,
  err => {
    if (axios.isAxiosError(err) && err.response?.data) {
      const data = err.response.data as { message?: unknown };
      const msgs = Array.isArray(data.message)
        ? (data.message as string[]).join(' · ')
        : typeof data.message === 'string'
          ? data.message
          : err.message;
      return Promise.reject(new Error(msgs));
    }
    return Promise.reject(err);
  },
);

function normalizePhone(raw: string): string {
  // Strip spaces, dashes, parens, keeping leading +
  const stripped = raw.replace(/[\s\-().]/g, '');

  if (stripped.startsWith('+')) return stripped;

  // Auto-add country code if missing
  const digits = stripped.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;           // US 10-digit
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`; // US with leading 1
  return `+${digits}`;                                       // best-effort for other countries
}

export async function createSetupIntent(name: string, phoneNumber: string) {
  const { data } = await api.post('/onboarding/setup-intent', {
    name,
    phone_number: normalizePhone(phoneNumber),
  });
  return data as { client_secret: string; stripe_customer_id: string };
}

export async function submitOnboarding(formData: Record<string, unknown>) {
  const payload = {
    ...formData,
    phone_number: normalizePhone((formData.phone_number as string) ?? ''),
  };
  const { data } = await api.post('/onboarding/submit', payload);
  return data;
}
