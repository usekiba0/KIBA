import axios from 'axios';

const api = axios.create({ baseURL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/v1' });

export async function createSetupIntent(name: string, phoneNumber: string) {
  const { data } = await api.post('/onboarding/setup-intent', { name, phone_number: phoneNumber });
  return data as { client_secret: string; stripe_customer_id: string };
}

export async function submitOnboarding(formData: Record<string, unknown>) {
  const { data } = await api.post('/onboarding/submit', formData);
  return data;
}
